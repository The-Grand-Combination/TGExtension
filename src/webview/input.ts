import { fitView, highlightOf, insideImage, provinceAt, render, toImage, toImageExact, zoomAt } from './canvas.js';
import { canvas, mapArea, required, requiredInput, saveAllButton, setStatus, tooltip } from './dom.js';
import { post } from './host.js';
import { continueStroke, endStroke, hexOf, setTool, startPaint, stepBack, stepForward, strokeInProgress } from './paint.js';
import { renderSide, resetHeader, showHint } from './panel/panel.js';
import { capturePending, handleLabel, markerAt, moveHandle, pendingCount, sendPending, type PositionHandle } from './positions.js';
import { endReferenceDrag, gripCursor, hasActiveReference, moveReference, pressReference, referenceDragging, selectReference } from './references.js';
import { definitionById, seaIds, state, type Highlight, type Point, type Tool } from './state.js';

/** The mouse and the keyboard over the map, and what a click on it opens. */

/** A press that is either panning the map or moving one of the selected province's points. */
interface Drag {
  readonly startX: number;
  readonly startY: number;
  readonly viewX: number;
  readonly viewY: number;
  moved: boolean;
  readonly marker: PositionHandle | null;
  /** Only the left button opens a province: the others are here to move the map. */
  readonly select: boolean;
  /** The tool the right button borrowed the hand from, given back when it comes up. */
  readonly restore: Tool | null;
}

let drag: Drag | null = null;
const gotoInput = requiredInput('goto');

function onMouseDown(event: MouseEvent): void {
  // The middle button pans under every tool: painting a border is no reason to
  // have to put the brush down to reach the rest of the map.
  if (event.button === 0 && state.tool !== 'hand') {
    if (event.target === canvas) { if (state.tool === 'reference') { pressReference(event); } else { startPaint(event); } }
    return;
  }
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) { return; }
  // The right button is the hand while it is held: it ends whatever was being
  // drawn, moves the map, and gives the tool back on the way up.
  let restore: Tool | null = null;
  if (event.button === 2 && state.tool !== 'hand') {
    if (strokeInProgress()) { endStroke(); }
    restore = state.tool;
    setTool('hand');
  }
  // A press on one of the selected province's points moves that point instead of the map.
  const marker = event.button === 0 && event.target === canvas ? markerAt(event.clientX, event.clientY) : null;
  drag = { startX: event.clientX, startY: event.clientY, viewX: state.view.x, viewY: state.view.y, moved: false, marker: marker, select: event.button === 0, restore: restore };
  mapArea.classList.add(marker ? 'moving' : 'dragging');
}

function onMouseMove(event: MouseEvent): void {
  if (strokeInProgress()) { continueStroke(event); return; }
  if (referenceDragging()) { moveReference(event); return; }
  gripCursor(event.clientX, event.clientY);
  const current = drag;
  if (current?.marker && state.image) {
    current.moved = true;
    const place = toImageExact(event.clientX, event.clientY);
    moveHandle(current.marker, place.x, state.image.height - place.y);
    return;
  }
  if (current) {
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) { current.moved = true; }
    state.view.x = current.viewX + dx; state.view.y = current.viewY + dy;
    render();
    return;
  }
  showTooltip(event);
}

function onMouseUp(event: MouseEvent): void {
  if (strokeInProgress()) { endStroke(); return; }
  if (referenceDragging()) { endReferenceDrag(); gripCursor(event.clientX, event.clientY); return; }
  if (!drag) { return; }
  const wasClick = !drag.moved && !drag.marker && drag.select;
  const restore = drag.restore;
  drag = null;
  mapArea.classList.remove('dragging');
  if (restore) { setTool(restore); }
  if (wasClick && event.target === canvas) {
    clickAt(toImage(event.clientX, event.clientY));
  }
}

