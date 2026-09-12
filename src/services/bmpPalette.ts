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
 * untouched. Only right when the pixels already carry the standard indices:
 * an editor that re-sorted the palette also renumbered the pixels, and then
 * {@link remapToPalette} is the fix.
 */
export function withPalette(image: BmpImage, palette: Palette): Uint8Array {
  const copy = new Uint8Array(image.bytes);
  writePalette(copy, image, palette);
  return copy;
}

export interface PaletteRemap {
  /** The file with the standard palette and every pixel renumbered to keep its colour. */
  readonly bytes: Uint8Array;
  /** Pixels whose index changed. */
  readonly remappedPixels: number;
  /** Colours of the old palette that the standard one lacks; their pixels took the nearest standard colour. */
  readonly approximatedColors: number;
}

/**
 * A copy of the file carrying `palette`, with every pixel renumbered so it
 * keeps the colour the old palette gave it: the game reads indices and ignores
 * the palette, so an image editor's re-sorted colour table (mspaint, GIMP) has
 * to be undone in the pixels, not just in the table. A colour the standard
 * palette does not have goes to its nearest entry (by RGB distance); when the
 * standard palette repeats a colour, the first index wins.
 */
export function remapToPalette(image: BmpImage, palette: Palette): PaletteRemap {
  const { table, approximatedColors } = indexTable(paletteOf(image), palette);
  const bytes = new Uint8Array(image.bytes);
  let remappedPixels = 0;
  for (let y = 0; y < image.height; y++) {
    const start = image.rowOffset(y);
    for (let x = 0; x < image.width; x++) {
      const at = start + x;
      const before = bytes[at] ?? 0;
      const after = table[before] ?? before;
      if (after !== before) {
        bytes[at] = after;
        remappedPixels++;
      }
    }
  }
  writePalette(bytes, image, palette);
  return { bytes, remappedPixels, approximatedColors };
}

/** Old index → standard index, by colour. */
function indexTable(current: Palette, palette: Palette): { table: Uint8Array; approximatedColors: number } {
  const firstIndexOf = new Map<number, number>();
  palette.forEach((entry, index) => {
    const key = packed(entry);
    if (!firstIndexOf.has(key)) {
      firstIndexOf.set(key, index);
    }
  });
  const table = new Uint8Array(256);
  let approximatedColors = 0;
  current.forEach((entry, index) => {
    const exact = firstIndexOf.get(packed(entry));
    if (exact !== undefined) {
      table[index] = exact;
      return;
    }
    approximatedColors++;
    table[index] = nearestIndex(entry, palette);
  });
  // Indices beyond the file's palette have no colour; they keep their number.
  for (let index = current.length; index < 256; index++) {
    table[index] = index;
  }
  return { table, approximatedColors };
}

function nearestIndex(entry: Palette[number], palette: Palette): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((candidate, index) => {
    const distance = (candidate[0] - entry[0]) ** 2 + (candidate[1] - entry[1]) ** 2 + (candidate[2] - entry[2]) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function packed(entry: Palette[number]): number {
  return (entry[0] << 16) | (entry[1] << 8) | entry[2];
}

function writePalette(target: Uint8Array, image: BmpImage, palette: Palette): void {
  palette.forEach((entry, index) => {
    if (index >= image.paletteEntries) {
      return;
    }
    const at = image.paletteOffset + index * PALETTE_ENTRY_SIZE;
    target[at] = entry[2];
    target[at + 1] = entry[1];
    target[at + 2] = entry[0];
    target[at + 3] = 0;
  });
}
