import type { PositionKind, PositionsSection, ProvincePositions, PositionPoint } from '../model/mapEditor.js';
import { render } from './canvas.js';
import { ctx, mapArea, saveAllButton } from './dom.js';
import { post } from './host.js';
import { definitionById, COLOR_OF, MARKER_MIN_SCALE, pendingPositions, POSITION_KIND_SPECS, state, type DecodedImage, type Draft } from './state.js';

/**
 * The points of map/positions.txt: the file's own, drawn small once the view is
 * close enough; the selected province's draft, drawn from the form; and the
 * provinces moved and not yet written, which go out together on Save all.
 */

let pendingTimer: number | null = null;

// Positions are one map pixel each, so they only appear once a map pixel is
// a few screen pixels wide. The selected province's points come from the
// form's draft and get a white rim; a point being edited moves live.
export function drawMarkers(left: number, top: number, right: number, bottom: number): void {
  const currentImage = state.image;
  if (!currentImage) { return; }
  ctx.imageSmoothingEnabled = false;
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

/** Provinces moved but not yet written, other than the one being edited. */
function drawPendingMarkers(currentImage: DecodedImage, size: number): void {
  for (const [id, points] of pendingPositions) {
    if (id === state.selectedId) { continue; }
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

/** The province being edited: its form's points, with a white rim. */
function drawDraftMarkers(currentImage: DecodedImage, size: number): void {
  if (!state.draft) { return; }
  const rim = 1.5 / state.view.scale;
  for (const spec of POSITION_KIND_SPECS) {
    if (state.details?.isSea && spec.kind !== 'unit') { continue; }
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

export function clonePoints(points: Draft | null | undefined): Draft {
  const out: Draft = {};
  for (const spec of POSITION_KIND_SPECS) {
    const point = points?.[spec.kind];
    out[spec.kind] = point ? { x: point.x, y: point.y } : undefined;
  }
  return out;
}

function samePoints(one: Draft | null, other: Draft | null): boolean {
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
  return out;
}

/** The draft's point of a kind as numbers, or null when unset or not numeric. */
export function draftPoint(kind: PositionKind): { x: number; y: number } | null {
  const point = state.draft?.[kind];
  if (!point) { return null; }
  const x = Number(point.x);
  const y = Number(point.y);
  return isFinite(x) && isFinite(y) && point.x !== '' && point.y !== '' ? { x: x, y: y } : null;
}

/** The kind of the selected province's point under the pointer, when close enough to grab. */
export function markerAt(clientX: number, clientY: number): PositionKind | null {
  const currentImage = state.image;
  const view = state.view;
  if (!state.showPositions || !currentImage || !state.draft || view.scale < MARKER_MIN_SCALE || state.tool !== 'hand') { return null; }
  const rect = mapArea.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  let best: PositionKind | null = null;
  let bestDistance = Math.max(6, view.scale / 2 + 2);
  for (const spec of POSITION_KIND_SPECS) {
    if (state.details?.isSea && spec.kind !== 'unit') { continue; }
    const point = draftPoint(spec.kind);
    if (!point) { continue; }
    const sx = view.x + (Math.floor(point.x) + 0.5) * view.scale;
    const sy = view.y + (Math.floor(currentImage.height - point.y) + 0.5) * view.scale;
    const distance = Math.hypot(sx - px, sy - py);
    if (distance <= bestDistance) { best = spec.kind; bestDistance = distance; }
  }
  return best;
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
  const data = positions?.data;
  if (!data) { return; }
  for (const spec of POSITION_KIND_SPECS) {
    const point = data[spec.kind];
    const x = point ? Number(point.x) : NaN;
    const y = point ? Number(point.y) : NaN;
    if (isFinite(x) && isFinite(y)) { state.markers.push({ id: id, kind: spec.kind, x: x, y: y }); }
  }
}
