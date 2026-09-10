/**
 * Decoders for the two image formats Victoria 2 uses for event/decision
 * pictures: DDS (DXT1/DXT3/DXT5 and uncompressed BGRA/BGR) and TGA
 * (uncompressed and RLE truecolor). Output is always 8-bit RGBA.
 */

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export function decodePicture(bytes: Uint8Array, fileName: string): DecodedImage | undefined {
  if (/\.dds$/i.test(fileName)) {
    return decodeDds(bytes);
  }
  if (/\.tga$/i.test(fileName)) {
    return decodeTga(bytes);
  }
  return undefined;
}

// --- DDS ----------------------------------------------------------------------

const DDS_MAGIC = 0x20534444;
const DDPF_FOURCC = 0x4;

function decodeDds(bytes: Uint8Array): DecodedImage | undefined {
  if (bytes.length < 128) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== DDS_MAGIC) {
    return undefined;
  }
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const pixelFormatFlags = view.getUint32(80, true);
  const data = bytes.subarray(128);

  if ((pixelFormatFlags & DDPF_FOURCC) !== 0) {
    const fourCc = String.fromCharCode(bytes[84] ?? 0, bytes[85] ?? 0, bytes[86] ?? 0, bytes[87] ?? 0);
    if (fourCc === 'DXT1') {
      return decodeDxt(width, height, data, 8, readDxt1Block);
    }
    if (fourCc === 'DXT3') {
      return decodeDxt(width, height, data, 16, readDxt3Block);
    }
    if (fourCc === 'DXT5') {
      return decodeDxt(width, height, data, 16, readDxt5Block);
    }
    return undefined;
  }
  return decodeUncompressedDds(width, height, view, data);
}

const DDPF_PALETTEINDEXED8 = 0x20;

function decodeUncompressedDds(
  width: number,
  height: number,
  view: DataView,
  data: Uint8Array,
): DecodedImage | undefined {
  const pixelFormatFlags = view.getUint32(80, true);
  if ((pixelFormatFlags & DDPF_PALETTEINDEXED8) !== 0) {
    return decodePalettizedDds(width, height, data);
  }
  const bitCount = view.getUint32(88, true);
  if (bitCount !== 16 && bitCount !== 24 && bitCount !== 32) {
    return undefined;
  }
  const masks = [92, 96, 100, 104].map((offset) => view.getUint32(offset, true));
  return decodeMaskedPixels(width, height, data, bitCount / 8, masks);
}

/** Extract a channel via its bit mask and scale it to 0-255. */
function channelFrom(value: number, mask: number): number {
  if (mask === 0) {
    return 255;
  }
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) {
    shift++;
  }
  const maxValue = mask >>> shift;
  return Math.round((((value & mask) >>> shift) / maxValue) * 255);
}

function decodeMaskedPixels(
  width: number,
  height: number,
  data: Uint8Array,
  bytesPerPixel: number,
  masks: readonly number[],
): DecodedImage | undefined {
  if (data.length < width * height * bytesPerPixel) {
    return undefined;
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    let value = 0;
    for (let byte = bytesPerPixel - 1; byte >= 0; byte--) {
      value = (value << 8) | (data[pixel * bytesPerPixel + byte] ?? 0);
    }
    rgba[pixel * 4] = channelFrom(value, masks[0] ?? 0);
    rgba[pixel * 4 + 1] = channelFrom(value, masks[1] ?? 0);
    rgba[pixel * 4 + 2] = channelFrom(value, masks[2] ?? 0);
    rgba[pixel * 4 + 3] = channelFrom(value, masks[3] ?? 0);
  }
  return { width, height, rgba };
}

/** P8: a 256-entry RGBA palette follows the header, then one index per pixel. */
function decodePalettizedDds(
  width: number,
  height: number,
  data: Uint8Array,
): DecodedImage | undefined {
  const paletteSize = 256 * 4;
  if (data.length < paletteSize + width * height) {
    return undefined;
  }
  const indices = data.subarray(paletteSize);
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const entry = (indices[pixel] ?? 0) * 4;
    rgba[pixel * 4] = data[entry] ?? 0;
    rgba[pixel * 4 + 1] = data[entry + 1] ?? 0;
    rgba[pixel * 4 + 2] = data[entry + 2] ?? 0;
    rgba[pixel * 4 + 3] = data[entry + 3] ?? 255;
  }
  return { width, height, rgba };
}

