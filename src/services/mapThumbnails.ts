import { indicesOf, type BmpImage } from './bmpDecoder.js';
import { encodePng } from './pngEncoder.js';

/**
 * The small pictures the Layers box shows next to each map bitmap. A map is
 * twenty megapixels and a thumbnail a few hundred: nothing is decoded whole,
 * the bitmap is read where the thumbnail needs it.
 */

/** The box's pictures are square icons: the whole map, squeezed, not a strip of it. */
export const THUMBNAIL_SIZE = 22;

/**
 * One pixel read from the middle of each cell, in the file's own colours — the
 * palette of an 8-bit file included, which is what an image editor shows for it.
 * Rows are taken in storage order, the way the editor draws the map.
 */
export function sampledThumbnail(image: BmpImage, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const y = storedRow(image, Math.floor(((row + 0.5) * image.height) / height));
    for (let column = 0; column < width; column++) {
      const x = Math.floor(((column + 0.5) * image.width) / width);
      const color = image.rgbAt(x, y);
      const at = (row * width + column) * 4;
      rgba[at] = (color >> 16) & 0xff;
      rgba[at + 1] = (color >> 8) & 0xff;
      rgba[at + 2] = color & 0xff;
      rgba[at + 3] = 255;
    }
  }
  return rgba;
}

/** The palette index that starts the sea in rivers.bmp; below it, every index is river. */
const RIVER_SEA_INDEX = 254;

/**
 * The file as an image editor shows it — its own palette, sea and land included —
 * except that rivers are one pixel wide and a sample misses nearly all of them: a
 * cell any river pixel falls in takes that pixel's palette colour.
 */
export function riversThumbnail(image: BmpImage, width: number, height: number): Uint8Array {
  const indices = indicesOf(image);
  const rgba = sampledThumbnail(image, width, height);
  for (let y = 0; y < image.height; y++) {
    const row = Math.min(height - 1, Math.floor((storedRow(image, y) * height) / image.height));
    const start = y * image.width;
    for (let x = 0; x < image.width; x++) {
      if ((indices[start + x] ?? RIVER_SEA_INDEX) >= RIVER_SEA_INDEX) {
        continue;
      }
      const column = Math.min(width - 1, Math.floor((x * width) / image.width));
      const at = (row * width + column) * 4;
      const color = image.rgbAt(x, y);
      rgba[at] = (color >> 16) & 0xff;
      rgba[at + 1] = (color >> 8) & 0xff;
      rgba[at + 2] = color & 0xff;
      rgba[at + 3] = 255;
    }
  }
  return rgba;
}

export function thumbnailDataUri(width: number, height: number, rgba: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(encodePng(width, height, rgba)).toString('base64')}`;
}

/** The decoder hands rows back top-down; the editor shows a bottom-up file in storage order. */
function storedRow(image: BmpImage, y: number): number {
  return image.topDown ? y : image.height - 1 - y;
}
