import { canvas, ctx, mapArea } from './dom.js';
import { drawMarkers } from './positions.js';
import { drawReferences } from './references.js';
import { definitionById, idByColor, OVERLAYS, state, type DecodedImage, type Highlight, type Point, type Tile } from './state.js';

/** The map on the canvas: pan, zoom, the layers in order, and the selected province's glow. */

function resizeCanvas(): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(mapArea.clientWidth * ratio));
  const height = Math.max(1, Math.floor(mapArea.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
}

export function fitView(): void {
  const image = state.image;
  if (!image) { return; }
  const scale = Math.min(mapArea.clientWidth / image.width, mapArea.clientHeight / image.height);
  state.view = { scale: scale, x: (mapArea.clientWidth - image.width * scale) / 2, y: (mapArea.clientHeight - image.height * scale) / 2 };
}

export function render(): void {
  resizeCanvas();
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const image = state.image;
  if (!image) { return; }
  const view = state.view;
  ctx.imageSmoothingEnabled = view.scale < 1;
  ctx.setTransform(ratio * view.scale, 0, 0, ratio * view.scale, ratio * view.x, ratio * view.y);
  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + mapArea.clientWidth / view.scale;
  const bottom = top + mapArea.clientHeight / view.scale;
  ctx.globalAlpha = state.layerOpacity.provinces / 100;
  const tinted = state.tintMode === null ? null : state.tinted[state.tintMode];
  drawTiles(tinted ? tinted.tiles : image.tiles, left, top, right, bottom);
  for (const kind of OVERLAYS) {
    const tiles = state.overlayTiles[kind];
    if (!tiles || state.layerOpacity[kind] <= 0) { continue; }
    ctx.globalAlpha = state.layerOpacity[kind] / 100;
    ctx.imageSmoothingEnabled = false;
    drawTiles(tiles, left, top, right, bottom);
  }
  ctx.globalAlpha = 1;
  drawReferences();
  if (state.selection) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.selection.canvas, state.selection.x, state.selection.y);
  }
  drawMarkers(left, top, right, bottom);
}

/** Only the tiles the view actually covers. */
function drawTiles(
  tiles: readonly Tile[],
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  for (const tile of tiles) {
    if (tile.x + tile.canvas.width < left || tile.x > right || tile.y + tile.canvas.height < top || tile.y > bottom) { continue; }
    ctx.drawImage(tile.canvas, tile.x, tile.y);
  }
}

export function toImage(clientX: number, clientY: number): Point {
  const exact = toImageExact(clientX, clientY);
  return { x: Math.floor(exact.x), y: Math.floor(exact.y) };
}

export function toImageExact(clientX: number, clientY: number): Point {
  const rect = mapArea.getBoundingClientRect();
  return { x: (clientX - rect.left - state.view.x) / state.view.scale, y: (clientY - rect.top - state.view.y) / state.view.scale };
}

export function insideImage(image: DecodedImage, point: Point): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < image.width && point.y < image.height;
}

export function provinceAt(point: Point): number | undefined {
  const image = state.image;
  if (!image || !insideImage(image, point)) { return undefined; }
  const color = image.packed[point.y * image.width + point.x];
  return color === undefined ? undefined : idByColor.get(color);
}

