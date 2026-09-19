import type { PaintResult } from '../model/mapEditor.js';
import { DEFAULT_PAINT_UNDO_STEPS } from '../model/mapEditor.js';
import { PAINT_MODES, planStroke, type LayerRuns, type PaintMode, type PaintRules } from '../services/layerPaint.js';
import { addPixel, enclosedRuns, floodRuns, runPixels, runsOfIndices, strokePixels, unusedColor } from '../services/provincePaint.js';
import { boxOfHighlight, boxOfRuns, highlightOf, insideImage, provinceAt, render, toImage, unionBox, wholeMap } from './canvas.js';
import { mapArea, required, requiredButton, requiredInput, setStatus } from './dom.js';
import { messageOf, post } from './host.js';
import { clearSelection } from './input.js';
import { ensureIndexed, layerAbsence, setEditLayer } from './layers.js';
import { brushValue, rgbOf, setBrushValue, takenColors, reservedColors, resetColors, valueName } from './paintColor.js';
import {
  clearDraft,
  dirtyLayers,
  eraseRuns,
  fileRuns,
  paintedIn,
  paintedRuns,
  paintedTotal,
  patchTiles,
  resetDrafts,
  writeRuns,
  type Step,
} from './paintDraft.js';
import { referenceCount } from './references.js';
import { definitionById, FIXED_LAYERS, layerImage, OVERLAYS, seaColors, state, waterTerrain, type FixedLayer, type Point, type Tool } from './state.js';

// --- Painting the map bitmaps -------------------------------------------------
// The pencil and the bucket write into the decoded bitmap of the layer being
// edited, and into the tiles it is drawn from. A mode may carry the same stroke
// into the other two files, so a stroke is taken back across all of them at
// once. Nothing reaches disk until Save, and every stroke can be undone.

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
const generateColorButton = requiredButton('generateColorButton');
const savePaintButton = requiredButton('savePaintButton');
const resetPaintButton = requiredButton('resetPaintButton');
const paintModeButton = requiredButton('paintModeButton');
/** The one button steps through the modes in this order, the last of them none at all. */
const MODE_CYCLE: readonly (PaintMode | null)[] = [...PAINT_MODES, null];
const MODE_NAMES: Record<PaintMode, string> = { lock: 'Terrain Lock', sea: 'Sea Province', multi: 'Multi Draw' };
const MODE_NOTES: Record<PaintMode, string> = {
  lock: 'Terrain Lock: the brush paints only where the other files have land.',
  sea: 'Sea Province: the province map alone, and only over water in terrain.bmp and rivers.bmp.',
  multi: 'Multi Draw: a stroke lands in all three files, so land and sea agree in each of them.',
};
const FREE_NAME = 'Free Paint';
const FREE_NOTE = 'Free Paint: the brush paints the layer you picked, and asks the other files nothing.';

let brush = 1;
let undoLimit = DEFAULT_PAINT_UNDO_STEPS;
/** One stroke, as the values every layer it touched held before it. */
const undoSteps: Step[] = [];
const redoSteps: Step[] = [];
let stroke: Step | null = null;
/** Pixels of the stroke a mode kept the brush off, told at its end. */
let heldBack = 0;
/** Where the pencil last was, so a fast mouse draws a line and not a dotted one. */
let brushAt: Point | null = null;
/** Draw and paint: the line being drawn, kept until the button comes up and it is closed off. */
let drawLine: number[] | null = null;
let paintTimer: number | null = null;
/** The tool the eye drop was picked up from: one value taken, the eye drop hands it back. */
let pickReturn: Tool | null = null;
/** The layers a Save still has to write, in order; one file is written at a time. */
let saveQueue: FixedLayer[] = [];

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

/** True while a button is down on the brush: the mouse is drawing, not panning. */
export function strokeInProgress(): boolean {
  return brushAt !== null;
}

export function startPaint(event: MouseEvent): void {
  const image = layerImage(state.editLayer);
  if (!image) { return; }
  const point = toImage(event.clientX, event.clientY);
  if (!insideImage(image, point)) { return; }
  if (state.tool === 'pick') { pickAt(point); return; }
  stroke = {};
  heldBack = 0;
  if (state.tool === 'bucket') {
    paintRuns(floodRuns(image.packed, image.width, image.height, point.y * image.width + point.x, brushValue()));
    endStroke();
    return;
  }
  brushAt = point;
  if (state.tool === 'draw') { drawLine = []; }
  drawInto(strokePixels(point, point, brushWidth(), image.width, image.height));
}

