import {
  affineFromTriangles,
  bilinear,
  boundsOf,
  boxFromHandle,
  distortQuad,
  fitQuad,
  handleAt,
  handlePoint,
  HANDLES,
  insideQuad,
  isAffine,
  mergeReferenceLists,
  moveQuad,
  quadOfBox,
  type Box,
  type Handle,
  type Quad,
  type ReferenceLayer,
} from '../services/referenceLayers.js';
import { render, toImage, toImageExact } from './canvas.js';
import { ctx, mapArea, required, requiredButton, setStatus } from './dom.js';
import { messageOf, post } from './host.js';
import { layerRow } from './layers.js';
import { removeButton } from './fields.js';
import { setTool } from './paint.js';
import { state, type Point } from './state.js';

// Pictures dropped over the map to draw against, kept in the mod's map/references.
// The extension owns the files and the manifest; the page owns the picture on
// screen: where it sits, how it is bent, and how see-through it is.
interface Reference {
  layer: ReferenceLayer;
  bitmap: ImageBitmap | null;
  row: HTMLElement;
  /** The picture already bent to its corners, kept until they or the zoom change. */
  warped: Warped | null;
}

interface Warped {
  readonly corners: Quad;
  readonly scale: number;
  readonly canvas: HTMLCanvasElement;
}

/** The most pixels a bent picture is drawn with: enough for the screen, bounded for the memory. */
const WARP_MAX_PIXELS = 4_000_000;

let references: Reference[] = [];
let referencesFolder = '';
/** The file of the reference whose frame is up, if any: the one the reference tool moves. */
let activeReference: string | null = null;
let referencesTimer: number | null = null;
/** Cells per side of the mesh a distorted picture is drawn with. */
const MESH = 8;
const GRIP_PX = 7;

const referenceLayersBox = required('referenceLayers');
const layersBox = required('layersBox');

function referenceOf(file: string): Reference | undefined {
  return references.find(function (item) { return item.layer.file === file; });
}

export function referenceCount(): number {
  return references.length;
}

export function hasActiveReference(): boolean {
  return activeReference !== null;
}

/** A new map: nothing is on it yet. */
export function resetReferences(): void {
  references = []; referencesFolder = ''; activeReference = null; referenceDrag = null;
  if (referencesTimer !== null) { clearTimeout(referencesTimer); referencesTimer = null; }
  renderReferenceRows();
}

/**
 * The list the extension sent. It decides which pictures are on the map and in
 * what order; a picture already here keeps its row, its bitmap and the geometry
 * the page holds, which may be ahead of the manifest by a drag not yet posted.
 */
export function handleReferences(folderUri: string, layers: readonly ReferenceLayer[]): void {
  // The first list after a map load is what the mod already had; a later one has something added.
  const firstList = referencesFolder === '';
  referencesFolder = folderUri;
  const kept = new Map(references.map(function (item) { return [item.layer.file, item]; }));
  const merged = mergeReferenceLists(references.map(function (item) { return item.layer; }), layers);
  references = merged.map(function (layer) {
    const previous = kept.get(layer.file);
    return previous ?? { layer: layer, bitmap: null, row: referenceRow(layer), warped: null };
  });
  if (activeReference !== null && !referenceOf(activeReference)) { activeReference = null; }
  // A picture just added is the one to place: its frame is up before anything is clicked.
  const added = references.filter(function (item) { return !kept.has(item.layer.file); });
  const last = added[added.length - 1];
  if (!firstList && last) { selectReference(last.layer.file); }
  for (const item of references) { if (!item.bitmap) { fetchReference(item); } }
  // A post the answer overtook goes out now, with the geometry the page kept.
  if (referencesTimer !== null) { postReferencesNow(); }
  renderReferenceRows();
  render();
}

/** The frame goes up over one picture, or down with null; selecting a picture picks the reference tool up as well. */
export function selectReference(file: string | null): void {
  activeReference = file;
  if (activeReference !== null && state.tool !== 'reference') { setTool('reference'); }
  renderReferenceRows();
  render();
  setStatus(activeReference === null
    ? 'No picture selected.'
    : 'Editing ' + activeReference + ': drag it to move, drag a grip to stretch, Shift keeps proportions, Ctrl distorts; Esc when done.');
}

