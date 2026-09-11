import type { Document } from '../model/ast.js';
import { asBlock, firstByKey, scalarValueOf } from '../model/astQuery.js';
import type { BmpImage } from './bmpDecoder.js';
import { decodePicture, type DecodedImage } from './pictureDecoder.js';
import { scaleImage } from './pictureHover.js';
import { encodePng } from './pngEncoder.js';
import type { ProvinceRow } from './provinceTable.js';
import { yieldToEventLoop } from './scheduling.js';

/**
 * The province view's terrain picture: the game draws sprite
 * `GFX_terrainimg_<terrain>` from `interface/*.gfx`, where `<terrain>` is the
 * province's category, set by `terrain = x` in its history or, failing that,
 * by the terrain.bmp index most of its pixels carry (mapped through the
 * `text_N = { type = x color = { N } }` entries of map/terrain.txt).
 */

const SPRITE_PREFIX = 'gfx_terrainimg_';
/** The size of the game's and TGC's terrain pictures; a larger picture is cropped to it, so the header never changes shape. */
export const TERRAIN_PICTURE_WIDTH = 374;
export const TERRAIN_PICTURE_HEIGHT = 94;
const TERRAIN_INDEX_LIMIT = 64;
const NO_PROVINCE = 0;
const LAKE = 0xffff;
const ROWS_PER_CHUNK = 128;

/** Terrain name (lowercase) → texture path relative to the mod root, forward slashes. */
export function terrainSpriteTextures(document: Document): Map<string, string> {
  const textures = new Map<string, string>();
  for (const group of document.entries) {
    if (group.kind !== 'assignment' || group.value.kind !== 'block') {
      continue;
    }
    for (const sprite of group.value.entries) {
      if (sprite.kind !== 'assignment' || sprite.value.kind !== 'block') {
        continue;
      }
      const name = scalarValueOf(sprite.value.entries, 'name')?.toLowerCase();
      const texture = scalarValueOf(sprite.value.entries, 'texturefile');
      if (name?.startsWith(SPRITE_PREFIX) === true && texture !== undefined && !textures.has(name.slice(SPRITE_PREFIX.length))) {
        textures.set(name.slice(SPRITE_PREFIX.length), texture.replace(/\\/g, '/'));
      }
    }
  }
  return textures;
}

/** terrain.bmp palette index → terrain category, from every `name = { type = x color = { N ... } }` entry. */
export function terrainTypeByIndex(document: Document): Map<number, string> {
  const types = new Map<number, string>();
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment' || entry.value.kind !== 'block' || entry.key.value.toLowerCase() === 'categories') {
      continue;
    }
    const type = scalarValueOf(entry.value.entries, 'type');
    const color = firstByKey(entry.value.entries, 'color');
    const list = color ? asBlock(color.value) : undefined;
    for (const item of list?.entries ?? []) {
      if (type !== undefined && item.kind === 'scalar' && /^\d+$/.test(item.value) && !types.has(Number(item.value))) {
        types.set(Number(item.value), type);
      }
    }
  }
  return types;
}

/** The declared texture, then the same name with the other extension the game also loads. */
export function textureCandidates(texturePath: string): string[] {
  const lower = texturePath.toLowerCase();
  if (lower.endsWith('.tga')) {
    return [texturePath, `${texturePath.slice(0, -4)}.dds`];
  }
  if (lower.endsWith('.dds')) {
    return [texturePath, `${texturePath.slice(0, -4)}.tga`];
  }
  return [texturePath];
}

/**
 * The terrain category most pixels of each province carry, for every province
 * that has pixels and whose dominant index is mapped in terrain.txt. Both
 * bitmaps must have the same size; `terrainIndices` is top-down like the image.
 */
export async function dominantTerrainByProvince(
  provinces: BmpImage,
  terrainIndices: Uint8Array,
  rows: readonly ProvinceRow[],
  typeByIndex: ReadonlyMap<number, string>,
): Promise<Map<number, string>> {
  const idByColor = new Uint16Array(1 << 24);
  let maxId = 0;
  for (const row of rows) {
    if (row.id !== undefined && row.id < LAKE) {
      idByColor[row.color] = row.id;
      maxId = Math.max(maxId, row.id);
    }
  }
  const counts = new Uint32Array((maxId + 1) * TERRAIN_INDEX_LIMIT);
  const { width, height } = provinces;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = idByColor[provinces.rgbAt(x, y)] ?? NO_PROVINCE;
      const index = terrainIndices[y * width + x] ?? TERRAIN_INDEX_LIMIT;
      if (id !== NO_PROVINCE && index < TERRAIN_INDEX_LIMIT) {
        const slot = id * TERRAIN_INDEX_LIMIT + index;
        counts[slot] = (counts[slot] ?? 0) + 1;
      }
    }
    if (y % ROWS_PER_CHUNK === ROWS_PER_CHUNK - 1) {
      await yieldToEventLoop();
    }
  }
  return dominantTypes(counts, maxId, typeByIndex);
}

function dominantTypes(counts: Uint32Array, maxId: number, typeByIndex: ReadonlyMap<number, string>): Map<number, string> {
  const dominant = new Map<number, string>();
  for (let id = 1; id <= maxId; id++) {
    let best = -1;
    let bestCount = 0;
    for (let index = 0; index < TERRAIN_INDEX_LIMIT; index++) {
      const count = counts[id * TERRAIN_INDEX_LIMIT + index] ?? 0;
      if (count > bestCount) {
        best = index;
        bestCount = count;
      }
    }
    const type = best < 0 ? undefined : typeByIndex.get(best);
    if (type !== undefined) {
      dominant.set(id, type);
    }
  }
  return dominant;
}

/**
 * The texture as a PNG data URI, center-cropped to the standard terrain picture
 * size when it is larger, then scaled to at most `maxWidth`. Undefined when the
 * bytes are not a DDS or TGA picture.
 */
export function terrainPictureDataUri(bytes: Uint8Array, fileName: string, maxWidth: number): string | undefined {
  const decoded = decodePicture(bytes, fileName);
  if (!decoded) {
    return undefined;
  }
  const scaled = scaleImage(cropCenter(decoded, TERRAIN_PICTURE_WIDTH, TERRAIN_PICTURE_HEIGHT), maxWidth);
  return `data:image/png;base64,${Buffer.from(encodePng(scaled.width, scaled.height, scaled.rgba)).toString('base64')}`;
}

/** The middle `width` x `height` of an image; the image itself when it is not larger. */
export function cropCenter(image: DecodedImage, width: number, height: number): DecodedImage {
  const targetWidth = Math.min(width, image.width);
  const targetHeight = Math.min(height, image.height);
  if (targetWidth === image.width && targetHeight === image.height) {
    return image;
  }
  const left = Math.floor((image.width - targetWidth) / 2);
  const top = Math.floor((image.height - targetHeight) / 2);
  const rgba = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const from = ((top + y) * image.width + left) * 4;
    rgba.set(image.rgba.subarray(from, from + targetWidth * 4), y * targetWidth * 4);
  }
  return { width: targetWidth, height: targetHeight, rgba };
}