export function continueStroke(event: MouseEvent): void {
  const image = layerImage(state.editLayer);
  const from = brushAt;
  if (!image || !from) { return; }
  const to = toImage(event.clientX, event.clientY);
  drawInto(strokePixels(from, to, brushWidth(), image.width, image.height));
  brushAt = to;
}

/** Paint the line, and remember it when it is one the Draw and paint tool will close off. */
function drawInto(indices: readonly number[]): void {
  // One at a time: a long segment spread into push() is enough arguments to overflow the stack.
  if (drawLine) { for (const index of indices) { drawLine.push(index); } }
  paintIndices(indices);
}

/** What the line shut away from the rest of the map becomes part of the province. */
function closeLine(line: readonly number[]): void {
  const image = layerImage(state.editLayer);
  if (!image || line.length === 0) { return; }
  const inside = enclosedRuns(image.packed, image.width, image.height, line, brushValue());
  if (inside.length === 0) {
    setStatus('The line closed nothing off: draw out of the colour and back into it.', 'warning');
    return;
  }
  paintRuns(inside);
  setStatus('Filled ' + String(runPixels(inside)) + ' pixel(s)');
}

/** The eye drop takes what the pixel holds in the layer being edited, whether or not a province owns it. */
function pickAt(point: Point): void {
  const kind = state.editLayer;
  const image = layerImage(kind);
  const value = image?.packed[point.y * image.width + point.x];
  if (value === undefined) { return; }
  setBrushValue(value);
  const id = kind === 'provinces' ? provinceAt(point) : undefined;
  setStatus('Painting with ' + valueName(kind, value) + (id === undefined ? '' : ' (province ' + String(id) + ')'));
  const back = pickReturn;
  pickReturn = null;
  if (back !== null) { setTool(back); }
}

/** Every layer the page has decoded, for the mode to read the pixel under the brush in each of them. */
function layerPixels(): Parameters<typeof planStroke>[3] {
  const pixels: Parameters<typeof planStroke>[3] = {};
  for (const kind of FIXED_LAYERS) {
    const image = layerImage(kind);
    if (image) { pixels[kind] = image.packed; }
  }
  return pixels;
}

/**
 * What the modes decide with. The reserved colours are only taken when Multi
 * Draw could actually lay them down — a stroke on the province map paints its
 * own colour, and a lock never paints outside the layer it is given.
 */
function ruleContext(): PaintRules {
  const spare = state.paintMode === 'multi' && state.editLayer !== 'provinces' ? reservedColors() : { land: 0, sea: 0 };
  return {
    seaColors,
    waterTerrain,
    plainsIndex: state.map?.plainsTerrainIndex,
    reservedLand: spare.land,
    reservedSea: spare.sea,
  };
}

/**
 * Why the modes cannot say anything about a stroke yet: a file the mods have
 * and the page has not read, or one that is not the size of the map. Painting
 * on regardless would be the very accident the modes are for.
 */
function readiness(): string | null {
  const map = state.image;
  if (!map) { return 'the map is not loaded yet'; }
  for (const kind of OVERLAYS) {
    if (!state.overlayUri[kind]) { continue; }
    const image = state.indexed[kind];
    if (!image) { return layerAbsence(kind); }
    if (image.width !== map.width || image.height !== map.height) {
      return kind + '.bmp is ' + String(image.width) + ' x ' + String(image.height)
        + ', the map ' + String(map.width) + ' x ' + String(map.height);
    }
  }
  return null;
}

/** The overlays are fetched the moment a mode could need them, not on the first stroke. */
function prefetchLayers(): void {
  if (state.paintMode === null || !state.image) { return; }
  for (const kind of OVERLAYS) {
    if (state.overlayUri[kind] && !state.indexed[kind]) {
      ensureIndexed(kind).catch(function (error: unknown) {
        setStatus('Could not read ' + kind + '.bmp: ' + messageOf(error), 'error');
      });
    }
  }
}

function paintIndices(indices: readonly number[]): void {
  if (indices.length === 0) { return; }
  if (state.tool === 'eraser') { applyWrites(erasePlan(indices)); return; }
  const image = layerImage(state.editLayer);
  if (image) { paintRuns(runsOfIndices(indices, brushValue(), image.width)); }
}

/**
 * The eraser only undoes the draft, so it has nothing to ask a mode; under
 * Multi Draw it takes back what the stroke wrote in the other files too.
 */
