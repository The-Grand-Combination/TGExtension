import type { PositionKind, PositionsSection, ProvincePositions, PositionPoint } from '../model/mapEditor.js';
import { render } from './canvas.js';
import { ctx, mapArea, saveAllButton } from './dom.js';
import { post } from './host.js';
import { definitionById, COLOR_OF, MARKER_MIN_SCALE, pendingPositions, POSITION_KIND_SPECS, state, type DecodedImage, type Draft, type Point } from './state.js';

/**
 * The points of map/positions.txt: the file's own, drawn small once the view is
 * close enough; the selected province's draft, drawn from the form; and the
 * provinces moved and not yet written, which go out together on Save all.
 */

/** What the map lets one grab: the province's points, and the grip that turns its name. */
export type PositionHandle = PositionKind | 'text_rotation';

/** The game draws the name five map pixels to a `text_scale` unit (NCE's `update_province_text_lines`). */
const LABEL_UNIT = 5;

interface LabelLayout {
  readonly x: number;
  readonly y: number;
  /** Radians counter-clockwise, as `text_rotation` keeps them. */
  readonly angle: number;
  readonly size: number;
  readonly name: string;
  readonly width: number;
}

let pendingTimer: number | null = null;

// Positions are one map pixel each, so they only appear once a map pixel is
// a few screen pixels wide. The selected province's points come from the
// form's draft and get a white rim; a point being edited moves live.
export function drawMarkers(left: number, top: number, right: number, bottom: number): void {
  const currentImage = state.image;
  if (!currentImage) { return; }
  ctx.imageSmoothingEnabled = false;
  // The names go under the dots: the dots are what one grabs.
  if (state.showTextLabels && state.view.scale >= MARKER_MIN_SCALE) {
    drawFileLabels(currentImage, left, top, right, bottom);
  }
  if (state.showPositions && state.view.scale >= MARKER_MIN_SCALE) {
    drawFileMarkers(currentImage, left, top, right, bottom);
  }
  // Points edited and not yet written are the edit itself, so neither the zoom
  // nor the layer switch hides them, and below one map pixel they are drawn
  // big enough to see. The province being edited also gets a rim.
  const size = Math.max(1, 3 / state.view.scale);
  drawPendingMarkers(currentImage, size);
  drawDraftMarkers(currentImage, size);
}

/** The points as map/positions.txt has them, one map pixel each. */
function drawFileMarkers(
  currentImage: DecodedImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  for (const marker of state.markers) {
    if (state.draft && marker.id === state.selectedId) { continue; }
    if (pendingPositions.has(marker.id)) { continue; }
    const px = Math.floor(marker.x);
    const py = Math.floor(currentImage.height - marker.y);
    if (px < left - 1 || px > right || py < top - 1 || py > bottom) { continue; }
    ctx.fillStyle = COLOR_OF[marker.kind] ?? '#fff';
    ctx.fillRect(px, py, 1, 1);
  }
}

/** The names as map/positions.txt has them, for every province the page is not holding an edit of. */
function drawFileLabels(
  currentImage: DecodedImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  for (const label of state.labels) {
    if (state.draft && label.id === state.selectedId) { continue; }
    if (pendingPositions.has(label.id)) { continue; }
    const name = provinceName(label.id);
    const size = sizeOf(label.scale);
    const px = label.x;
    const py = currentImage.height - label.y;
    // The name runs from its point, so one starting this far out cannot reach the view.
    const reach = size * name.length;
    if (px < left - reach || px > right + reach || py < top - reach || py > bottom + reach) { continue; }
    drawName(name, px, py, label.rotation, size);
  }
}

/** Provinces moved but not yet written, other than the one being edited. */
function drawPendingMarkers(currentImage: DecodedImage, size: number): void {
  for (const [id, points] of pendingPositions) {
    if (id === state.selectedId) { continue; }
    if (state.showTextLabels) { drawPendingLabel(id, points, currentImage); }
    for (const spec of POSITION_KIND_SPECS) {
      const point = points[spec.kind];
      const x = point ? Number(point.x) : NaN;
      const y = point ? Number(point.y) : NaN;
      if (!isFinite(x) || !isFinite(y)) { continue; }
      ctx.fillStyle = spec.color;
      ctx.fillRect(Math.floor(x), Math.floor(currentImage.height - y), size, size);
    }
  }
}

