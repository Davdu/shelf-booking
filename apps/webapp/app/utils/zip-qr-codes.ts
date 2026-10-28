import type { Qr } from "@prisma/client";
import JSZip from "jszip";
import QRCode from "qrcode-generator";
import {
  addLogoToQrSvg,
  QR_LOGO_ERROR_CORRECTION,
} from "~/modules/qr/qr-logo.server";
import { getQrUrl } from "~/modules/qr/qr-url.server";

/** Module size and quiet zone of the exported SVGs, in SVG user units. */
const SVG_CELL_SIZE = 3;
const SVG_MARGIN = 4;

/**
 * Builds a ZIP of SVG files, one per code, each with the brAIn lab logo in the
 * center.
 *
 * @param codes - The codes to export
 * @returns The ZIP as a Blob
 */
export async function createQrCodesZip(codes: Qr[]) {
  const zip = new JSZip();
  codes.forEach((c) => {
    const code = QRCode(0, QR_LOGO_ERROR_CORRECTION);
    code.addData(getQrUrl(c.id));
    code.make();
    const svg = addLogoToQrSvg({
      svg: code.createSvgTag({
        cellSize: SVG_CELL_SIZE,
        margin: SVG_MARGIN,
        scalable: true,
      }),
      moduleCount: code.getModuleCount(),
      cellSize: SVG_CELL_SIZE,
      margin: SVG_MARGIN,
    });

    const dateString = `${c.createdAt.getFullYear().toString()}${(
      c.createdAt.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}${c.createdAt.getDate().toString().padStart(2, "0")}`;

    zip.file(`${dateString} - ${c.id}.svg`, svg);
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return zipBlob;
}
