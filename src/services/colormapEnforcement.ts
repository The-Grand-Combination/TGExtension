import { RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE, type Palette } from '../data/mapPalettes.js';
import type { ColormapOutcome } from '../model/colormaps.js';
import { decodeBmp } from './bmpDecoder.js';
import { paletteEquals, paletteOf, remapToPalette } from './bmpPalette.js';

/** The two bitmaps with a fixed palette, mod-root-relative, and the palette each must carry. */
export const COLORMAP_FILES: readonly { readonly relativePath: string; readonly palette: Palette }[] = [
  { relativePath: 'map/terrain.bmp', palette: TERRAIN_BMP_PALETTE },
  { relativePath: 'map/rivers.bmp', palette: RIVERS_BMP_PALETTE },
];

export type ColormapPlan =
  | { readonly outcome: Exclude<ColormapOutcome, 'fixable' | 'fixed'> }
  /** The bytes to write so the file carries the standard palette and its pixels keep their colours. */
  | {
      readonly outcome: 'fixable';
      readonly fixed: Uint8Array;
      /** Pixels renumbered because the editor had re-sorted the palette. */
      readonly remappedPixels: number;
      /** Old colours the standard palette lacks, sent to their nearest entry. */
      readonly approximatedColors: number;
    };

/**
 * Decide what Enforce Colormaps does with one bitmap's bytes. The game reads
 * pixel indices and never the palette, so a file whose palette an editor
 * re-sorted has every pixel renumbered to the standard index of its colour;
 * rewriting the table alone would silently change what every pixel means.
 */
export function planColormapFix(bytes: Uint8Array | undefined, palette: Palette): ColormapPlan {
  if (bytes === undefined) {
    return { outcome: 'missing' };
  }
  const decoded = decodeBmp(bytes);
  if (decoded.kind === 'error') {
    return { outcome: 'unreadable' };
  }
  if (decoded.image.bitsPerPixel !== 8) {
    return { outcome: 'not-indexed' };
  }
  if (paletteEquals(paletteOf(decoded.image), palette)) {
    return { outcome: 'standard' };
  }
  const remap = remapToPalette(decoded.image, palette);
  return {
    outcome: 'fixable',
    fixed: remap.bytes,
    remappedPixels: remap.remappedPixels,
    approximatedColors: remap.approximatedColors,
  };
}