/** A row's click: the frame goes up over its picture, or down when it is the one already up. */
function toggleReference(file: string): void {
  selectReference(activeReference === file ? null : file);
}

function fetchReference(item: Reference): void {
  item.row.classList.add('loading');
  fetch(referencesFolder + '/' + encodeURIComponent(item.layer.file))
    .then(function (response) {
      if (!response.ok) { throw new Error('HTTP ' + String(response.status)); }
      return response.blob();
    })
    .then(function (blob) { return createImageBitmap(blob); })
    .then(function (bitmap) {
      if (!referenceOf(item.layer.file)) { return; }
      item.bitmap = bitmap;
      item.row.classList.remove('loading');
      paintReferenceThumb(item);
      placeReferences();
      render();
    })
    .catch(function (error: unknown) {
      item.row.classList.remove('loading');
      setStatus(item.layer.file + ' could not be shown: ' + messageOf(error), 'error');
    });
}

/**
 * Four corners on one point is a picture not placed yet: the extension puts it
 * there when it is dropped, and the page — the one side that decodes it — gives
 * it its own size, one picture pixel per map pixel, and writes that back.
 */
export function placeReferences(): void {
  let placed = false;
  for (const item of references) {
    const box = boundsOf(item.layer.corners);
    if (!item.bitmap || box.width > 0 || box.height > 0) { continue; }
    item.layer = { ...item.layer, corners: quadOfBox(box.x, box.y, item.bitmap.width, item.bitmap.height) };
    placed = true;
  }
  if (placed) { postReferences(); }
}

function paintReferenceThumb(item: Reference): void {
  const bitmap = item.bitmap;
  const thumb = item.row.querySelector('.thumb');
  if (!bitmap || !(thumb instanceof HTMLElement)) { return; }
  const small = document.createElement('canvas');
  small.width = 40; small.height = 40;
  const context = small.getContext('2d');
  if (!context) { return; }
  const scale = Math.max(small.width / bitmap.width, small.height / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (small.width - width) / 2, (small.height - height) / 2, width, height);
  thumb.style.backgroundImage = 'url(' + small.toDataURL() + ')';
}

function referenceRow(layer: ReferenceLayer): HTMLElement {
  const row = layerRow(layer.file, layer.opacity, function (value) {
    const item = referenceOf(layer.file);
    if (!item) { return; }
    item.layer = { ...item.layer, opacity: value };
    render();
    postReferences();
  });
  const remove = removeButton('Remove this reference and delete its copy from map/references', function (event) {
    event.stopPropagation();
    post({ type: 'removeReference', file: layer.file });
  });
  row.head.append(remove);
  row.head.title = 'Select this picture on the map (and the reference tool): drag to move, grips to resize (Shift keeps proportions, Ctrl distorts). Esc, or click again, to stop.';
  row.head.addEventListener('click', function () { toggleReference(layer.file); });
  // The thumbnail is the eye: a click hides the picture, its opacity untouched, and another brings it back.
  row.thumb.title = 'Show or hide this picture; its opacity is kept';
  row.thumb.addEventListener('click', function () { toggleHidden(layer.file); });
  return row.node;
}

function toggleHidden(file: string): void {
  const item = referenceOf(file);
  if (!item) { return; }
  const shown: ReferenceLayer = { file: item.layer.file, corners: item.layer.corners, opacity: item.layer.opacity };
  item.layer = item.layer.hidden === true ? shown : { ...shown, hidden: true };
  renderReferenceRows();
  render();
  postReferences();
}

function renderReferenceRows(): void {
  referenceLayersBox.replaceChildren();
  for (const item of references) {
    item.row.classList.toggle('active', item.layer.file === activeReference);
    item.row.classList.toggle('hidden-picture', item.layer.hidden === true);
    referenceLayersBox.append(item.row);
  }
}

/** The list as the page holds it, written to the manifest; a burst of drags becomes one write. */
function postReferences(): void {
  if (referencesTimer !== null) { clearTimeout(referencesTimer); }
  referencesTimer = window.setTimeout(postReferencesNow, 400);
}