/** A decoded 4x4 block: 16 RGBA pixels, row-major. */
type BlockReader = (data: Uint8Array, offset: number, out: Uint8Array) => void;

function decodeDxt(
  width: number,
  height: number,
  data: Uint8Array,
  blockSize: number,
  readBlock: BlockReader,
): DecodedImage | undefined {
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  if (data.length < blocksWide * blocksHigh * blockSize) {
    return undefined;
  }
  const rgba = new Uint8Array(width * height * 4);
  const block = new Uint8Array(64);
  for (let blockY = 0; blockY < blocksHigh; blockY++) {
    for (let blockX = 0; blockX < blocksWide; blockX++) {
      readBlock(data, (blockY * blocksWide + blockX) * blockSize, block);
      copyBlock(block, rgba, width, height, blockX * 4, blockY * 4);
    }
  }
  return { width, height, rgba };
}

function copyBlock(
  block: Uint8Array,
  rgba: Uint8Array,
  width: number,
  height: number,
  originX: number,
  originY: number,
): void {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const pixelX = originX + x;
      const pixelY = originY + y;
      if (pixelX >= width || pixelY >= height) {
        continue;
      }
      const from = (y * 4 + x) * 4;
      const to = (pixelY * width + pixelX) * 4;
      rgba[to] = block[from] ?? 0;
      rgba[to + 1] = block[from + 1] ?? 0;
      rgba[to + 2] = block[from + 2] ?? 0;
      rgba[to + 3] = block[from + 3] ?? 0;
    }
  }
}

function expand565(value: number): [number, number, number] {
  const red = (value >> 11) & 0x1f;
  const green = (value >> 5) & 0x3f;
  const blue = value & 0x1f;
  return [(red << 3) | (red >> 2), (green << 2) | (green >> 4), (blue << 3) | (blue >> 2)];
}

