import { RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE, type Palette } from '../data/mapPalettes.js';
import type { ColormapOutcome } from '../model/colormaps.js';
import { decodeBmp } from './bmpDecoder.js';
import { paletteEquals, paletteOf, withPalette } from './bmpPalette.js';

/** The two bitmaps with a fixed palette, mod-root-relative, and the palette each must carry. */
export const COLORMAP_FILES: readonly { readonly relativePath: string; readonly palette: Palette }[] = [
  { relativePath: 'map/terrain.bmp', palette: TERRAIN_BMP_PALETTE },
  { relativePath: 'map/rivers.bmp', palette: RIVERS_BMP_PALETTE },
];

export type ColormapPlan =
  | { readonly outcome: Exclude<ColormapOutcome, 'fixable' | 'fixed'> }
  /** The bytes to write so the file carries the standard palette. */
  | { readonly outcome: 'fixable'; readonly fixed: Uint8Array };

/** Decide what Enforce Colormaps does with one bitmap's bytes. */
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
  return { outcome: 'fixable', fixed: withPalette(decoded.image, palette) };
}
