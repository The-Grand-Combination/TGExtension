import type { Palette } from '../data/mapPalettes.js';
import type { BmpImage } from './bmpDecoder.js';

const PALETTE_ENTRY_SIZE = 4;

/** The palette of an 8-bit image as [red, green, blue] entries. */
export function paletteOf(image: BmpImage): Palette {
  const entries: [number, number, number][] = [];
  for (let index = 0; index < image.paletteEntries; index++) {
    const at = image.paletteOffset + index * PALETTE_ENTRY_SIZE;
    entries.push([image.bytes[at + 2] ?? 0, image.bytes[at + 1] ?? 0, image.bytes[at] ?? 0]);
  }
  return entries;
}

export function paletteEquals(left: Palette, right: Palette): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return other?.[0] === entry[0] && other[1] === entry[1] && other[2] === entry[2];
    })
  );
}

/**
 * A copy of the file with its palette replaced; pixels and headers are left
 * untouched, so the game reads the same indices as before.
 */
export function withPalette(image: BmpImage, palette: Palette): Uint8Array {
  const copy = new Uint8Array(image.bytes);
  palette.forEach((entry, index) => {
    if (index >= image.paletteEntries) {
      return;
    }
    const at = image.paletteOffset + index * PALETTE_ENTRY_SIZE;
    copy[at] = entry[2];
    copy[at + 1] = entry[1];
    copy[at + 2] = entry[0];
    copy[at + 3] = 0;
  });
  return copy;
}