function erasePlan(indices: readonly number[]): LayerRuns {
  const writes: LayerRuns = {};
  const kinds = state.paintMode === 'multi' ? FIXED_LAYERS : [state.editLayer];
  for (const kind of kinds) {
    const runs = eraseRuns(kind, indices);
    if (runs.length > 0) { writes[kind] = runs; }
  }
  return writes;
}

/** A stroke on the layer being edited, as the mode lets it land. */
function paintRuns(runs: readonly number[]): void {
  const kind = state.editLayer;
  const image = layerImage(kind);
  if (!image || runs.length === 0) { return; }
  if (state.paintMode === null) {
    applyWrites({ [kind]: [...runs] });
    return;
  }
  const reason = readiness();
  if (reason !== null) {
    prefetchLayers();
    setStatus(MODE_NAMES[state.paintMode] + ': ' + reason + '; untick the modes to paint anyway.', 'warning');
    return;
  }
  const plan = planStroke(runs, kind, state.paintMode, layerPixels(), image.width, ruleContext());
  heldBack += plan.heldBack;
  applyWrites(plan.writes);
}

/** Put the values on the map: the pixels the clicks read, and the tiles the eye reads. */
function applyWrites(writes: LayerRuns): void {
  let touched = false;
  for (const kind of FIXED_LAYERS) {
    const runs = writes[kind];
    if (!runs || runs.length === 0) { continue; }
    const applied = writeRuns(kind, runs, stroke);
    if (applied.length === 0) { continue; }
    patchTiles(kind, applied);
    touched = true;
  }
  if (touched) { render(); }
}

function anyRuns(step: Step): boolean {
  return FIXED_LAYERS.some(function (kind) { return (step[kind]?.length ?? 0) > 0; });
}

export function endStroke(): void {
  if (drawLine) {
    closeLine(drawLine);
    drawLine = null;
  }
  const step = stroke;
  stroke = null;
  brushAt = null;
  const mode = state.paintMode;
  if (heldBack > 0 && mode !== null) {
    setStatus(String(heldBack) + ' pixel(s) held back by ' + MODE_NAMES[mode] + ': the other files disagree there', 'warning');
  }
  heldBack = 0;
  if (!step || !anyRuns(step)) { return; }
  undoSteps.push(step);
  while (undoSteps.length > undoLimit) { undoSteps.shift(); }
  redoSteps.length = 0;
  refreshPainted();
  refreshOutline(step.provinces ?? []);
}

export function stepBack(): void {
  const step = undoSteps.pop();
  if (!step) { return; }
  redoSteps.push(valuesNow(step));
  applyStep(step);
}

export function stepForward(): void {
  const step = redoSteps.pop();
  if (!step) { return; }
  undoSteps.push(valuesNow(step));
  applyStep(step);
}

/** The values those pixels hold right now, layer by layer: the way back from the step about to be applied. */
function valuesNow(step: Step): Step {
  const out: Step = {};
  for (const kind of FIXED_LAYERS) {
    const runs = step[kind];
    const image = layerImage(kind);
    if (!runs || !image) { continue; }
    const back: number[] = [];
    for (let at = 0; at < runs.length; at += 3) {
      const start = runs[at] ?? 0;
      const end = start + (runs[at + 1] ?? 0);
      for (let index = start; index < end; index++) {
        addPixel(back, index, image.packed[index] ?? 0, image.width);
      }
    }
    out[kind] = back;
  }
  return out;
}

