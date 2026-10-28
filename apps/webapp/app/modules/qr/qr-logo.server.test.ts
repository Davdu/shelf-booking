// @vitest-environment node
/**
 * The brAIn lab logo in the center of rendered QR codes.
 *
 * A code with a logo scans only while the logo hides less than the error
 * correction can recover, and only if every hidden module is hidden whole.
 * These tests run the real qrcode-generator encoder and sharp, and read the
 * geometry and pixels they produce, because that geometry IS the behaviour.
 *
 * @see {@link file://./qr-logo.server.ts}
 */
import QRCode from "qrcode-generator";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  addLogoToQrPng,
  addLogoToQrSvg,
  getQrLogoBox,
  QR_LOGO_ERROR_CORRECTION,
} from "./qr-logo.server";

const URL = "https://booking.example.dk/qr/cm4z8x1y20000abcd1234efgh";

/** Encodes `URL` the way the app does for codes that carry the logo. */
function encode() {
  const code = QRCode(0, QR_LOGO_ERROR_CORRECTION);
  code.addData(URL);
  code.make();
  return code;
}

/** Reads an image data URL (GIF or PNG) into raw RGBA pixels. */
async function pixelsOf(dataUrl: string) {
  const input = Buffer.from(dataUrl.split(",")[1], "base64");
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    at: (x: number, y: number) => {
      const i = (y * info.width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    },
  };
}

describe("getQrLogoBox", () => {
  it("covers a centered, whole-module square of at most 27% of the width, for every QR version", () => {
    for (let version = 1; version <= 40; version++) {
      const moduleCount = 4 * version + 17;
      const { start, span } = getQrLogoBox(moduleCount);

      expect(Number.isInteger(start)).toBe(true);
      expect(span % 2).toBe(1);
      expect(2 * start + span).toBe(moduleCount);
      expect(span / moduleCount).toBeLessThanOrEqual(0.27);
      // why: the finder patterns, their separators and the format
      // information fill the outer 9 rows and columns; error correction
      // cannot restore them, so the logo must stay clear.
      expect(start).toBeGreaterThan(8);
    }
  });
});

describe("addLogoToQrPng", () => {
  it("keeps the image size, whitens the plate and draws the red logo in the middle", async () => {
    const code = encode();
    const cellSize = 4;
    const dataUrl = code.createDataURL(cellSize, 0);

    const src = await addLogoToQrPng({
      dataUrl,
      moduleCount: code.getModuleCount(),
      cellSize,
      margin: 0,
    });

    expect(src).toMatch(/^data:image\/png;base64,/);
    const before = await pixelsOf(dataUrl);
    const after = await pixelsOf(src);
    expect([after.width, after.height]).toEqual([before.width, before.height]);

    const { start, span } = getQrLogoBox(code.getModuleCount());
    const plateStart = start * cellSize;
    const plateEnd = (start + span) * cellSize;
    const center = Math.floor(after.width / 2);

    // The ring of one module between the plate edge and the logo is white.
    expect(after.at(plateStart, plateStart)).toEqual([255, 255, 255]);
    expect(after.at(plateEnd - 1, plateEnd - 1)).toEqual([255, 255, 255]);
    // The logo panel is brand red (#BC0020) near its edge, inside the corner radius.
    const [r, g, b] = after.at(center, plateStart + cellSize + 2);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(80);
    // Every module outside the plate is untouched.
    for (let x = 0; x < after.width; x += cellSize) {
      expect(after.at(x, plateStart - 1)).toEqual(before.at(x, plateStart - 1));
      expect(after.at(x, plateEnd)).toEqual(before.at(x, plateEnd));
    }
  });
});

describe("addLogoToQrSvg", () => {
  it("draws the plate and an embedded PNG logo on the module grid, last, so they sit on top", () => {
    const code = encode();
    const cellSize = 3;
    const margin = 4;
    const svg = addLogoToQrSvg({
      svg: code.createSvgTag({ cellSize, margin, scalable: true }),
      moduleCount: code.getModuleCount(),
      cellSize,
      margin,
    });

    const { start, span } = getQrLogoBox(code.getModuleCount());
    const plate = margin + start * cellSize;
    const logo = plate + cellSize;
    const logoSize = (span - 2) * cellSize;

    expect(svg).toMatch(
      new RegExp(
        `<rect x="${plate}" y="${plate}" width="${span * cellSize}" height="${
          span * cellSize
        }" fill="white"/><image x="${logo}" y="${logo}" width="${logoSize}" height="${logoSize}" href="data:image/png;base64,[^"]+"/></svg>$`
      )
    );
  });
});