function postReferencesNow(): void {
  if (referencesTimer !== null) { clearTimeout(referencesTimer); referencesTimer = null; }
  post({ type: 'references', layers: references.map(function (item) { return item.layer; }) });
}

/** Every picture at its opacity, over the map layers and under the province outline. */
export function drawReferences(): void {
  // Pictures are scaled, not pixel art: they are smoothed whatever the map's zoom.
  ctx.imageSmoothingEnabled = true;
  for (const item of references) {
    if (!item.bitmap || item.layer.opacity <= 0 || item.layer.hidden === true) { continue; }
    ctx.globalAlpha = item.layer.opacity / 100;
    drawReference(item, item.bitmap);
  }
  ctx.globalAlpha = 1;
  // The frame belongs to the reference tool: under any other it is only in the way of the map.
  const active = activeReference === null || state.tool !== 'reference' ? undefined : referenceOf(activeReference);
  if (active?.bitmap) { drawFrame(boundsOf(active.layer.corners)); }
}

/**
 * A parallelogram is one transformed drawImage. A bent picture is a mesh of
 * triangles — but drawn straight onto the map at the layer's opacity, the
 * triangles show: where two meet the paint doubles. So the mesh is drawn once,
 * opaque, into a canvas of its own, and that canvas is what goes on the map.
 */
function drawReference(item: Reference, bitmap: ImageBitmap): void {
  const quad = item.layer.corners;
  if (isAffine(quad)) {
    const matrix = affineFromTriangles([{ x: 0, y: 0 }, { x: bitmap.width, y: 0 }, { x: 0, y: bitmap.height }], [quad[0], quad[1], quad[3]]);
    if (!matrix) { return; }
    ctx.save();
    ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    ctx.drawImage(bitmap, 0, 0);
    ctx.restore();
    return;
  }
  const box = boundsOf(quad);
  const scale = warpScale(box);
  if (item.warped?.corners !== quad || item.warped.scale !== scale) {
    item.warped = { corners: quad, scale: scale, canvas: warp(bitmap, quad, box, scale) };
  }
  ctx.drawImage(item.warped.canvas, box.x, box.y, box.width, box.height);
}

/** Canvas pixels per map pixel the bent picture is drawn with: what the screen shows, within the pixel budget. */
function warpScale(box: Box): number {
  const wanted = state.view.scale * (window.devicePixelRatio || 1);
  const most = Math.sqrt(WARP_MAX_PIXELS / Math.max(1, box.width * box.height));
  return Math.min(wanted, most);
}

function warp(bitmap: ImageBitmap, quad: Quad, box: Box, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(box.width * scale));
  canvas.height = Math.max(1, Math.ceil(box.height * scale));
  const target = canvas.getContext('2d');
  if (!target) { return canvas; }
  target.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  target.imageSmoothingEnabled = true;
  const width = bitmap.width;
  const height = bitmap.height;
  for (let row = 0; row < MESH; row++) {
    for (let column = 0; column < MESH; column++) {
      const u0 = column / MESH; const u1 = (column + 1) / MESH;
      const v0 = row / MESH; const v1 = (row + 1) / MESH;
      const source = { a: { x: u0 * width, y: v0 * height }, b: { x: u1 * width, y: v0 * height }, c: { x: u1 * width, y: v1 * height }, d: { x: u0 * width, y: v1 * height } };
      const corner = { a: bilinear(quad, u0, v0), b: bilinear(quad, u1, v0), c: bilinear(quad, u1, v1), d: bilinear(quad, u0, v1) };
      drawTriangle(target, bitmap, [source.a, source.b, source.c], [corner.a, corner.b, corner.c], scale);
      drawTriangle(target, bitmap, [source.a, source.c, source.d], [corner.a, corner.c, corner.d], scale);
    }
  }
  return canvas;
}

/** The triangle pushed out from its centre by one canvas pixel: the clip's anti-aliased edge lands under the neighbour, and the drawing being opaque, nothing doubles. */
function inflated(triangle: readonly [Point, Point, Point], by: number): readonly [Point, Point, Point] {
  const centreX = (triangle[0].x + triangle[1].x + triangle[2].x) / 3;
  const centreY = (triangle[0].y + triangle[1].y + triangle[2].y) / 3;
  function out(point: Point): Point {
    const dx = point.x - centreX;
    const dy = point.y - centreY;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (dx / length) * by, y: point.y + (dy / length) * by };
  }
  return [out(triangle[0]), out(triangle[1]), out(triangle[2])];
}