function applyStep(step: Step): void {
  // What the pixels held before the step is what says whether the outline moved:
  // a step that takes the selected province's colour away leaves nothing of it behind.
  const before = valuesNow(step);
  applyWrites(step);
  refreshPainted();
  refreshOutline(before.provinces ?? []);
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

/** The files a Save would write, as the buttons name them. */
function dirtyFiles(): string {
  return dirtyLayers().map(function (kind) { return 'map/' + kind + '.bmp'; }).join(', ');
}

/** Both buttons stand whether there is anything to write or not, greyed until there is. */
function refreshPainted(): void {
  const held = paintedTotal();
  savePaintButton.disabled = held === 0;
  resetPaintButton.disabled = held === 0;
  savePaintButton.title = held === 0
    ? 'Nothing painted to write'
    : 'Write ' + String(held) + ' painted pixel(s) into ' + dirtyFiles();
  resetPaintButton.title = held === 0
    ? 'Nothing painted to put back'
    : 'Put ' + String(held) + ' painted pixel(s) back the way the files have them';
  if (paintTimer !== null) { clearTimeout(paintTimer); }
  paintTimer = window.setTimeout(function () {
    paintTimer = null;
    post({ type: 'paintPending', pixels: paintedTotal() });
  }, 400);
}

/** A new map, or one written back: nothing is held any more. */
export function resetPaint(): void {
  resetDrafts();
  undoSteps.length = 0;
  redoSteps.length = 0;
  stroke = null;
  brushAt = null;
  drawLine = null;
  saveQueue = [];
  resetColors();
  refreshPainted();
}

/**
 * The pixels a province was painted out of, written with the Save that
 * created it: until they are in provinces.bmp the new row in definition.csv
 * names a colour the map does not have.
 */
export function saveNewProvincePaint(): void {
  if (paintedTotal() > 0) { savePainted(); }
}

export function handlePainted(result: PaintResult): void {
  if (!result.ok) {
    saveQueue = [];
    refreshPainted();
    setStatus(result.reason, 'error');
    return;
  }
  clearDraft(result.layer);
  saveQueue = saveQueue.filter(function (kind) { return kind !== result.layer; });
  setStatus('Wrote ' + String(result.pixels) + ' pixel(s) to ' + (result.path.split(/[\\/]/).pop() ?? result.path), 'ok');
  if (saveQueue.length > 0) { postNextPaint(); return; }
  resetPaint();
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
  if (next === 'pencil' || next === 'draw' || next === 'bucket') { prefetchLayers(); }
  if (next === 'eraser') {
    setStatus('Eraser: drag over what you painted to take it back; the file\'s own pixels stay. Click the pencil again for the pencil.');
  }
  if (next === 'reference') {
    setStatus(referenceCount() === 0
      ? 'No reference pictures yet: Add Reference in the Layers box puts one on the map.'
      : 'Click a picture to select it; drag moves it, a grip stretches, Shift keeps proportions, Ctrl distorts.');
  }
}

/**
 * One button for the lot: each click is the next mode, and the fourth is none
 * of them, which is what unticking the old Terrain Lock did.
 */
function setPaintMode(mode: PaintMode | null): void {
  if (mode === 'sea') {
    state.paintMode = null;
    setEditLayer('provinces');
  }
  state.paintMode = mode;
  showPaintMode();
  prefetchLayers();
  setStatus(mode === null ? FREE_NOTE : MODE_NOTES[mode]);
}

function showPaintMode(): void {
  const mode = state.paintMode;
  const at = MODE_CYCLE.indexOf(mode);
  const next = MODE_CYCLE[(at + 1) % MODE_CYCLE.length] ?? null;
  paintModeButton.textContent = mode === null ? FREE_NAME : MODE_NAMES[mode];
  paintModeButton.classList.toggle('off', mode === null);
  paintModeButton.title = (mode === null ? FREE_NOTE : MODE_NOTES[mode])
    + ' Click for ' + (next === null ? FREE_NAME : MODE_NAMES[next]) + '.';
}

function stepPaintMode(): void {
  const at = MODE_CYCLE.indexOf(state.paintMode);
  setPaintMode(MODE_CYCLE[(at + 1) % MODE_CYCLE.length] ?? null);
}

function resetPainted(): void {
  if (paintedTotal() === 0) { return; }
  // Only a layer that has been painted has a copy of its file to compare against;
  // asking for one would take a copy of the whole map to answer nothing.
  const before = paintedIn('provinces') > 0 ? paintedRuns('provinces') : [];
  const writes: LayerRuns = {};
  for (const kind of dirtyLayers()) { writes[kind] = fileRuns(kind); }
  applyWrites(writes);
  resetPaint();
  refreshOutline(before);
  // The colour a new province was made of is gone with the paint, and so is the province.
  if (state.details?.isNew) { clearSelection(); }
  setStatus('The map is back the way the files have it');
}

/** One file at a time: the next layer is posted once the one before it is written. */
function savePainted(): void {
  if (paintedTotal() === 0) { return; }
  saveQueue = dirtyLayers();
  savePaintButton.disabled = true;
  postNextPaint();
}

function postNextPaint(): void {
  const kind = saveQueue[0];
  if (kind === undefined) { return; }
  const runs = paintedRuns(kind);
  setStatus('Writing ' + String(runPixels(runs)) + ' pixel(s) to ' + kind + '.bmp…');
  post({ type: 'paint', layer: kind, runs });
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
    setBrushValue(color);
    setStatus('Painting with ' + rgbOf(color) + ', which nothing on the map uses');
  });
  paintModeButton.addEventListener('click', stepPaintMode);
  showPaintMode();
  resetPaintButton.addEventListener('click', resetPainted);
  savePaintButton.addEventListener('click', savePainted);
  setTool('hand');
  refreshPainted();
}