function readColorBlock(
  data: Uint8Array,
  offset: number,
  out: Uint8Array,
  opaqueOnly: boolean,
): void {
  const color0 = (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
  const color1 = (data[offset + 2] ?? 0) | ((data[offset + 3] ?? 0) << 8);
  const [r0, g0, b0] = expand565(color0);
  const [r1, g1, b1] = expand565(color1);
  const palette: number[][] = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
  ];
  if (opaqueOnly || color0 > color1) {
    palette.push(
      [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255],
      [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255],
    );
  } else {
    palette.push([(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255], [0, 0, 0, 0]);
  }
  for (let pixel = 0; pixel < 16; pixel++) {
    const bits = (data[offset + 4 + (pixel >> 2)] ?? 0) >> ((pixel & 3) * 2);
    const entry = palette[bits & 3] ?? [0, 0, 0, 0];
    out[pixel * 4] = entry[0] ?? 0;
    out[pixel * 4 + 1] = entry[1] ?? 0;
    out[pixel * 4 + 2] = entry[2] ?? 0;
    out[pixel * 4 + 3] = entry[3] ?? 0;
  }
}

function readDxt1Block(data: Uint8Array, offset: number, out: Uint8Array): void {
  readColorBlock(data, offset, out, false);
}

function readDxt3Block(data: Uint8Array, offset: number, out: Uint8Array): void {
  readColorBlock(data, offset + 8, out, true);
  for (let pixel = 0; pixel < 16; pixel++) {
    const nibble = ((data[offset + (pixel >> 1)] ?? 0) >> ((pixel & 1) * 4)) & 0xf;
    out[pixel * 4 + 3] = (nibble << 4) | nibble;
  }
}

function readDxt5Block(data: Uint8Array, offset: number, out: Uint8Array): void {
  readColorBlock(data, offset + 8, out, true);
  const alpha0 = data[offset] ?? 0;
  const alpha1 = data[offset + 1] ?? 0;
  const palette = dxt5AlphaPalette(alpha0, alpha1);
  let bits = 0n;
  for (let byte = 5; byte >= 0; byte--) {
    bits = (bits << 8n) | BigInt(data[offset + 2 + byte] ?? 0);
  }
  for (let pixel = 0; pixel < 16; pixel++) {
    const code = Number((bits >> BigInt(pixel * 3)) & 7n);
    out[pixel * 4 + 3] = palette[code] ?? 255;
  }
}

function dxt5AlphaPalette(alpha0: number, alpha1: number): number[] {
  const palette = [alpha0, alpha1];
  if (alpha0 > alpha1) {
    for (let step = 1; step <= 6; step++) {
      palette.push(Math.round(((7 - step) * alpha0 + step * alpha1) / 7));
    }
  } else {
    for (let step = 1; step <= 4; step++) {
      palette.push(Math.round(((5 - step) * alpha0 + step * alpha1) / 5));
    }
    palette.push(0, 255);
  }
  return palette;
}

// --- TGA ----------------------------------------------------------------------

interface TgaHeader {
  readonly imageType: number;
  readonly width: number;
  readonly height: number;
  readonly bytesPerPixel: number;
  readonly topOrigin: boolean;
  readonly dataOffset: number;
}

function readTgaHeader(bytes: Uint8Array): TgaHeader | undefined {
  if (bytes.length < 18) {
    return undefined;
  }
  const imageType = bytes[2] ?? 0;
  const bitsPerPixel = bytes[16] ?? 0;
  if ((imageType !== 2 && imageType !== 10) || (bitsPerPixel !== 24 && bitsPerPixel !== 32)) {
    return undefined;
  }
  return {
    imageType,
    width: (bytes[12] ?? 0) | ((bytes[13] ?? 0) << 8),
    height: (bytes[14] ?? 0) | ((bytes[15] ?? 0) << 8),
    bytesPerPixel: bitsPerPixel / 8,
    topOrigin: ((bytes[17] ?? 0) & 0x20) !== 0,
    dataOffset: 18 + (bytes[0] ?? 0),
  };
}

function tgaPixelsToRgba(pixels: Uint8Array, header: TgaHeader): Uint8Array {
  const { width, height, bytesPerPixel, topOrigin } = header;
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const sourceRow = topOrigin ? row : height - 1 - row;
    for (let column = 0; column < width; column++) {
      const source = (sourceRow * width + column) * bytesPerPixel;
      const target = (row * width + column) * 4;
      rgba[target] = pixels[source + 2] ?? 0;
      rgba[target + 1] = pixels[source + 1] ?? 0;
      rgba[target + 2] = pixels[source] ?? 0;
      rgba[target + 3] = bytesPerPixel === 4 ? (pixels[source + 3] ?? 255) : 255;
    }
  }
  return rgba;
}

function decodeTga(bytes: Uint8Array): DecodedImage | undefined {
  const header = readTgaHeader(bytes);
  if (!header) {
    return undefined;
  }
  const data = bytes.subarray(header.dataOffset);
  const pixelCount = header.width * header.height;
  const pixels =
    header.imageType === 2 ? data : decodeTgaRle(data, pixelCount, header.bytesPerPixel);
  if (!pixels || pixels.length < pixelCount * header.bytesPerPixel) {
    return undefined;
  }
  return { width: header.width, height: header.height, rgba: tgaPixelsToRgba(pixels, header) };
}

function decodeTgaRle(
  data: Uint8Array,
  pixelCount: number,
  bytesPerPixel: number,
): Uint8Array | undefined {
  const out = new Uint8Array(pixelCount * bytesPerPixel);
  let read = 0;
  let written = 0;
  while (written < out.length && read < data.length) {
    const packet = data[read] ?? 0;
    read++;
    const count = (packet & 0x7f) + 1;
    if ((packet & 0x80) !== 0) {
      for (let repeat = 0; repeat < count && written < out.length; repeat++) {
        for (let byte = 0; byte < bytesPerPixel; byte++) {
          out[written++] = data[read + byte] ?? 0;
        }
      }
      read += bytesPerPixel;
    } else {
      const total = count * bytesPerPixel;
      out.set(data.subarray(read, read + total), written);
      written += total;
      read += total;
    }
  }
  return written >= out.length ? out : undefined;
}
