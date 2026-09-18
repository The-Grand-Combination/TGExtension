import type { PaintResult } from '../model/mapEditor.js';
import { DEFAULT_PAINT_UNDO_STEPS } from '../model/mapEditor.js';
import { addPixel, changedRuns, enclosedRuns, floodRuns, runPixels, runsOfIndices, strokePixels, unusedColor } from '../services/provincePaint.js';
import { boxOfHighlight, boxOfRuns, highlightOf, insideImage, provinceAt, render, toImage, unionBox, wholeMap } from './canvas.js';
import { mapArea, required, requiredButton, requiredInput, setStatus } from './dom.js';
import { messageOf, post } from './host.js';
import { clearSelection } from './input.js';
import { ensureTerrain, terrainAbsence } from './layers.js';
import { referenceCount } from './references.js';
import { definitionById, state, TILE, TINT_MODES, waterTerrain, type DecodedImage, type Point, type Tile, type Tool } from './state.js';

// --- Painting provinces -------------------------------------------------------
// The pencil and the bucket write into the decoded bitmap and into the tiles it
// is drawn from. Nothing reaches provinces.bmp until Save map, and every stroke
// can be taken back until then.

const TOOLS: readonly { readonly tool: Tool; readonly id: string }[] = [
  { tool: 'hand', id: 'toolHand' },
  { tool: 'reference', id: 'toolReference' },
  { tool: 'pencil', id: 'toolPencil' },
  { tool: 'draw', id: 'toolDraw' },
  { tool: 'bucket', id: 'toolBucket' },
  { tool: 'pick', id: 'toolPick' },
];
const toolButtons = TOOLS.map(function (spec) { return { tool: spec.tool, button: requiredButton(spec.id) }; });
const brushSize = requiredInput('brushSize');
const brushSizeValue = required('brushSizeValue');
const brushRow = required('brushRow');
const paintColorInput = requiredInput('paintColor');
const paintColorText = required('paintColorText');
const generateColorButton = requiredButton('generateColorButton');
const terrainLockInput = requiredInput('terrainLock');
const savePaintButton = requiredButton('savePaintButton');
const resetPaintButton = requiredButton('resetPaintButton');

/** What the brush writes. A colour of its own, not a province: the map is pixels. */
let brushColor = 0xff0000;
let brush = 1;
let undoLimit = DEFAULT_PAINT_UNDO_STEPS;
/**
 * The map as the file has it, copied the first time a stroke lands on it: what
 * the eraser and Reset put back, and what says which pixels a Save has to
 * write. One array of the map's own size, not one entry per painted pixel — a
 * bucket over a large region would fill a Map with millions of them.
 */
let fileColorsHeld: Uint32Array | null = null;
let fileColorsOf: DecodedImage | null = null;
/** How many pixels no longer hold their file colour: what a Save writes. */
let paintedCount = 0;
/** One stroke, as runs of the colours the pixels held before it: undo writes those straight back. */
const undoSteps: number[][] = [];
const redoSteps: number[][] = [];
let stroke: number[] | null = null;
/** Pixels of the stroke the Terrain Lock kept off the water, told at its end. */
let heldBack = 0;
/** Where the pencil last was, so a fast mouse draws a line and not a dotted one. */
let brushAt: Point | null = null;
/** Draw and paint: the line being drawn, kept until the button comes up and it is closed off. */
let drawLine: number[] | null = null;
let paintTimer: number | null = null;
/** The tool the eye drop was picked up from: one colour taken, the eye drop hands it back. */
let pickReturn: Tool | null = null;
/**
 * Every colour the map already uses: the table's rows, its lakes, and what the
 * bitmap itself holds — a colour no row names is still a blob on the map, and
 * handing it out would silently merge the two. The bitmap is walked once, on
 * the first Generate, and kept: after it, the only colour that can reach the
 * map is the brush's, and `setBrushColor` adds that one as it goes.
 */
let usedColors: Set<number> | null = null;

/** The eraser lives on the pencil's button: it is the pencil, lit, with the other glyph. */
function isPencilButton(tool: Tool, next: Tool): boolean {
  return tool === next || (tool === 'pencil' && next === 'eraser');
}

export function setTool(next: Tool): void {
  state.tool = next;
  for (const entry of toolButtons) {
    entry.button.classList.toggle('active', isPencilButton(entry.tool, next));
    if (entry.tool === 'pencil') { entry.button.classList.toggle('erasing', next === 'eraser'); }
  }
  brushSize.disabled = !paints(next);
  brushRow.classList.toggle('off', !paints(next));
  mapArea.classList.toggle('painting', next !== 'hand' && next !== 'pick' && next !== 'reference');
  mapArea.classList.toggle('picking', next === 'pick');
  mapArea.classList.toggle('referencing', next === 'reference');
  render();
}