/** The window lost the mouse with a button down: whatever it was doing ends where it is. */
function onBlur(): void {
  if (strokeInProgress()) { endStroke(); }
  endReferenceDrag();
  const restore = drag?.restore ?? null;
  drag = null;
  mapArea.classList.remove('dragging');
  if (restore) { setTool(restore); }
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target;
  if (event.key === 'Escape' && hasActiveReference() && !(target instanceof HTMLInputElement)) {
    selectReference(null);
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) { return; }
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    stepBack();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    stepForward();
  }
}

function showTooltip(event: MouseEvent): void {
  if (!state.image || event.target !== canvas) { tooltip.hidden = true; mapArea.classList.remove('moving'); return; }
  const handle = state.tool === 'hand' ? markerAt(event.clientX, event.clientY) : null;
  mapArea.classList.toggle('moving', handle !== null);
  const place = toImage(event.clientX, event.clientY);
  const id = handle ? state.selectedId : provinceAt(place);
  if (id === undefined || id === null) { showColorTooltip(event, place); return; }
  const definition = definitionById.get(id);
  tooltip.textContent = handle
    ? handleLabel(handle) + ' · ' + String(id) + (handle === 'text_rotation' ? ' (drag to turn the name)' : ' (drag to move)')
    : String(id) + (definition?.name ? ' · ' + definition.name : '') + (seaIds.has(id) ? ' (sea)' : '');
  placeTooltip(event);
}

/** A colour of definition.csv is a province; anything else is paint waiting for a province. */
function showColorTooltip(event: MouseEvent, place: Point): void {
  const currentImage = state.image;
  const color = currentImage === null ? undefined : currentImage.packed[place.y * currentImage.width + place.x];
  if (color === undefined) { tooltip.hidden = true; return; }
  tooltip.textContent = state.map?.lakeColors.includes(color) === true
    ? hexOf(color) + ' (lake)'
    : hexOf(color) + ' · click to make it a province';
  placeTooltip(event);
}

function placeTooltip(event: MouseEvent): void {
  tooltip.hidden = false;
  const rect = mapArea.getBoundingClientRect();
  tooltip.style.left = String(event.clientX - rect.left + 12) + 'px';
  tooltip.style.top = String(event.clientY - rect.top + 12) + 'px';
}

/**
 * A click on the map: the province opens, or — for a colour painted here and
 * named by no row of definition.csv — the panel of a province that does not
 * exist yet, which the first Save creates.
 */
function clickAt(point: Point): void {
  const currentImage = state.image;
  const id = provinceAt(point);
  if (id !== undefined) { toggleProvince(id); return; }
  const color = currentImage?.packed[point.y * currentImage.width + point.x];
  if (color === undefined) { return; }
  if (state.map?.lakeColors.includes(color)) {
    setStatus(hexOf(color) + ' is a lake row of definition.csv, not a province.', 'warning');
    return;
  }
  capturePending();
  state.newColor = color;
  state.selectedId = null;
  state.details = null;
  state.draft = null;
  state.selection = null;
  resetHeader();
  // The panel of the province clicked before this one must go at once: the answer
  // may take a moment, and may not come at all when the colour cannot be read.
  showHint('Reading a province for ' + hexOf(color) + '…');
  render();
  setStatus('Reading a province for ' + hexOf(color) + '…');
  post({ type: 'newProvince', color: color, popDate: state.popDate });
}

/** A click on the map: the province opens, or closes when it is the one already open. */
function toggleProvince(id: number): void {
  if (id !== state.selectedId) { selectProvince(id); return; }
  capturePending();
  clearSelection();
}

/** Open a province; `prepared` is its glow when the caller has walked the map for it already. */
export function selectProvince(id: number, prepared?: Highlight | null): void {
  capturePending();
  state.newColor = null;
  state.selection = prepared ?? highlightOf(id);
  state.selectedId = id;
  state.details = null;
  state.draft = null;
  render();
  renderSide(id);
  setStatus('Reading province ' + String(id) + '…');
  post({ type: 'select', provinceId: id, popDate: state.popDate });
}

