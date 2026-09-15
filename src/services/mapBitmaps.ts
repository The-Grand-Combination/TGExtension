import type { BmpImage } from './bmpDecoder.js';

/**
 * What the page and the server both know about the map bitmaps: Paradox stores
 * them bottom-up on purpose, and the game reads the rows as they come, so the
 * editor shows a file in storage order, which flips a normal BMP vertically.
 * `bmpDecoder` hands rows back top-down, so page row `y` is its row
 * `height - 1 - y` for the usual bottom-up file.
 */

/** The decoder's (top-down) row that the editor draws at row `y`. */
export function storedRow(image: BmpImage, y: number): number {
  return image.topDown ? y : image.height - 1 - y;
}

/** Byte offset of the row the editor draws at `y`. */
export function decodeRowOffset(image: BmpImage, y: number): number {
  return image.rowOffset(storedRow(image, y));
}

/** The palette index that starts the sea in rivers.bmp; below it, every index is river. */
export const RIVER_SEA_INDEX = 254;

export function isRiverIndex(index: number): boolean {
  return index < RIVER_SEA_INDEX;
}
