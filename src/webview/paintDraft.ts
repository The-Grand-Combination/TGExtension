import { RIVER_SEA } from '../data/mapPalettes.js';
import { addPixel, changedRuns, type PixelArray } from '../services/provincePaint.js';
import { FIXED_LAYERS, layerImage, RIVER_COLOR, state, TILE, TINT_MODES, type FixedLayer, type Overlay, type PixelLayer, type Tile } from './state.js';

/**
 * What each map bitmap is holding that its file does not. A stroke can land on
 * more than one of them at once, so every layer keeps its own copy of the file
 * and its own count of the pixels that have moved away from it; a Save writes
 * the layers that differ, one file at a time.
 */

/** One stroke, per layer, as runs of the values the pixels held before it: undo writes those straight back. */
export type Step = Partial<Record<FixedLayer, number[]>>;

interface Draft {
  file: PixelArray | null;
  /** Which bitmap the copy belongs to: a new map makes the old one meaningless. */
  of: PixelLayer | null;
  painted: number;
}

const drafts: Record<FixedLayer, Draft> = {
  provinces: { file: null, of: null, painted: 0 },
  rivers: { file: null, of: null, painted: 0 },
  terrain: { file: null, of: null, painted: 0 },
};

/**
 * The layer as the file has it. One array of the map's own size, not one entry
 * per painted pixel: a bucket over a large region would fill a container with
 * millions of them.
 */
export function fileValues(kind: FixedLayer, image: PixelLayer): PixelArray {
  const draft = drafts[kind];
  if (draft.of !== image || !draft.file) {
    draft.of = image;
    draft.file = image.packed.slice();
    draft.painted = 0;
  }
  return draft.file;
}

export function paintedIn(kind: FixedLayer): number {
  return drafts[kind].painted;
}

export function paintedTotal(): number {
  let total = 0;
  for (const kind of FIXED_LAYERS) { total += drafts[kind].painted; }
  return total;
}

export function dirtyLayers(): FixedLayer[] {
  return FIXED_LAYERS.filter(function (kind) { return drafts[kind].painted > 0; });
}

/**
 * Write the runs into one decoded layer, answering with the pixels that
 * changed hands: a run may cross pixels that already hold its value, and those
 * are neither drawn again nor taken back by an undo.
 */
export function writeRuns(kind: FixedLayer, runs: readonly number[], stroke: Step | null): number[] {
  const image = layerImage(kind);
  if (!image) { return []; }
  const file = fileValues(kind, image);
  const applied: number[] = [];
  const back = stroke === null ? null : (stroke[kind] ?? []);
  if (stroke !== null && back !== null) { stroke[kind] = back; }
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    writeRun(kind, image, file, start, start + (runs[at + 1] ?? 0), runs[at + 2] ?? 0, back, applied);
  }
  return applied;
}

/** One run, pixel by pixel: what it takes over goes into `applied`, and what it took the place of into `back`. */
function writeRun(
  kind: FixedLayer,
  image: PixelLayer,
  file: PixelArray,
  start: number,
  end: number,
  value: number,
  back: number[] | null,
  applied: number[],
): void {
  const draft = drafts[kind];
  const packed = image.packed;
  const width = image.width;
  for (let index = start; index < end; index++) {
    const before = packed[index];
    if (before === undefined || before === value) { continue; }
    const original = file[index] ?? before;
    if (before === original) { draft.painted++; } else if (value === original) { draft.painted--; }
    packed[index] = value;
    if (back) { addPixel(back, index, before, width); }
    addPixel(applied, index, value, width);
  }
}

/** The eraser only undoes the draft: a pixel still the file's is not its business. */
export function eraseRuns(kind: FixedLayer, indices: readonly number[]): number[] {
  const image = layerImage(kind);
  if (!image) { return []; }
  const file = fileValues(kind, image);
  const runs: number[] = [];
  for (const index of [...indices].sort(function (one, other) { return one - other; })) {
    const original = file[index];
    if (original !== undefined && image.packed[index] !== original) {
      addPixel(runs, index, original, image.width);
    }
  }
  return runs;
}

