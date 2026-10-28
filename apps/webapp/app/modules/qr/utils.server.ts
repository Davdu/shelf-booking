import type { Organization, Qr, User } from "@prisma/client";
import QRCode, {
  type TypeNumber,
  type ErrorCorrectionLevel,
} from "qrcode-generator";
import { db } from "~/database/db.server";
import type { ErrorLabel } from "~/utils/error";
import { isLikeShelfError, ShelfError } from "~/utils/error";
import { gifToPng } from "~/utils/gif-to-png";
import { addLogoToQrPng, QR_LOGO_ERROR_CORRECTION } from "./qr-logo.server";
import { getQrUrl } from "./qr-url.server";
// eslint-disable-next-line import/no-cycle
import { createQr, getQrByAssetId, getQrByKitId } from "./service.server";

const label: ErrorLabel = "QR";

/**
 * Renders a QR code as a PNG data URL.
 *
 * Every size except `cable` carries the brAIn lab logo in the center and is
 * therefore encoded at error correction H with an automatic version, whatever
 * the stored `version` and `errorCorrection` say. The encoded URL is the same,
 * so labels printed at the stored level keep scanning to the same code. Cable
 * labels are too small for a legible logo and keep the stored settings.
 *
 * @see {@link file://./qr-logo.server.ts}
 */
export async function generateCode({
  version,
  errorCorrection,
  qr,
  size,
}: {
  version: TypeNumber;
  errorCorrection: ErrorCorrectionLevel;
  qr: Qr;
  size: "cable" | "small" | "medium" | "large";
}) {
  try {
    const withLogo = size !== "cable";
    const code = withLogo
      ? QRCode(0, QR_LOGO_ERROR_CORRECTION)
      : QRCode(version, errorCorrection);
    code.addData(getQrUrl(qr.id));
    code.make();

    /**
     * [module size in px, margin]. The margin is 0 because the label adds the
     * quiet zone around the image. Pixel sizes below are for a 29-module code;
     * codes with the logo are denser (typically 41 to 45 modules) and so larger.
     */
    const sizes: Record<typeof size, [number, number]> = {
      cable: [1, 0], // 29px => 0.8cm(0.77)
      small: [2, 0], // 58px => 1.5cm(1.53)
      medium: [4, 0], // 116px => 3.1cm(3.07)
      large: [6, 0], // 174px => 4.7cm(4.6)
    };
    const [cellSize, margin] = sizes[size];
    const dataUrl = code.createDataURL(cellSize, margin);
    const src = withLogo
      ? await addLogoToQrPng({
          dataUrl,
          moduleCount: code.getModuleCount(),
          cellSize,
          margin,
        })
      : await gifToPng(dataUrl);

    return {
      sizes,
      code: {
        size: size,
        src,
        id: qr.id,
      },
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        "Something went wrong while generating the QR code. Please try again or contact support.",
      additionalData: { version, errorCorrection, qr, size },
      label,
    });
  }
}

/**
 * Resolves the QR code for an asset or kit and renders it, creating the code on
 * first use.
 *
 * @param args.existingQr - The code, when the caller has already read it. Pass
 *   `null` to say "I looked and there is none" — a batch caller reads every row
 *   in one query, and re-reading per item is the N+1 this avoids. Leave it out
 *   to have the lookup done here.
 * @returns The rendered code, its sizes, and the sidebar flag the callers read.
 */
export async function generateQrObj({
  kitId,
  assetId,
  userId,
  organizationId,
  existingQr,
}: {
  kitId?: Qr["kitId"];
  assetId?: Qr["assetId"];
  userId: User["id"];
  organizationId: Organization["id"];
  existingQr?: Qr | null;
}) {
  try {
    if (!kitId && !assetId) {
      throw new ShelfError({
        cause: null,
        message: "No kitId or assetId provided",
        label: "QR",
      });
    }

    // `undefined` means the caller did not look; `null` means it looked and
    // found nothing, which skips straight to the create below.
    let qr: Qr | null = existingQr ?? null;

    if (existingQr === undefined) {
      if (assetId) {
        qr = await getQrByAssetId({ assetId });
      } else if (kitId) {
        qr = await getQrByKitId({ kitId });
      }
    }

    /**
     * No code yet — a kit or asset created by a content import has none until
     * something asks for one.
     *
     * Nothing in the schema holds this invariant, so the lock is what does.
     * `Qr.assetId` and `Qr.kitId` are nullable and non-unique because an
     * unclaimed printed code has neither and there are many at once, which
     * rules out a plain unique constraint. Take a lock on the owning row,
     * re-read under it, and only then create: without that, two callers
     * arriving together — a preview and a download, two tabs — both see nothing
     * and both create one, and the kit ends up with two codes at two URLs whose
     * scan histories diverge. Two rows like that reached production before this
     * lock existed.
     */
    if (!qr) {
      qr = await db.$transaction(async (tx) => {
        if (assetId) {
          await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
        } else {
          await tx.$queryRaw`SELECT id FROM "Kit" WHERE id = ${kitId} FOR UPDATE`;
        }

        const existing = await tx.qr.findFirst({
          where: assetId ? { assetId } : { kitId },
        });
        if (existing) {
          return existing;
        }

        return createQr(
          {
            assetId: assetId || undefined,
            kitId: kitId || undefined,
            userId,
            organizationId,
          },
          tx
        );
      });
    }

    /** Create a QR code with a URL */
    const { sizes, code } = await generateCode({
      version: qr.version as TypeNumber,
      errorCorrection: qr.errorCorrection as ErrorCorrectionLevel,
      size: "medium",
      qr,
    });

    return {
      qr: code,
      sizes,
      showSidebar: true,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: isLikeShelfError(cause)
        ? cause.message
        : "Failed to find qr code",
      additionalData: { kitId, assetId, organizationId, userId },
      label: "QR",
    });
  }
}

export const belongsToCurrentUser = (qr: Qr, userId: User["id"]) =>
  qr.userId === userId;

export const belongsToCurrentUsersOrg = (
  qr: Qr,
  orgs?: Organization[]
): boolean => Boolean(orgs?.find(({ id }) => id === qr.organizationId));