function drawTriangle(
  target: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  source: readonly [Point, Point, Point],
  corner: readonly [Point, Point, Point],
  scale: number,
): void {
  const matrix = affineFromTriangles(source, corner);
  if (!matrix) { return; }
  const clip = inflated(corner, 1 / scale);
  target.save();
  target.beginPath();
  target.moveTo(clip[0].x, clip[0].y);
  target.lineTo(clip[1].x, clip[1].y);
  target.lineTo(clip[2].x, clip[2].y);
  target.closePath();
  target.clip();
  target.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  target.drawImage(bitmap, 0, 0);
  target.restore();
}

/** The frame and its eight grips, in screen pixels whatever the zoom. */
function drawFrame(box: Box): void {
  const unit = 1 / state.view.scale;
  ctx.save();
  ctx.lineWidth = unit;
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([4 * unit, 3 * unit]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.setLineDash([]);
  const grip = GRIP_PX * unit;
  for (const handle of HANDLES) {
    const at = handlePoint(box, handle);
    ctx.fillStyle = '#fff';
    ctx.fillRect(at.x - grip / 2, at.y - grip / 2, grip, grip);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(at.x - grip / 2, at.y - grip / 2, grip, grip);
  }
  ctx.restore();
}

/**
 * The reference tool's press: a grip of the selected picture first, else the
 * topmost picture under the pointer (selected as it is grabbed), else nothing —
 * which puts the frame away.
 */
export function pressReference(event: MouseEvent): void {
  const grabbed = referenceHit(event.clientX, event.clientY);
  if (grabbed) { startReferenceDrag(grabbed.file, grabbed.handle, event); return; }
  const at = toImageExact(event.clientX, event.clientY);
  for (let index = references.length - 1; index >= 0; index--) {
    const item = references[index];
    if (!item?.bitmap || !insideQuad(item.layer.corners, at)) { continue; }
    if (activeReference !== item.layer.file) { selectReference(item.layer.file); }
    startReferenceDrag(item.layer.file, 'inside', event);
    return;
  }
  if (activeReference !== null) { selectReference(null); }
}

function startReferenceDrag(file: string, handle: Handle | 'inside', event: MouseEvent): void {
  const item = referenceOf(file);
  if (!item) { return; }
  referenceDrag = { file: file, handle: handle, from: item.layer.corners, startX: event.clientX, startY: event.clientY };
}

/** A drag of the active reference: what was grabbed, and the picture as it was when the button went down. */
interface ReferenceDrag {
  readonly file: string;
  readonly handle: Handle | 'inside';
  readonly from: Quad;
  readonly startX: number;
  readonly startY: number;
}
let referenceDrag: ReferenceDrag | null = null;

export function referenceDragging(): boolean {
  return referenceDrag !== null;
}

/** The button came up, or the window lost it: the picture stays where it is, and the manifest hears of it. */
export function endReferenceDrag(): void {
  if (referenceDrag === null) { return; }
  referenceDrag = null;
  postReferences();
}

/** The reference tool over the selected picture: a grip or the picture itself, else nothing. */
function referenceHit(clientX: number, clientY: number): { file: string; handle: Handle | 'inside' } | null {
  if (state.tool !== 'reference' || activeReference === null) { return null; }
  const item = referenceOf(activeReference);
  if (!item?.bitmap) { return null; }
  const hit = handleAt(item.layer.corners, toImageExact(clientX, clientY), (GRIP_PX / 2 + 1) / state.view.scale);
  return hit === null ? null : { file: item.layer.file, handle: hit };
}

/**
 * Photoshop's free transform, from the picture as it was when the button went
 * down: a plain grip stretches, Shift keeps the proportion, Ctrl bends the
 * corner (or slides the side) on its own, and the inside moves the whole thing.
 */
export function moveReference(event: MouseEvent): void {
  const current = referenceDrag;
  const item = current ? referenceOf(current.file) : undefined;
  if (!current || !item) { return; }
  const dx = (event.clientX - current.startX) / state.view.scale;
  const dy = (event.clientY - current.startY) / state.view.scale;
  let next: Quad;
  if (current.handle === 'inside') {
    next = moveQuad(current.from, dx, dy);
  } else if (event.ctrlKey || event.metaKey) {
    next = distortQuad(current.from, current.handle, dx, dy);
  } else {
    const from = boundsOf(current.from);
    next = fitQuad(current.from, from, boxFromHandle(from, current.handle, dx, dy, event.shiftKey));
  }
  item.layer = { ...item.layer, corners: next };
  render();
}

export function gripCursor(clientX: number, clientY: number): void {
  const hit = referenceDrag ? { handle: referenceDrag.handle } : referenceHit(clientX, clientY);
  for (const handle of [...HANDLES, 'move']) { mapArea.classList.toggle('grip-' + handle, hit !== null && (hit.handle === 'inside' ? 'move' : hit.handle) === handle); }
}

// --- Dropping a picture in ---------------------------------------------------------------------
/** Where a dropped picture lands: the map pixel under the drop, or the middle of the view for a drop on the box. */
function dropPoint(event: DragEvent, overMap: boolean): Point {
  const image = state.image;
  if (overMap && image) {
    const at = toImage(event.clientX, event.clientY);
    return { x: Math.min(image.width - 1, Math.max(0, at.x)), y: Math.min(image.height - 1, Math.max(0, at.y)) };
  }
  return viewCentre();
}

/** The middle of what is on screen, in map pixels: where a picked picture lands. */
function viewCentre(): Point {
  const rect = mapArea.getBoundingClientRect();
  const centre = toImage(rect.left + mapArea.clientWidth / 2, rect.top + mapArea.clientHeight / 2);
  return { x: Math.round(centre.x), y: Math.round(centre.y) };
}

function acceptDrop(event: DragEvent, overMap: boolean): void {
  event.preventDefault();
  mapArea.classList.remove('dropping'); layersBox.classList.remove('dropping');
  const transfer = event.dataTransfer;
  if (!transfer || !state.map) { return; }
  const at = dropPoint(event, overMap);
  const files = [...transfer.files].filter(function (file) { return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name); });
  for (const file of files) { readDroppedFile(file, at); }
  if (files.length > 0) { return; }
  const uris = transfer.getData('text/uri-list').split(/\r?\n/).map(function (line) { return line.trim(); })
    .filter(function (line) { return line.startsWith('file:'); });
  for (const uri of uris) { post({ type: 'addReferencePath', uri: uri, x: at.x, y: at.y }); }
  if (uris.length === 0) { setStatus('Drop a picture file (PNG, JPEG, GIF, WebP or BMP).', 'warning'); }
}