/** A province moved and not yet written carries its name to where the draft put it. */
function drawPendingLabel(id: number, points: Draft, currentImage: DecodedImage): void {
  const point = points.text_position;
  const x = point ? Number(point.x) : NaN;
  const y = point ? Number(point.y) : NaN;
  if (!isFinite(x) || !isFinite(y)) { return; }
  const scale = draftNumber(points.text_scale) ?? 1;
  drawName(provinceName(id), x, currentImage.height - y, draftNumber(points.text_rotation) ?? 0, sizeOf(scale));
}

/** The province being edited: its form's points, with a white rim. */
function drawDraftMarkers(currentImage: DecodedImage, size: number): void {
  if (!state.draft) { return; }
  if (state.showTextLabels) { drawLabel(size); }
  const rim = 1.5 / state.view.scale;
  for (const spec of POSITION_KIND_SPECS) {
    if (!editableHere(spec.kind, state.details?.isSea === true)) { continue; }
    const point = draftPoint(spec.kind);
    if (!point) { continue; }
    const x = Math.floor(point.x);
    const y = Math.floor(currentImage.height - point.y);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - rim, y - rim, size + 2 * rim, size + 2 * rim);
    ctx.fillStyle = spec.color;
    ctx.fillRect(x, y, size, size);
  }
}

/**
 * The province's name where the game will draw it: from `text_position`, turned
 * by `text_rotation` and sized by `text_scale`, with the grip that turns it at
 * the end of the line. It shows the angle and the size, not the game's own type.
 */
function drawLabel(size: number): void {
  const layout = labelLayout();
  if (!layout) { return; }
  drawName(layout.name, layout.x, layout.y, layout.angle, layout.size);
  const grip = labelGrip(layout);
  const rim = 1.5 / state.view.scale;
  ctx.fillStyle = '#fff';
  ctx.fillRect(grip.x - rim, grip.y - rim, size + 2 * rim, size + 2 * rim);
  ctx.fillStyle = COLOR_OF.text_position ?? '#fff';
  ctx.fillRect(grip.x, grip.y, size, size);
}

/** One name on the map: from its point, turned by its angle, in the size its scale asks for. */
function drawName(name: string, x: number, y: number, angle: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.font = fontOf(size);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size / 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.strokeText(name, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 0, 0);
  ctx.restore();
}

function fontOf(size: number): string {
  return String(size) + 'px sans-serif';
}

function sizeOf(scale: number): number {
  return LABEL_UNIT * Math.max(1, scale);
}

/** What the map calls a province other than the selected one: definition.csv, else the id. */
function provinceName(id: number): string {
  const definition = definitionById.get(id);
  return definition?.name !== undefined && definition.name !== '' ? definition.name : String(id);
}

/** The name the map draws: the localisation's, else what definition.csv calls the province. */
function labelText(): string {
  const details = state.details;
  if (!details) { return ''; }
  const localised = details.localisation.text.trim();
  return localised !== '' ? localised : details.definitionName;
}

function labelLayout(): LabelLayout | null {
  const currentImage = state.image;
  const point = draftPoint('text_position');
  const draft = state.draft;
  if (!currentImage || !point || !draft) { return null; }
  const name = labelText();
  if (name === '') { return null; }
  const size = sizeOf(draftNumber(draft.text_scale) ?? 1);
  ctx.font = fontOf(size);
  return {
    x: point.x,
    y: currentImage.height - point.y,
    angle: draftNumber(draft.text_rotation) ?? 0,
    size: size,
    name: name,
    width: Math.max(size, ctx.measureText(name).width),
  };
}