export function zoomAt(clientX: number, clientY: number, factor: number): void {
  const image = state.image;
  if (!image) { return; }
  const rect = mapArea.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const view = state.view;
  const minScale = Math.min(mapArea.clientWidth / image.width, mapArea.clientHeight / image.height) * 0.5;
  const scale = Math.min(64, Math.max(minScale, view.scale * factor));
  const ratio = scale / view.scale;
  state.view = { scale: scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
  render();
}

/** A rectangle of map pixels, edges included. */
export interface PixelBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** The box the colour's pixels fit in, looked for inside `within`; `maxX` below zero when there are none. */
function boundsOfColor(currentImage: DecodedImage, color: number, within: PixelBox): PixelBox {
  const packed = currentImage.packed;
  const width = currentImage.width;
  const box = { minX: width, minY: currentImage.height, maxX: -1, maxY: -1 };
  for (let y = Math.max(0, within.minY); y <= Math.min(currentImage.height - 1, within.maxY); y++) {
    const row = y * width;
    for (let x = Math.max(0, within.minX); x <= Math.min(width - 1, within.maxX); x++) {
      if (packed[row + x] !== color) { continue; }
      if (x < box.minX) { box.minX = x; } if (x > box.maxX) { box.maxX = x; }
      if (y < box.minY) { box.minY = y; } if (y > box.maxY) { box.maxY = y; }
    }
  }
  return box;
}

/** The whole map, for a province whose whereabouts nothing narrows down. */
export function wholeMap(image: DecodedImage): PixelBox {
  return { minX: 0, minY: 0, maxX: image.width - 1, maxY: image.height - 1 };
}

export function boxOfPixels(image: DecodedImage, indices: Iterable<number>): PixelBox {
  const box = { minX: image.width, minY: image.height, maxX: -1, maxY: -1 };
  for (const index of indices) {
    const x = index % image.width;
    const y = (index - x) / image.width;
    if (x < box.minX) { box.minX = x; } if (x > box.maxX) { box.maxX = x; }
    if (y < box.minY) { box.minY = y; } if (y > box.maxY) { box.maxY = y; }
  }
  return box;
}

export function unionBox(one: PixelBox, other: PixelBox): PixelBox {
  return {
    minX: Math.min(one.minX, other.minX), minY: Math.min(one.minY, other.minY),
    maxX: Math.max(one.maxX, other.maxX), maxY: Math.max(one.maxY, other.maxY),
  };
}

/**
 * Where the province meets anything else. 1 marks its pixels that touch another
 * colour or the map's edge, 2 the ones wholly inside it. Diagonal-only
 * neighbours do not count, or a one-pixel isthmus would light its whole width.
 */
function edgeMaskOf(currentImage: DecodedImage, color: number, minX: number, minY: number, boxWidth: number, boxHeight: number): Uint8Array {
  const { packed, width, height } = currentImage;
  const edge = new Uint8Array(boxWidth * boxHeight);
  function own(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < width && y < height && packed[y * width + x] === color;
  }
  for (let yy = 0; yy < boxHeight; yy++) {
    for (let xx = 0; xx < boxWidth; xx++) {
      const x = minX + xx;
      const y = minY + yy;
      if (!own(x, y)) { continue; }
      edge[yy * boxWidth + xx] = own(x - 1, y) && own(x + 1, y) && own(x, y - 1) && own(x, y + 1) ? 2 : 1;
    }
  }
  return edge;
}

/**
 * The selection is not a tint: a one-pixel glow runs along the inside of the
 * edge, with a fainter pixel just inside it, so the shape reads and the colour
 * stays the colour.
 */
function glowMaskOf(edge: Uint8Array, boxWidth: number, boxHeight: number): Uint8ClampedArray<ArrayBuffer> {
  const mask = new Uint8ClampedArray(new ArrayBuffer(boxWidth * boxHeight * 4));
  for (let at = 0; at < edge.length; at++) {
    const kind = edge[at];
    if (kind === 0) { continue; }
    const xx = at % boxWidth;
    const yy = (at - xx) / boxWidth;
    const besideEdge = (xx > 0 && edge[at - 1] === 1) || (xx + 1 < boxWidth && edge[at + 1] === 1)
      || (yy > 0 && edge[at - boxWidth] === 1) || (yy + 1 < boxHeight && edge[at + boxWidth] === 1);
    const alpha = kind === 1 ? 190 : besideEdge ? 60 : 0;
    if (alpha === 0) { continue; }
    const out = at * 4;
    mask[out] = 255; mask[out + 1] = 255; mask[out + 2] = 255; mask[out + 3] = alpha;
  }
  return mask;
}

/**
 * The glow of a province, by its table colour unless `painted` names another.
 * `within` is where to look for its pixels: the whole map unless the caller
 * knows better, since walking twenty megapixels is the cost of this.
 */
export function highlightOf(id: number, painted?: number, within?: PixelBox): Highlight | null {
  const color = painted ?? definitionById.get(id)?.color;
  const currentImage = state.image;
  if (color === undefined || !currentImage) { return null; }
  const { minX, minY, maxX, maxY } = boundsOfColor(currentImage, color, within ?? wholeMap(currentImage));
  if (maxX < 0) { return null; }
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const edge = edgeMaskOf(currentImage, color, minX, minY, boxWidth, boxHeight);
  const mask = glowMaskOf(edge, boxWidth, boxHeight);
  const overlay = document.createElement('canvas');
  overlay.width = boxWidth; overlay.height = boxHeight;
  const overlayContext = overlay.getContext('2d');
  if (!overlayContext) { return null; }
  overlayContext.putImageData(new ImageData(mask, boxWidth, boxHeight), 0, 0);
  return { id: id, color: color, canvas: overlay, x: minX, y: minY, width: boxWidth, height: boxHeight };
}

/** The selection's box as a pixel box, for a glow that only has to be looked for near where it was. */
export function boxOfHighlight(found: Highlight): PixelBox {
  return { minX: found.x, minY: found.y, maxX: found.x + found.width - 1, maxY: found.y + found.height - 1 };
}

/**
 * Where to put a point that should sit "in" the province: its centre of mass,
 * moved to the nearest pixel the province owns, because a crescent-shaped one
 * has its centre outside itself. A map place, y up from the bottom.
 */
export function selectionCenter(): { x: number; y: number } | null {
  const current = state.selection;
  const currentImage = state.image;
  if (!current || !currentImage) { return null; }
  const color = current.color;
  const packed = currentImage.packed;
  const width = currentImage.width;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = current.y; y < current.y + current.height; y++) {
    const row = y * width;
    for (let x = current.x; x < current.x + current.width; x++) {
      if (packed[row + x] === color) { sumX += x; sumY += y; count++; }
    }
  }
  if (count === 0) { return null; }
  const meanX = sumX / count;
  const meanY = sumY / count;
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (let y = current.y; y < current.y + current.height; y++) {
    const row = y * width;
    for (let x = current.x; x < current.x + current.width; x++) {
      if (packed[row + x] !== color) { continue; }
      const distance = (x - meanX) * (x - meanX) + (y - meanY) * (y - meanY);
      if (distance < bestDistance) { bestDistance = distance; best = { x: x + 0.5, y: currentImage.height - y - 0.5 }; }
    }
  }
  return best;
}
