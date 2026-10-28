/**
 * @file brAIn lab logo in the center of every rendered QR code.
 *
 * The logo sits on a white plate that hides the modules underneath it. A
 * scanner recovers those modules from the code's error correction, so every
 * code that carries the logo is encoded at level H (about 30% of the code can
 * be lost and still read). The plate covers about 27% of the code's width,
 * which is under 8% of its area, leaving a wide margin for blur and glare on
 * printed labels.
 *
 * The plate snaps to whole modules and is centered on the module grid, so no
 * module is ever half covered.
 *
 * @see {@link file://./utils.server.ts} generateCode, the PNG used on labels and PDFs
 * @see {@link file://../../utils/zip-qr-codes.ts} the SVGs in the admin ZIP download
 * @see {@link file://../../../../../branding/README.md}
 */
import type { ErrorCorrectionLevel } from "qrcode-generator";
import qrLogoDataUrl from "./qr-logo.png?inline";

/** Error correction for codes with the logo: H recovers up to ~30% of the code. */
export const QR_LOGO_ERROR_CORRECTION: ErrorCorrectionLevel = "H";

/** Largest share of the code's width the logo plate may cover. */
const QR_LOGO_WIDTH_RATIO = 0.27;

/** The logo plate in module units, measured from the top left of the code. */
export type QrLogoBox = {
  /** Index of the first covered row and column */
  start: number;
  /** Number of covered rows and columns */
  span: number;
};

/**
 * Works out which modules the logo plate covers.
 *
 * QR codes always have an odd module count (4 x version + 17), so an odd span
 * leaves the same number of modules on each side. The plate never reaches the
 * outer 9 rows and columns: the finder patterns, their separators and the
 * format information live there, and error correction cannot restore them.
 *
 * @param moduleCount - Modules per side of the code
 * @returns The covered square, in modules
 */
export function getQrLogoBox(moduleCount: number): QrLogoBox {
  let span = Math.floor(moduleCount * QR_LOGO_WIDTH_RATIO);
  if (span % 2 === 0) span -= 1;
  // moduleCount is odd, so this bound is odd too.
  span = Math.min(span, moduleCount - 18);
  return { start: (moduleCount - span) / 2, span };
}

/** Geometry of a rendered code, shared by the PNG and SVG renderers. */
type QrRenderGeometry = {
  /** Modules per side, from `code.getModuleCount()` */
  moduleCount: number;
  /** Size of one module, in pixels (PNG) or user units (SVG) */
  cellSize: number;
  /** Quiet zone around the code, in the same unit as `cellSize` */
  margin: number;
};

/**
 * Where the plate and the logo go, in pixels or SVG units. The logo is inset
 * one module from the plate's edge so it never touches a dark module.
 */
function getLogoLayout({ moduleCount, cellSize, margin }: QrRenderGeometry) {
  const { start, span } = getQrLogoBox(moduleCount);
  const plateOffset = margin + start * cellSize;
  const plateSize = span * cellSize;
  return {
    plateOffset,
    plateSize,
    logoOffset: plateOffset + cellSize,
    logoSize: plateSize - 2 * cellSize,
  };
}

/**
 * Renders a QR code image with the logo in the center, as a PNG.
 *
 * @param args.dataUrl - The code as `code.createDataURL()` returns it (a GIF)
 * @returns A `data:image/png;base64,...` URL of the same size
 */
export async function addLogoToQrPng({
  dataUrl,
  ...geometry
}: QrRenderGeometry & { dataUrl: string }) {
  // @ts-ignore
  const sharp = (await import("sharp")).default;

  const { plateOffset, plateSize, logoOffset, logoSize } =
    getLogoLayout(geometry);

  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plateSize}" height="${plateSize}"><rect width="100%" height="100%" fill="white"/></svg>`
  );
  const logo = await sharp(dataUrlToBuffer(qrLogoDataUrl))
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();

  const pngBuffer = await sharp(dataUrlToBuffer(dataUrl))
    .composite([
      { input: plate, left: plateOffset, top: plateOffset },
      { input: logo, left: logoOffset, top: logoOffset },
    ])
    .png()
    .toBuffer();

  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

/**
 * Adds the logo to an SVG from `code.createSvgTag()`. The logo is embedded as
 * a PNG data URL, so the file stays self-contained.
 *
 * @param args.svg - The `<svg>` markup of the code
 * @returns The same markup with the plate and logo drawn on top
 */
export function addLogoToQrSvg({
  svg,
  ...geometry
}: QrRenderGeometry & { svg: string }) {
  const { plateOffset, plateSize, logoOffset, logoSize } =
    getLogoLayout(geometry);

  const overlay =
    `<rect x="${plateOffset}" y="${plateOffset}" width="${plateSize}" height="${plateSize}" fill="white"/>` +
    `<image x="${logoOffset}" y="${logoOffset}" width="${logoSize}" height="${logoSize}" href="${qrLogoDataUrl}"/>`;

  return svg.replace(/<\/svg>\s*$/, `${overlay}</svg>`);
}

/** Decodes the base64 payload of a `data:` URL. */
function dataUrlToBuffer(dataUrl: string) {
  return Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ""), "base64");
}