/** The tools the brush width is for. */
function paints(which: Tool): boolean {
  return which === 'pencil' || which === 'eraser' || which === 'draw';
}

/**
 * A drawn line is a wall the fill must not leak through, and a one-pixel line
 * drawn at an angle leaks through its own corners: it is never thinner than two.
 */
function brushWidth(): number {
  return state.tool === 'draw' ? Math.max(2, brush) : brush;
}

function setBrushColor(color: number): void {
  brushColor = color & 0xffffff;
  paintColorInput.value = hexOf(brushColor);
  paintColorInput.title = 'Painting with ' + hexOf(brushColor);
  paintColorText.textContent = rgbOf(brushColor);
  // Whatever the brush holds can reach the map, so Generate must never offer it again.
  usedColors?.add(brushColor);
}

export function hexOf(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function rgbOf(color: number): string {
  return String((color >> 16) & 255) + ' ' + String((color >> 8) & 255) + ' ' + String(color & 255);
}

function takenColors(): Set<number> {
  const kept = usedColors;
  if (kept) { return kept; }
  const taken = new Set<number>();
  for (const definition of state.map?.definitions ?? []) { taken.add(definition.color); }
  for (const color of state.map?.lakeColors ?? []) { taken.add(color); }
  for (const color of state.image?.packed ?? []) { taken.add(color); }
  taken.add(brushColor);
  usedColors = taken;
  return taken;
}

/** True while a button is down on the brush: the mouse is drawing, not panning. */
export function strokeInProgress(): boolean {
  return brushAt !== null;
}

export function startPaint(event: MouseEvent): void {
  const currentImage = state.image;
  if (!currentImage) { return; }
  const point = toImage(event.clientX, event.clientY);
  if (!insideImage(currentImage, point)) { return; }
  if (state.tool === 'pick') { pickAt(point); return; }
  const color = brushColor;
  stroke = [];
  heldBack = 0;
  if (state.tool === 'bucket') {
    paintRuns(floodRuns(currentImage.packed, currentImage.width, currentImage.height, point.y * currentImage.width + point.x, color));
    endStroke();
    return;
  }
  brushAt = point;
  if (state.tool === 'draw') { drawLine = []; }
  drawInto(strokePixels(point, point, brushWidth(), currentImage.width, currentImage.height), color);
}

export function continueStroke(event: MouseEvent): void {
  const currentImage = state.image;
  const from = brushAt;
  if (!currentImage || !from) { return; }
  const to = toImage(event.clientX, event.clientY);
  drawInto(strokePixels(from, to, brushWidth(), currentImage.width, currentImage.height), brushColor);
  brushAt = to;
}

/** Paint the line, and remember it when it is one the Draw and paint tool will close off. */
function drawInto(indices: readonly number[], color: number): void {
  // One at a time: a long segment spread into push() is enough arguments to overflow the stack.
  if (drawLine) { for (const index of indices) { drawLine.push(index); } }
  paintIndices(indices, color);
}

/** What the line shut away from the rest of the map becomes part of the province. */
function closeLine(line: readonly number[]): void {
  const currentImage = state.image;
  if (!currentImage || line.length === 0) { return; }
  const inside = enclosedRuns(currentImage.packed, currentImage.width, currentImage.height, line, brushColor);
  if (inside.length === 0) {
    setStatus('The line closed nothing off: draw out of the colour and back into it.', 'warning');
    return;
  }
  paintRuns(inside);
  setStatus('Filled ' + String(runPixels(inside)) + ' pixel(s)');
}

/** The eye drop takes the colour the pixel holds, whether or not a province owns it. */
function pickAt(point: Point): void {
  const currentImage = state.image;
  if (!currentImage) { return; }
  const color = currentImage.packed[point.y * currentImage.width + point.x];
  if (color === undefined) { return; }
  setBrushColor(color);
  const id = provinceAt(point);
  setStatus('Painting with ' + hexOf(color) + (id === undefined ? '' : ' (province ' + String(id) + ')'));
  const back = pickReturn;
  pickReturn = null;
  if (back !== null) { setTool(back); }
}

/**
 * With the Terrain Lock on, only the pixels terrain.bmp has as land; null,
 * with the reason on the status bar, while there is nothing to check against.
 * Painting on regardless would be the very accident the lock is for.
 */
function landOnly(runs: readonly number[], currentImage: DecodedImage): readonly number[] | null {
  const terrain = state.terrain;
  if (!terrain) {
    prefetchTerrain();
    setStatus('Terrain Lock: ' + terrainAbsence() + '; untick it to paint anyway.', 'warning');
    return null;
  }
  if (terrain.width !== currentImage.width || terrain.height !== currentImage.height) {
    setStatus('Terrain Lock: terrain.bmp is ' + String(terrain.width) + ' x ' + String(terrain.height) + ', the map '
      + String(currentImage.width) + ' x ' + String(currentImage.height) + '; untick it to paint anyway.', 'warning');
    return null;
  }
  const land: number[] = [];
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const color = runs[at + 2] ?? 0;
    const end = start + (runs[at + 1] ?? 0);
    for (let index = start; index < end; index++) {
      if (waterTerrain.has(terrain.indices[index] ?? 0)) { heldBack++; } else { addPixel(land, index, color, currentImage.width); }
    }
  }
  return land;
}