/** What a Save writes for a layer: where the page differs from the file. */
export function paintedRuns(kind: FixedLayer): number[] {
  const image = layerImage(kind);
  return image ? changedRuns(image.packed, fileValues(kind, image), image.width) : [];
}

/** What a Reset paints back: the file's own values where the page has moved away from them. */
export function fileRuns(kind: FixedLayer): number[] {
  const image = layerImage(kind);
  return image ? changedRuns(fileValues(kind, image), image.packed, image.width) : [];
}

export function clearDraft(kind: FixedLayer): void {
  drafts[kind] = { file: null, of: null, painted: 0 };
}

export function resetDrafts(): void {
  for (const kind of FIXED_LAYERS) { clearDraft(kind); }
}

/** Draw the runs onto the tiles of the layer they belong to, and onto every repaint built from it. */
export function patchTiles(kind: FixedLayer, runs: readonly number[]): void {
  const image = layerImage(kind);
  const tiles = image?.tiles;
  if (!image || !tiles) { return; }
  if (kind !== 'provinces') {
    fillRuns(image, tiles, runs, overlayPaint(kind));
    return;
  }
  fillRuns(image, tiles, runs, cssOf);
  for (const mode of TINT_MODES) {
    const tinted = state.tinted[mode];
    if (tinted) {
      fillRuns(image, tinted.tiles, runs, function (color) { return cssOf(tinted.tintOfColor.get(color) ?? color); });
    }
  }
}

/** What an overlay's index looks like on screen: the file's own colour, or the blue mask over nothing. */
function overlayPaint(kind: Overlay): (value: number) => string | null {
  const layer = state.indexed[kind];
  if (kind === 'rivers' && layer !== null && layer.shown === 'mask') {
    const river = cssOf((RIVER_COLOR[0] << 16) | (RIVER_COLOR[1] << 8) | RIVER_COLOR[2]);
    return function (index) { return index < RIVER_SEA ? river : null; };
  }
  const palette = layer?.palette;
  return function (index) {
    const at = index * 3;
    return cssOf(((palette?.[at] ?? 0) << 16) | ((palette?.[at + 1] ?? 0) << 8) | (palette?.[at + 2] ?? 0));
  };
}

const cssByColor = new Map<number, string>();

function cssOf(color: number): string {
  const held = cssByColor.get(color);
  if (held !== undefined) { return held; }
  const css = '#' + color.toString(16).padStart(6, '0');
  cssByColor.set(color, css);
  return css;
}

/**
 * Draw the runs onto the tiles they fall in, one `fillRect` a run. Reading the
 * tile back with `getImageData` would cost the whole box the runs span, which
 * for a filled province is most of the map; `paintOf` says what a value looks
 * like, and answers null where it is nothing at all. A run never crosses a
 * row, so it splits only where a tile ends.
 */
function fillRuns(
  image: PixelLayer,
  tiles: readonly Tile[],
  runs: readonly number[],
  paintOf: (value: number) => string | null,
): void {
  const width = image.width;
  const columns = Math.ceil(width / TILE);
  let which = -1;
  let tile: Tile | undefined;
  let context: CanvasRenderingContext2D | null = null;
  let style = '';
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const paint = paintOf(runs[at + 2] ?? 0);
    const x = start % width;
    const y = (start - x) / width;
    const row = Math.floor(y / TILE) * columns;
    const end = x + (runs[at + 1] ?? 0);
    for (let from = x; from < end;) {
      const column = Math.floor(from / TILE);
      const to = Math.min(end, (column + 1) * TILE);
      if (row + column !== which) {
        which = row + column;
        tile = tiles[which];
        context = tile?.canvas.getContext('2d') ?? null;
        style = '';
      }
      if (tile && context) {
        if (paint === null) {
          context.clearRect(from - tile.x, y - tile.y, to - from, 1);
        } else {
          if (paint !== style) { style = paint; context.fillStyle = paint; }
          context.fillRect(from - tile.x, y - tile.y, to - from, 1);
        }
      }
      from = to;
    }
  }
}