/** The grip sits at the end of the name, so dragging it swings the whole line around the point. */
function labelGrip(layout: LabelLayout): Point {
  return {
    x: layout.x + layout.width * Math.cos(layout.angle),
    y: layout.y - layout.width * Math.sin(layout.angle),
  };
}

/** A sea province carries only its `unit` point, and the name the map draws for it. */
export function editableHere(kind: PositionKind, isSea: boolean): boolean {
  return !isSea || kind === 'unit' || kind === 'text_position';
}

/** What the tooltip calls a handle. */
export function handleLabel(handle: PositionHandle): string {
  if (handle === 'text_rotation') { return 'Name rotation'; }
  return POSITION_KIND_SPECS.find(function (spec) { return spec.kind === handle; })?.label ?? handle;
}

/** A written number as the form holds it, or null when the field is empty or not a number. */
function draftNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') { return null; }
  const number = Number(value);
  return isFinite(number) ? number : null;
}

/** `text_rotation` for the eye: the same angle in degrees, or nothing when the field is empty. */
export function degreesOf(radians: string | undefined): string {
  const value = draftNumber(radians);
  return value === null ? '' : (value * 180 / Math.PI).toFixed(1) + '°';
}

export function clonePoints(points: Draft | null | undefined): Draft {
  const out: Draft = {};
  for (const spec of POSITION_KIND_SPECS) {
    const point = points?.[spec.kind];
    out[spec.kind] = point ? { x: point.x, y: point.y } : undefined;
  }
  out.text_rotation = points?.text_rotation;
  out.text_scale = points?.text_scale;
  return out;
}

function samePoints(one: Draft | null, other: Draft | null): boolean {
  if (one?.text_rotation !== other?.text_rotation || one?.text_scale !== other?.text_scale) { return false; }
  return POSITION_KIND_SPECS.every(function (spec) {
    const a = one?.[spec.kind];
    const b = other?.[spec.kind];
    if (!a || !b) { return !a && !b; }
    return a.x === b.x && a.y === b.y;
  });
}

/** Hold the selected province's points when they no longer match its file, or let them go when they do. */
export function capturePending(): void {
  const details = state.details;
  if (!details || !state.draft) { return; }
  // A province that is only paint has no id in definition.csv to hold points
  // against: they live with its panel and leave with it. The save that creates
  // it puts the id in the table before this runs, so those points are kept.
  const abandoned = !definitionById.has(details.id);
  if (abandoned || samePoints(state.draft, state.draftBaseline)) { pendingPositions.delete(details.id); }
  else { pendingPositions.set(details.id, clonePoints(state.draft)); }
  refreshPending();
}

export function pendingCount(): number { return pendingPositions.size; }

export function refreshPending(): void {
  const count = pendingCount();
  saveAllButton.hidden = count === 0;
  saveAllButton.textContent = count === 1 ? 'Save 1 province' : 'Save ' + String(count) + ' provinces';
  if (pendingTimer !== null) { clearTimeout(pendingTimer); }
  pendingTimer = window.setTimeout(sendPending, 400);
}

/** The extension keeps the same list, so closing the tab can still offer to write it. */
export function sendPending(): void {
  pendingTimer = null;
  post({ type: 'pending', edits: [...pendingPositions].map(function ([id, data]) {
    return { provinceId: id, data: asPositions(data) };
  }) });
}

/** A draft as a full positions record: every kind present, unset ones undefined. */
export function asPositions(points: Draft): ProvincePositions {
  const out = {} as Record<PositionKind, PositionPoint | undefined>;
  for (const spec of POSITION_KIND_SPECS) { out[spec.kind] = points[spec.kind]; }
  return { ...out, text_rotation: points.text_rotation, text_scale: points.text_scale };
}

/** The draft's point of a kind as numbers, or null when unset or not numeric. */
export function draftPoint(kind: PositionKind): { x: number; y: number } | null {
  const point = state.draft?.[kind];
  if (!point) { return null; }
  const x = Number(point.x);
  const y = Number(point.y);
  return isFinite(x) && isFinite(y) && point.x !== '' && point.y !== '' ? { x: x, y: y } : null;
}

