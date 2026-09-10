import type { Palette } from '../../data/mapPalettes.js';

/** Tiny BMP files for the map tests: pixels are given top-down, as image editors show them. */

const FILE_HEADER_SIZE = 14;
const INFO_HEADER_SIZE = 40;

export interface Bmp8Options {
  /** Store rows top-down (negative height) instead of the usual bottom-up. */
  readonly topDown?: boolean;
  /** A header size other than 40, e.g. 124 for BITMAPV5HEADER. */
  readonly infoHeaderSize?: number;
  /** `biClrUsed`; 0 means all 256. */
  readonly colorsUsed?: number;
}

/** An 8-bit indexed BMP; `indices` is `width * height` values, row by row, top-down. */
export function encodeBmp8(width: number, height: number, indices: readonly number[], palette: Palette, options: Bmp8Options = {}): Uint8Array {
  const infoHeaderSize = options.infoHeaderSize ?? INFO_HEADER_SIZE;
  const paletteBytes = 256 * 4;
  const stride = Math.ceil(width / 4) * 4;
  const pixelOffset = FILE_HEADER_SIZE + infoHeaderSize + paletteBytes;
  const bytes = new Uint8Array(pixelOffset + stride * height);
  writeHeaders(bytes, width, height, 8, pixelOffset, infoHeaderSize, options);
  palette.forEach((entry, index) => {
    const at = FILE_HEADER_SIZE + infoHeaderSize + index * 4;
    bytes[at] = entry[2];
    bytes[at + 1] = entry[1];
    bytes[at + 2] = entry[0];
  });
  for (let y = 0; y < height; y++) {
    const fileRow = options.topDown === true ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      bytes[pixelOffset + fileRow * stride + x] = indices[y * width + x] ?? 0;
    }
  }
  return bytes;
}

/** A 24-bit BMP; `colors` is `width * height` packed `r << 16 | g << 8 | b` values, top-down. */
export function encodeBmp24(width: number, height: number, colors: readonly number[]): Uint8Array {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const pixelOffset = FILE_HEADER_SIZE + INFO_HEADER_SIZE;
  const bytes = new Uint8Array(pixelOffset + stride * height);
  writeHeaders(bytes, width, height, 24, pixelOffset, INFO_HEADER_SIZE, {});
  for (let y = 0; y < height; y++) {
    const fileRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const color = colors[y * width + x] ?? 0;
      const at = pixelOffset + fileRow * stride + x * 3;
      bytes[at] = color & 0xff;
      bytes[at + 1] = (color >> 8) & 0xff;
      bytes[at + 2] = (color >> 16) & 0xff;
    }
  }
  return bytes;
}

function writeHeaders(
  bytes: Uint8Array,
  width: number,
  height: number,
  bitsPerPixel: number,
  pixelOffset: number,
  infoHeaderSize: number,
  options: Bmp8Options,
): void {
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, pixelOffset, true);
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, options.topDown === true ? -height : height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bitsPerPixel, true);
  view.setUint32(30, 0, true);
  view.setUint32(46, options.colorsUsed ?? 0, true);
}

/** A 256-entry palette where entry `i` is `[i, i, i]`, distinct from the standard ones. */
export function grayPalette(): Palette {
  return Array.from({ length: 256 }, (_, index): readonly [number, number, number] => [index, index, index]);
}

export function packRgb(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue;
}
