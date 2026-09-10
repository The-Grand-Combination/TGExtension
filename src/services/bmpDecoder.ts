/**
 * Reader for the BMP files Victoria 2 maps use: 24/32-bit provinces.bmp and
 * 8-bit indexed terrain.bmp / rivers.bmp. Pixels are not copied; callers read
 * them through {@link BmpImage.indexAt} / {@link BmpImage.rgbAt} in top-down
 * coordinates (origin at the top-left corner, as image editors show them).
 */

export interface BmpImage {
  readonly width: number;
  readonly height: number;
  readonly bitsPerPixel: 8 | 24 | 32;
  /** Byte offset of the palette (BGRA entries) inside `bytes`; 8-bit images only. */
  readonly paletteOffset: number;
  readonly paletteEntries: number;
  readonly bytes: Uint8Array;
  /** Byte offset in `bytes` where top-down row `y` starts. */
  rowOffset(y: number): number;
  /** The palette index of a pixel; 0 for images that have no palette. */
  indexAt(x: number, y: number): number;
  /** The color of a pixel packed as `red << 16 | green << 8 | blue`. */
  rgbAt(x: number, y: number): number;
}

export interface BmpDecodeError {
  readonly kind: 'error';
  readonly reason: string;
}

export type BmpDecodeResult = { readonly kind: 'image'; readonly image: BmpImage } | BmpDecodeError;

const FILE_HEADER_SIZE = 14;
const KNOWN_INFO_HEADER_SIZES: ReadonlySet<number> = new Set([12, 40, 52, 56, 108, 124]);
const PALETTE_ENTRY_SIZE = 4;

export function decodeBmp(bytes: Uint8Array): BmpDecodeResult {
  if (bytes.length < FILE_HEADER_SIZE + 12 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    return { kind: 'error', reason: 'not a BMP file (missing BM signature)' };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const infoHeaderSize = view.getUint32(14, true);
  if (!KNOWN_INFO_HEADER_SIZES.has(infoHeaderSize)) {
    return { kind: 'error', reason: `unknown BMP header size ${String(infoHeaderSize)}` };
  }
  const header = infoHeaderSize === 12 ? readCoreHeader(view) : readInfoHeader(view);
  if (header.compression !== 0) {
    return { kind: 'error', reason: 'compressed BMP (RLE) is not supported' };
  }
  const bitsPerPixel = header.bitsPerPixel;
  if (bitsPerPixel !== 8 && bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    return { kind: 'error', reason: `${String(bitsPerPixel)}-bit BMP; expected 8, 24 or 32 bits per pixel` };
  }
  const stride = Math.ceil((header.width * bitsPerPixel) / 32) * 4;
  if (pixelOffset + stride * header.height > bytes.length) {
    return { kind: 'error', reason: 'truncated BMP: fewer pixel bytes than the header announces' };
  }
  const paletteEntries = bitsPerPixel === 8 ? (header.colorsUsed === 0 ? 256 : header.colorsUsed) : 0;
  return {
    kind: 'image',
    image: makeImage(bytes, { ...header, bitsPerPixel }, pixelOffset, stride, paletteEntries, infoHeaderSize),
  };
}

interface RawHeader {
  readonly width: number;
  readonly height: number;
  readonly topDown: boolean;
  readonly bitsPerPixel: number;
  readonly compression: number;
  readonly colorsUsed: number;
}

function readCoreHeader(view: DataView): RawHeader {
  const height = view.getInt16(20, true);
  return {
    width: view.getUint16(18, true),
    height: Math.abs(height),
    topDown: height < 0,
    bitsPerPixel: view.getUint16(24, true),
    compression: 0,
    colorsUsed: 0,
  };
}

function readInfoHeader(view: DataView): RawHeader {
  const height = view.getInt32(22, true);
  return {
    width: view.getInt32(18, true),
    height: Math.abs(height),
    topDown: height < 0,
    bitsPerPixel: view.getUint16(28, true),
    compression: view.getUint32(30, true),
    colorsUsed: view.getUint32(46, true),
  };
}

function makeImage(
  bytes: Uint8Array,
  header: RawHeader & { readonly bitsPerPixel: 8 | 24 | 32 },
  pixelOffset: number,
  stride: number,
  paletteEntries: number,
  infoHeaderSize: number,
): BmpImage {
  const { width, height, topDown, bitsPerPixel } = header;
  const bytesPerPixel = bitsPerPixel / 8;
  const paletteOffset = FILE_HEADER_SIZE + infoHeaderSize;
  const rowStart = (y: number): number => pixelOffset + (topDown ? y : height - 1 - y) * stride;
  const indexAt = (x: number, y: number): number => (bitsPerPixel === 8 ? bytes[rowStart(y) + x] ?? 0 : 0);
  const rgbAt = (x: number, y: number): number => {
    if (bitsPerPixel === 8) {
      const entry = paletteOffset + indexAt(x, y) * PALETTE_ENTRY_SIZE;
      return ((bytes[entry + 2] ?? 0) << 16) | ((bytes[entry + 1] ?? 0) << 8) | (bytes[entry] ?? 0);
    }
    const at = rowStart(y) + x * bytesPerPixel;
    return ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at] ?? 0);
  };
  return { width, height, bitsPerPixel, paletteOffset, paletteEntries, bytes, rowOffset: rowStart, indexAt, rgbAt };
}

/** The pixels of an 8-bit image as one top-down array of palette indices. */
export function indicesOf(image: BmpImage): Uint8Array {
  const out = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y++) {
    const start = image.rowOffset(y);
    out.set(image.bytes.subarray(start, start + image.width), y * image.width);
  }
  return out;
}

/** `red,green,blue` of a packed color, for messages. */
export function formatRgb(packed: number): string {
  return `${String((packed >> 16) & 0xff)},${String((packed >> 8) & 0xff)},${String(packed & 0xff)}`;
}