/** terrain.bmp is fetched the moment the lock could need it, not on the first stroke. */
function prefetchTerrain(): void {
  if (!state.terrainLock || state.terrain || !state.image || !state.overlayUri.terrain) { return; }
  ensureTerrain().catch(function (error: unknown) { setStatus('Could not read terrain.bmp: ' + messageOf(error), 'error'); });
}

/** The map as the file has it, taken before the first stroke touches this image. */
function fileColors(currentImage: DecodedImage): Uint32Array {
  if (fileColorsOf !== currentImage || !fileColorsHeld) {
    fileColorsOf = currentImage;
    fileColorsHeld = currentImage.packed.slice();
  }
  return fileColorsHeld;
}

/** The eraser only undoes the draft: a pixel still the file's is not its business, so the lock has nothing to say. */
function eraseRuns(indices: readonly number[], currentImage: DecodedImage): number[] {
  const file = fileColors(currentImage);
  const runs: number[] = [];
  for (const index of [...indices].sort(function (one, other) { return one - other; })) {
    const original = file[index];
    if (original !== undefined && currentImage.packed[index] !== original) {
      addPixel(runs, index, original, currentImage.width);
    }
  }
  return runs;
}

function paintIndices(indices: readonly number[], color: number): void {
  const currentImage = state.image;
  if (!currentImage || indices.length === 0) { return; }
  if (state.tool === 'eraser') { paintRuns(eraseRuns(indices, currentImage), true); return; }
  paintRuns(runsOfIndices(indices, color, currentImage.width));
}

/**
 * Put the colours on the map: the pixels the clicks read, and the tiles the
 * eye reads. The eraser has already checked what it is putting back, so it
 * passes the Terrain Lock by.
 */
function paintRuns(runs: readonly number[], erasing = false): void {
  const currentImage = state.image;
  if (!currentImage || runs.length === 0) { return; }
  const allowed = state.terrainLock && !erasing ? landOnly(runs, currentImage) : runs;
  if (!allowed) { return; }
  const applied = writeRuns(currentImage, allowed);
  if (applied.length === 0) { return; }
  patchTiles(currentImage, applied);
  render();
}

/**
 * Write the runs into the decoded map, answering with the pixels that changed
 * hands: a run may cross pixels that already hold its colour, and those are
 * neither drawn again nor taken back by an undo.
 */
function writeRuns(currentImage: DecodedImage, runs: readonly number[]): number[] {
  const file = fileColors(currentImage);
  const packed = currentImage.packed;
  const width = currentImage.width;
  const applied: number[] = [];
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const color = runs[at + 2] ?? 0;
    const end = start + (runs[at + 1] ?? 0);
    for (let index = start; index < end; index++) {
      const before = packed[index];
      if (before === undefined || before === color) { continue; }
      countPainted(before, color, file[index] ?? before);
      packed[index] = color;
      if (stroke) { addPixel(stroke, index, before, width); }
      addPixel(applied, index, color, width);
    }
  }
  return applied;
}

/** One pixel changing colour: it starts differing from the file, stops differing, or was already doing either. */
function countPainted(before: number, color: number, original: number): void {
  if (before === original) { paintedCount++; } else if (color === original) { paintedCount--; }
}