/** The picture's bytes as base64: a data URL is the browser's own way to that, and the extension strips the head. */
function readDroppedFile(file: File, at: Point): void {
  const reader = new FileReader();
  reader.onload = function (): void {
    const result = typeof reader.result === 'string' ? reader.result : '';
    const comma = result.indexOf(',');
    if (comma < 0) { setStatus(file.name + ' could not be read.', 'error'); return; }
    post({ type: 'addReference', name: file.name, bytes: result.slice(comma + 1), x: at.x, y: at.y });
    setStatus('Adding ' + file.name + '…');
  };
  reader.onerror = function (): void { setStatus(file.name + ' could not be read.', 'error'); };
  reader.readAsDataURL(file);
}

export function initReferences(): void {
  requiredButton('addReferenceButton').addEventListener('click', function () {
    if (!state.map) { return; }
    const at = viewCentre();
    post({ type: 'pickReference', x: at.x, y: at.y });
  });
  for (const target of [mapArea, layersBox]) {
    target.addEventListener('dragover', function (event) {
      if (!event.dataTransfer) { return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      target.classList.add('dropping');
    });
    target.addEventListener('dragleave', function () { target.classList.remove('dropping'); });
  }
  mapArea.addEventListener('drop', function (event) { acceptDrop(event, true); });
  layersBox.addEventListener('drop', function (event) { event.stopPropagation(); acceptDrop(event, false); });
}