/** Nothing selected, as far as the state goes; the panel and the status are the caller's. */
export function clearSelectionState(): void {
  state.selection = null;
  state.selectedId = null;
  state.newColor = null;
  state.details = null;
  state.draft = null;
  state.draftBaseline = null;
  state.positionInputs = {};
  resetHeader();
}

export function clearSelection(): void {
  clearSelectionState();
  showHint();
  setStatus('');
  render();
}

function centerOn(id: number): void {
  const found = highlightOf(id);
  if (!found) { setStatus('Province ' + String(id) + ' is not on the map.', 'warning'); return; }
  const scale = Math.min(8, Math.max(state.view.scale, Math.min(mapArea.clientWidth / (found.width * 3), mapArea.clientHeight / (found.height * 3))));
  const centerX = found.x + found.width / 2;
  const centerY = found.y + found.height / 2;
  state.view = { scale: scale, x: mapArea.clientWidth / 2 - centerX * scale, y: mapArea.clientHeight / 2 - centerY * scale };
  // The glow is already in hand; the province is not walked for it twice.
  selectProvince(id, found);
}

// The map report gives pixels as an image editor shows them, top-left origin,
// while the canvas draws the file's rows as the game reads them. That flips y.
export function applyReveal(): void {
  const currentImage = state.image;
  const reveal = state.pendingReveal;
  if (!reveal || !currentImage) { return; }
  state.pendingReveal = null;
  const point = { x: reveal.x, y: currentImage.height - 1 - reveal.y };
  if (!insideImage(currentImage, point)) {
    setStatus('Pixel ' + String(reveal.x) + ', ' + String(reveal.y) + ' is outside the map.', 'warning');
    return;
  }
  const scale = Math.max(state.view.scale, 8);
  state.view = { scale: scale, x: mapArea.clientWidth / 2 - point.x * scale, y: mapArea.clientHeight / 2 - point.y * scale };
  const id = provinceAt(point);
  const where = reveal.file + ' at ' + String(reveal.x) + ', ' + String(reveal.y);
  if (id === undefined) {
    render();
    setStatus(where + ': no province there.', 'warning');
    return;
  }
  selectProvince(id);
  setStatus(where + ': province ' + String(id));
}

/** A province by id, else by its definition.csv name: the whole name, then one starting with the text, then one holding it. */
function findProvince(text: string): number | undefined {
  const needle = text.trim().toLowerCase();
  if (needle === '') { return undefined; }
  if (/^[0-9]+$/.test(needle)) { return Number(needle); }
  let exact: number | undefined;
  let starts: number | undefined;
  let holds: number | undefined;
  definitionById.forEach(function (definition, id) {
    const name = definition.name.toLowerCase();
    if (name === '') { return; }
    if (name === needle) { exact ??= id; }
    else if (name.startsWith(needle)) { starts ??= id; }
    else if (name.includes(needle)) { holds ??= id; }
  });
  return exact ?? starts ?? holds;
}

function goToProvince(): void {
  const text = gotoInput.value;
  const id = findProvince(text);
  if (id === undefined) {
    if (text.trim() !== '') { setStatus('No province is called "' + text.trim() + '".', 'warning'); }
    return;
  }
  centerOn(id);
}

export function initInput(): void {
  mapArea.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('keydown', onKeyDown);
  // The right button is the page's own: no menu over the map.
  mapArea.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  mapArea.addEventListener('mouseleave', function () { tooltip.hidden = true; });
  mapArea.addEventListener('wheel', function (event) {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });
  new ResizeObserver(function () { render(); }).observe(mapArea);
  required('gotoButton').addEventListener('click', goToProvince);
  gotoInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { goToProvince(); }
  });
  saveAllButton.addEventListener('click', function () {
    const count = pendingCount();
    if (count === 0) { return; }
    sendPending();
    post({ type: 'saveAll' });
    saveAllButton.disabled = true;
    setStatus('Saving ' + String(count) + (count === 1 ? ' province…' : ' provinces…'));
  });
  required('fitButton').addEventListener('click', function () { fitView(); render(); });
  required('reloadButton').addEventListener('click', function () { post({ type: 'reload' }); });
}