function patchTiles(currentImage: DecodedImage, runs: readonly number[]): void {
  fillRuns(currentImage, runs, currentImage.tiles, null);
  for (const mode of TINT_MODES) {
    const tinted = state.tinted[mode];
    if (tinted) { fillRuns(currentImage, runs, tinted.tiles, tinted.tintOfColor); }
  }
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
 * for a filled province is most of the map; `tints` maps each colour to its
 * repaint. A run never crosses a row, so it splits only where a tile ends.
 */
function fillRuns(
  currentImage: DecodedImage,
  runs: readonly number[],
  tiles: readonly Tile[],
  tints: ReadonlyMap<number, number> | null,
): void {
  const width = currentImage.width;
  const columns = Math.ceil(width / TILE);
  let which = -1;
  let tile: Tile | undefined;
  let context: CanvasRenderingContext2D | null = null;
  let style = -1;
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const own = runs[at + 2] ?? 0;
    const color = (tints ? tints.get(own) : undefined) ?? own;
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
        style = -1;
      }
      if (tile && context) {
        if (color !== style) { style = color; context.fillStyle = cssOf(color); }
        context.fillRect(from - tile.x, y - tile.y, to - from, 1);
      }
      from = to;
    }
  }
}

export function endStroke(): void {
  if (drawLine) {
    closeLine(drawLine);
    drawLine = null;
  }
  const step = stroke;
  stroke = null;
  brushAt = null;
  if (heldBack > 0) { setStatus(String(heldBack) + ' pixel(s) held back by Terrain Lock: no land there in terrain.bmp', 'warning'); }
  heldBack = 0;
  if (!step || step.length === 0) { return; }
  undoSteps.push(step);
  while (undoSteps.length > undoLimit) { undoSteps.shift(); }
  redoSteps.length = 0;
  refreshPainted();
  refreshOutline(step);
}

export function stepBack(): void {
  const step = undoSteps.pop();
  if (!step) { return; }
  redoSteps.push(colorsNow(step));
  applyStep(step);
}

export function stepForward(): void {
  const step = redoSteps.pop();
  if (!step) { return; }
  undoSteps.push(colorsNow(step));
  applyStep(step);
}

/** The colours those pixels hold right now: the way back from the step about to be applied. */
function colorsNow(step: readonly number[]): number[] {
  const currentImage = state.image;
  const out: number[] = [];
  if (!currentImage) { return out; }
  for (let at = 0; at < step.length; at += 3) {
    const start = step[at] ?? 0;
    const end = start + (step[at + 1] ?? 0);
    for (let index = start; index < end; index++) {
      addPixel(out, index, currentImage.packed[index] ?? 0, currentImage.width);
    }
  }
  return out;
}

function applyStep(step: readonly number[]): void {
  // What the pixels held before the step is what says whether the outline moved:
  // a step that takes the selected province's colour away leaves nothing of it behind.
  const before = colorsNow(step);
  paintRuns(step, true);
  refreshPainted();
  refreshOutline(before);
}

/**
 * The selected province may have gained or lost pixels, so its outline is drawn
 * again at the end of a stroke, never during one. `was` is the colour of each
 * pixel before the change; the map already holds the new one. The province can
 * only be where it was or where the paint went, so only that much is walked.
 */
function refreshOutline(was: readonly number[]): void {
  const currentImage = state.image;
  const id = state.selectedId;
  const color = id === null ? undefined : definitionById.get(id)?.color;
  if (id === null || !currentImage || color === undefined) { return; }
  for (let at = 0; at < was.length; at += 3) {
    const start = was[at] ?? 0;
    const end = start + (was[at + 1] ?? 0);
    const before = was[at + 2];
    for (let index = start; index < end; index++) {
      if (before === color || currentImage.packed[index] === color) {
        const within = state.selection
          ? unionBox(boxOfHighlight(state.selection), boxOfRuns(currentImage, was))
          : wholeMap(currentImage);
        state.selection = highlightOf(id, undefined, within);
        render();
        return;
      }
    }
  }
}

/** Both buttons stand whether there is anything to write or not, greyed until there is. */
function refreshPainted(): void {
  const held = paintedCount;
  savePaintButton.disabled = held === 0;
  resetPaintButton.disabled = held === 0;
  savePaintButton.title = held === 0
    ? 'Nothing painted to write'
    : 'Write ' + String(held) + ' painted pixel(s) into map/provinces.bmp';
  resetPaintButton.title = held === 0
    ? 'Nothing painted to put back'
    : 'Put ' + String(held) + ' painted pixel(s) back the way the file has them';
  if (paintTimer !== null) { clearTimeout(paintTimer); }
  paintTimer = window.setTimeout(function () {
    paintTimer = null;
    post({ type: 'paintPending', pixels: paintedCount });
  }, 400);
}