/** The handle of the selected province under the pointer, when close enough to grab. */
export function markerAt(clientX: number, clientY: number): PositionHandle | null {
  const currentImage = state.image;
  const view = state.view;
  if (!state.showPositions || !currentImage || !state.draft || view.scale < MARKER_MIN_SCALE || state.tool !== 'hand') { return null; }
  const rect = mapArea.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  let best: PositionHandle | null = null;
  let bestDistance = Math.max(6, view.scale / 2 + 2);
  for (const spec of POSITION_KIND_SPECS) {
    if (!editableHere(spec.kind, state.details?.isSea === true)) { continue; }
    const point = draftPoint(spec.kind);
    if (!point) { continue; }
    const sx = view.x + (Math.floor(point.x) + 0.5) * view.scale;
    const sy = view.y + (Math.floor(currentImage.height - point.y) + 0.5) * view.scale;
    const distance = Math.hypot(sx - px, sy - py);
    if (distance <= bestDistance) { best = spec.kind; bestDistance = distance; }
  }
  const layout = state.showTextLabels ? labelLayout() : null;
  if (layout) {
    const grip = labelGrip(layout);
    const distance = Math.hypot(view.x + (grip.x + 0.5) * view.scale - px, view.y + (grip.y + 0.5) * view.scale - py);
    if (distance <= bestDistance) { best = 'text_rotation'; }
  }
  return best;
}

/** Move a handle to a map place (x right, y up from the bottom): a point goes there, the grip turns the name. */
export function moveHandle(handle: PositionHandle, x: number, y: number): void {
  if (handle === 'text_rotation') { setDraftRotation(x, y); return; }
  setDraftPoint(handle, x, y);
}

/** Turn the name towards a map place: the angle from its own point, in the radians the file keeps. */
function setDraftRotation(x: number, y: number): void {
  const point = draftPoint('text_position');
  if (!state.draft || !point) { return; }
  const angle = Math.atan2(y - point.y, x - point.x);
  const text = (angle < 0 ? angle + 2 * Math.PI : angle).toFixed(6);
  state.draft.text_rotation = text;
  const inputs = state.labelInputs;
  if (inputs) { inputs.rotation.value = text; inputs.degrees.textContent = degreesOf(text); }
  capturePending();
  render();
}

/** Move one draft point to a map place (x right, y up from the bottom), and show it in the tab and on the map. */
export function setDraftPoint(kind: PositionKind, x: number, y: number): void {
  const image = state.image;
  if (!state.draft || !image) { return; }
  const clampedX = Math.min(image.width, Math.max(0, x));
  const clampedY = Math.min(image.height, Math.max(0, y));
  const point: PositionPoint = { x: clampedX.toFixed(2), y: clampedY.toFixed(2) };
  state.draft[kind] = point;
  const inputs = state.positionInputs[kind];
  if (inputs) { inputs.x.value = point.x; inputs.y.value = point.y; }
  capturePending();
  render();
}

/** Replace what the map knows about one province's points with what the disk now holds. */
export function replaceMarkers(id: number, positions: PositionsSection | undefined): void {
  state.markers = state.markers.filter(function (marker) { return marker.id !== id; });
  state.labels = state.labels.filter(function (label) { return label.id !== id; });
  const data = positions?.data;
  if (!data) { return; }
  for (const spec of POSITION_KIND_SPECS) {
    const point = data[spec.kind];
    const x = point ? Number(point.x) : NaN;
    const y = point ? Number(point.y) : NaN;
    if (isFinite(x) && isFinite(y)) { state.markers.push({ id: id, kind: spec.kind, x: x, y: y }); }
  }
  const named = data.text_position;
  const x = named ? Number(named.x) : NaN;
  const y = named ? Number(named.y) : NaN;
  if (isFinite(x) && isFinite(y)) {
    state.labels.push({
      id: id,
      x: x,
      y: y,
      rotation: draftNumber(data.text_rotation) ?? 0,
      scale: draftNumber(data.text_scale) ?? 1,
    });
  }
}