/** A new map, or one written back: nothing is held any more. */
export function resetPaint(): void {
  paintedCount = 0;
  fileColorsHeld = null;
  fileColorsOf = null;
  undoSteps.length = 0;
  redoSteps.length = 0;
  stroke = null;
  brushAt = null;
  drawLine = null;
  usedColors = null;
  refreshPainted();
}

/**
 * The pixels a province was painted out of, written with the Save that
 * created it: until they are in provinces.bmp the new row in definition.csv
 * names a colour the map does not have.
 */
export function saveNewProvincePaint(): void {
  if (paintedCount > 0) { savePainted(); }
}

export function handlePainted(result: PaintResult): void {
  if (!result.ok) { refreshPainted(); setStatus(result.reason, 'error'); return; }
  const pixels = result.pixels;
  resetPaint();
  setStatus('Wrote ' + String(pixels) + ' pixel(s) to ' + (result.path.split(/[\\/]/).pop() ?? result.path), 'ok');
}

/** How many strokes can be taken back; the ones over the new limit are dropped. */
export function applyUndoLimit(steps: number): void {
  undoLimit = Math.max(1, Math.round(steps));
  while (undoSteps.length > undoLimit) { undoSteps.shift(); }
}

/** A tool button: the eye drop remembers where it came from, the pencil clicked again is the eraser, the reference tool says what it does. */
function pickTool(clicked: Tool): void {
  const next = clicked === 'pencil' && state.tool === 'pencil' ? 'eraser' : clicked;
  // Picked up from the pencil, the eye drop goes back to the pencil after one
  // colour; picked up on purpose, or left for another tool, it does not.
  pickReturn = next === 'pick' && state.tool !== 'pick' ? state.tool : null;
  setTool(next);
  if (next === 'pencil' || next === 'draw' || next === 'bucket') { prefetchTerrain(); }
  if (next === 'eraser') {
    setStatus('Eraser: drag over what you painted to take it back; the file\'s own pixels stay. Click the pencil again for the pencil.');
  }
  if (next === 'reference') {
    setStatus(referenceCount() === 0
      ? 'No reference pictures yet: Add Reference in the Layers box puts one on the map.'
      : 'Click a picture to select it; drag moves it, a grip stretches, Shift keeps proportions, Ctrl distorts.');
  }
}

function resetPainted(): void {
  const currentImage = state.image;
  if (!currentImage || paintedCount === 0) { return; }
  const file = fileColors(currentImage);
  const before = changedRuns(currentImage.packed, file, currentImage.width);
  paintRuns(changedRuns(file, currentImage.packed, currentImage.width), true);
  resetPaint();
  refreshOutline(before);
  // The colour a new province was made of is gone with the paint, and so is the province.
  if (state.details?.isNew) { clearSelection(); }
  setStatus('The map is back the way the file has it');
}

function savePainted(): void {
  const currentImage = state.image;
  if (!currentImage || paintedCount === 0) { return; }
  savePaintButton.disabled = true;
  setStatus('Writing ' + String(paintedCount) + ' pixel(s) to provinces.bmp…');
  post({ type: 'paint', runs: changedRuns(currentImage.packed, fileColors(currentImage), currentImage.width) });
}

export function initPaint(): void {
  for (const entry of toolButtons) {
    entry.button.addEventListener('click', function () { pickTool(entry.tool); });
  }
  brushSize.addEventListener('input', function () {
    brush = Math.min(16, Math.max(1, Math.round(Number(brushSize.value) || 1)));
    brushSizeValue.textContent = String(brush);
  });
  generateColorButton.addEventListener('click', function () {
    const color = unusedColor(takenColors());
    if (color === undefined) { setStatus('Every colour is taken; nothing is left to generate.', 'error'); return; }
    setBrushColor(color);
    setStatus('Painting with ' + rgbOf(color) + ', which nothing on the map uses');
  });
  paintColorInput.addEventListener('input', function () {
    const color = Number.parseInt(paintColorInput.value.slice(1), 16);
    setBrushColor(Number.isNaN(color) ? 0 : color);
  });
  terrainLockInput.checked = state.terrainLock;
  terrainLockInput.addEventListener('change', function () {
    state.terrainLock = terrainLockInput.checked;
    prefetchTerrain();
  });
  resetPaintButton.addEventListener('click', resetPainted);
  savePaintButton.addEventListener('click', savePainted);
  setTool('hand');
  refreshPainted();
}
