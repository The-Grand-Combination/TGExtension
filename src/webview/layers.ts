import type { ProvinceDefinition, Rgb } from '../model/mapEditor.js';
import { stateColorOf } from '../services/stateColors.js';
import { buildTiles, decodeIndexedBmp, decodeProvincesBmp, fetchBitmap, paletteRgba, riverMaskRgba } from './bitmaps.js';
import { fitView, render } from './canvas.js';
import { h, hideLoading, loading, required, requiredInput, setStatus, showLoading } from './dom.js';
import { sliderInput, type Field, type SliderRange } from './fields.js';
import { log, messageOf } from './host.js';
import { applyReveal } from './input.js';
import { placeReferences } from './references.js';
import { definitionById, FIXED_LAYERS, OVERLAYS, SEA_TINT, seaIds, state, TINT_MODES, UNOWNED_TINT, type FixedLayer, type IndexedImage, type Overlay, type OverlayLook, type TintMode } from './state.js';
import { refreshColorControl } from './paintColor.js';

/**
 * The map's own layers: provinces.bmp, which everything else sits on, the two
 * overlays the Layers box fades in, and the Country Colors tint of the bottom
 * box. Each is fetched once and kept until the map is loaded again.
 */

const LAYER_LABELS: Record<FixedLayer, string> = { provinces: 'Provinces', rivers: 'Rivers', terrain: 'Terrain' };
const OPACITY_RANGE: SliderRange = { min: 0, max: 100 };

export interface LayerRow {
  readonly node: HTMLElement;
  readonly head: HTMLElement;
  readonly thumb: HTMLElement;
  readonly slider: Field;
}

const layerRows = new Map<FixedLayer, LayerRow>();
const fixedLayersBox = required('fixedLayers');
const layerPositions = requiredInput('layerPositions');
const layerText = requiredInput('layerText');
const tintBoxes: Record<TintMode, HTMLInputElement> = { country: requiredInput('layerCountry'), state: requiredInput('layerState') };
/** Each overlay is fetched once per map, whichever of its layer, the brush and the Terrain Lock asks first. */
const indexedLoad: Record<Overlay, Promise<IndexedImage> | null> = { rivers: null, terrain: null };
const indexedFailure: Record<Overlay, string | null> = { rivers: null, terrain: null };

/** One row of the box: thumbnail, name, and the opacity slider under them. */
export function layerRow(name: string, opacity: number, onOpacity: (value: number) => void): LayerRow {
  const thumb = h('span', { class: 'thumb' });
  const head = h('div', { class: 'caption' }, h('span', { class: 'name', title: name }, name));
  const slider = sliderInput(String(opacity), OPACITY_RANGE);
  function tell(): void { slider.node.title = 'Opacity ' + slider.value + '%'; }
  slider.node.addEventListener('input', function () { tell(); onOpacity(Number(slider.value) || 0); });
  tell();
  return { node: h('div', { class: 'layer' }, thumb, head, slider.node), head: head, thumb: thumb, slider: slider };
}

function buildFixedRows(): void {
  fixedLayersBox.replaceChildren();
  layerRows.clear();
  for (const kind of FIXED_LAYERS) {
    const row = layerRow(LAYER_LABELS[kind], state.layerOpacity[kind], function (value) {
      state.layerOpacity[kind] = value;
      if (kind !== 'provinces' && value > 0) { showOverlay(kind); }
      render();
    });
    row.head.title = 'Edit ' + LAYER_LABELS[kind].toLowerCase() + ': the brush paints this file';
    row.head.addEventListener('click', function () { setEditLayer(kind); });
    layerRows.set(kind, row);
    fixedLayersBox.append(row.node);
  }
  syncLayerRows();
}

/** A layer the stack does not have is greyed with its slider at 0; the one being edited is lit. */
function syncLayerRow(kind: FixedLayer): void {
  const row = layerRows.get(kind);
  if (!row) { return; }
  const missing = kind !== 'provinces' && state.overlayUri[kind] === null;
  row.node.classList.toggle('off', missing);
  row.node.classList.toggle('editing', state.editLayer === kind);
  row.node.title = missing ? 'The picked mods have no map/' + kind + '.bmp' : '';
  row.slider.value = String(state.layerOpacity[kind]);
  for (const input of row.node.querySelectorAll('input')) { input.disabled = missing; }
}

export function syncLayerRows(): void {
  for (const kind of FIXED_LAYERS) { syncLayerRow(kind); }
}

export function applyThumbnails(pictures: Record<FixedLayer, string | undefined>): void {
  for (const kind of FIXED_LAYERS) {
    const uri = pictures[kind];
    const thumb = layerRows.get(kind)?.thumb;
    if (uri && thumb) { thumb.style.backgroundImage = 'url(' + uri + ')'; }
  }
}

export function loadProvinces(bmpUri: string): void {
  showLoading('Loading provinces.bmp…');
  log('fetching ' + bmpUri);
  fetchBitmap(bmpUri, 'provinces.bmp')
    .then(function (buffer) {
      showLoading('Decoding provinces.bmp (' + (buffer.byteLength / 1048576).toFixed(1) + ' MB)…');
      return new Promise<void>(function (resolve) { setTimeout(resolve, 0); }).then(function () { return decodeProvincesBmp(buffer); });
    })
    .then(function (decoded) {
      showLoading('Drawing ' + String(decoded.width) + ' x ' + String(decoded.height) + '…');
      return buildTiles(decoded.rgba, decoded.width, decoded.height, 'Drawing').then(function (tiles) {
        state.image = { width: decoded.width, height: decoded.height, tiles: tiles, packed: decoded.packed };
        hideLoading();
        fitView();
        render();
        if (state.tintMode) { buildTintedTiles(state.tintMode); }
        for (const kind of OVERLAYS) { if (state.layerOpacity[kind] > 0 || state.editLayer === kind) { showOverlay(kind); } }
        placeReferences();
        setStatus(String(decoded.width) + ' x ' + String(decoded.height) + ', ' + String(definitionById.size) + ' provinces');
        // The integration test reads this line: the map is up and the overlay is gone.
        log('map ready; overlay ' + getComputedStyle(loading).display);
        applyReveal();
      });
    })
    .catch(function (error: unknown) {
      showLoading('Could not show the map: ' + messageOf(error));
    });
}

/**
 * An overlay as pixels, fetched and decoded once per map. The indices are what
 * the brush and the locks read; the tiles are built from them separately, so a
 * layer nobody looks at costs a byte a pixel and no canvas.
 */
export function ensureIndexed(kind: Overlay): Promise<IndexedImage> {
  const held = indexedLoad[kind];
  if (held) { return held; }
  const name = kind + '.bmp';
  const uri = state.overlayUri[kind];
  if (!uri) { return Promise.reject(new Error('The picked mods have no map/' + name + '.')); }
  showLoading('Loading ' + name + '…');
  const load: Promise<IndexedImage> = fetchBitmap(uri, name)
    .then(function (buffer) { return decodeIndexedBmp(buffer, name); })
    .then(function (pixels) {
      hideLoading();
      const image: IndexedImage = {
        width: pixels.width, height: pixels.height, packed: pixels.indices, palette: pixels.palette, tiles: null, shown: null,
      };
      if (indexedLoad[kind] === load) { state.indexed[kind] = image; }
      return image;
    }, function (error: unknown) {
      hideLoading();
      if (indexedLoad[kind] === load) { indexedFailure[kind] = messageOf(error); }
      throw error instanceof Error ? error : new Error(messageOf(error));
    });
  indexedLoad[kind] = load;
  return load;
}

/** Why a layer the brush wanted to read is not there; only asked while the page holds none of it. */
export function layerAbsence(kind: Overlay): string {
  const name = kind + '.bmp';
  if (!state.overlayUri[kind]) { return 'the picked mods have no map/' + name; }
  const failure = indexedFailure[kind];
  if (failure) { return name + ' could not be read (' + failure + ')'; }
  return indexedLoad[kind] ? name + ' is still loading' : name + ' is not loaded yet';
}

/** rivers.bmp is a blue mask over nothing until it is the layer being edited, and then it is its own colours. */
function lookOf(kind: Overlay): OverlayLook {
  return kind === 'rivers' && state.editLayer !== 'rivers' ? 'mask' : 'palette';
}

/** Fetch an overlay and draw it; a layer at zero that is not being edited is never fetched. */
export function showOverlay(kind: Overlay): void {
  if (!state.overlayUri[kind] || !state.image) { return; }
  ensureIndexed(kind)
    .then(function (image) { warnSize(kind, image); buildOverlayTiles(kind); })
    .catch(function (error: unknown) {
      state.layerOpacity[kind] = 0;
      if (state.editLayer === kind) { state.editLayer = 'provinces'; }
      syncLayerRows();
      setStatus('Could not show ' + kind + '.bmp: ' + messageOf(error), 'error');
    });
}

function warnSize(kind: Overlay, image: IndexedImage): void {
  const map = state.image;
  if (map && (image.width !== map.width || image.height !== map.height)) {
    setStatus(kind + '.bmp is ' + String(image.width) + ' x ' + String(image.height)
      + ', the map ' + String(map.width) + ' x ' + String(map.height), 'error');
  }
}

/** The canvases a layer is drawn from, built when it is first shown and again when rivers changes its looks. */
export function buildOverlayTiles(kind: Overlay): void {
  const image = state.indexed[kind];
  const forImage = state.image;
  const look = lookOf(kind);
  const wanted = state.layerOpacity[kind] > 0 || state.editLayer === kind;
  if (!image || !forImage || !wanted || state.overlayLoading[kind] || (image.tiles !== null && image.shown === look)) { return; }
  state.overlayLoading[kind] = true;
  const rgba = look === 'mask' ? riverMaskRgba(image.packed) : paletteRgba(image.packed, image.palette);
  buildTiles(rgba, image.width, image.height, 'Drawing ' + kind)
    .then(function (tiles) {
      state.overlayLoading[kind] = false;
      if (state.image !== forImage || state.indexed[kind] !== image) { return; }
      image.tiles = tiles;
      image.shown = look;
      hideLoading();
      render();
    })
    .catch(function (error: unknown) {
      state.overlayLoading[kind] = false;
      hideLoading();
      setStatus('Could not draw ' + kind + '.bmp: ' + messageOf(error), 'error');
    });
}

/**
 * Which bitmap the tools paint. The one being edited is drawn over the rest in
 * its own colours, whatever its slider says, so what the brush lands on is
 * what the file holds.
 */
export function setEditLayer(kind: FixedLayer): void {
  if (state.editLayer === kind) { return; }
  if (kind !== 'provinces' && state.overlayUri[kind] === null) {
    setStatus('The picked mods have no map/' + kind + '.bmp.', 'warning');
    return;
  }
  if (kind !== 'provinces' && state.paintMode === 'sea') {
    setStatus('Sea Province Mode paints the province map alone; pick another mode to edit ' + kind + '.bmp.', 'warning');
    return;
  }
  const was = state.editLayer;
  state.editLayer = kind;
  for (const overlay of OVERLAYS) {
    if (overlay === kind) { showOverlay(overlay); } else if (overlay === was) { buildOverlayTiles(overlay); }
  }
  syncLayerRows();
  refreshColorControl();
  render();
  setStatus('Painting map/' + kind + '.bmp');
}

/** The colour a province is repainted towards, or undefined for grey: its owner's, or its first state's. */
function baseColorOf(mode: TintMode, definition: ProvinceDefinition): Rgb | undefined {
  const id = String(definition.id);
  if (mode === 'country') {
    const tag = state.countryColors?.owners[id];
    return tag === undefined ? undefined : state.countryColors?.colors[tag];
  }
  const name = state.stateOf?.[id];
  return name === undefined ? undefined : stateColorOf(name);
}

/** One tint per province colour: the base colour with a share of the province's own, so neighbours still differ. */
function tintByPacked(mode: TintMode, definitions: readonly ProvinceDefinition[]): Map<number, number> {
  const tints = new Map<number, number>();
  const weight = state.tintWeight;
  for (const definition of definitions) {
    const base = seaIds.has(definition.id) ? SEA_TINT : (baseColorOf(mode, definition) ?? UNOWNED_TINT);
    const own = definition.color;
    const red = Math.round(weight * base[0] + (1 - weight) * ((own >> 16) & 255));
    const green = Math.round(weight * base[1] + (1 - weight) * ((own >> 8) & 255));
    const blue = Math.round(weight * base[2] + (1 - weight) * (own & 255));
    tints.set(own, (red << 16) | (green << 8) | blue);
  }
  return tints;
}

/** True once the data a repaint needs has arrived. */
function tintReady(mode: TintMode): boolean {
  return mode === 'country' ? state.countryColors !== null : state.stateOf !== null;
}

/** Repaint the whole bitmap one way and cut it into tiles; drawn instead of image.tiles while that layer is on. */
export function buildTintedTiles(mode: TintMode): void {
  const forImage = state.image;
  if (!forImage || !state.map || !tintReady(mode)) { return; }
  const packed = forImage.packed;
  const count = packed.length;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(count * 4));
  const tints = tintByPacked(mode, state.map.definitions);
  let lastColor = -1;
  let lastTint = -1;
  for (let index = 0, out = 0; index < count; index++, out += 4) {
    const color = packed[index] ?? 0;
    if (color !== lastColor) {
      lastColor = color;
      lastTint = tints.get(color) ?? color;
    }
    rgba[out] = (lastTint >> 16) & 255; rgba[out + 1] = (lastTint >> 8) & 255; rgba[out + 2] = lastTint & 255; rgba[out + 3] = 255;
  }
  buildTiles(rgba, forImage.width, forImage.height, 'Tinting').then(function (tiles) {
    if (state.image !== forImage) { return; }
    state.tinted[mode] = { tiles: tiles, tintOfColor: tints };
    hideLoading();
    render();
  }).catch(function (error: unknown) { showLoading('Could not tint the map: ' + messageOf(error)); });
}

/** The data behind one repaint changed: it is built again, now if it is the one on screen. */
export function refreshTint(mode: TintMode): void {
  state.tinted[mode] = null;
  if (state.tintMode === mode) { buildTintedTiles(mode); }
}

/** A new Country Colors tint: both repaints have to be built again. */
export function applyTint(percent: number): void {
  const weight = Math.min(100, Math.max(0, percent)) / 100;
  if (!isFinite(weight) || weight === state.tintWeight) { return; }
  state.tintWeight = weight;
  for (const mode of TINT_MODES) { refreshTint(mode); }
  render();
}

/** One repaint at a time: ticking one box unticks the other. */
function setTintMode(mode: TintMode | null): void {
  state.tintMode = mode;
  for (const each of TINT_MODES) {
    tintBoxes[each].checked = each === mode;
    if (each !== mode) { state.tinted[each] = null; }
  }
  if (mode && !state.tinted[mode]) { buildTintedTiles(mode); }
  render();
}

/** A new map: the overlays and the repaints start over, and the province map is what is painted again. */
export function resetLayers(riversUri: string | undefined, terrainUri: string | undefined): void {
  state.countryColors = null; state.stateOf = null;
  for (const mode of TINT_MODES) { state.tinted[mode] = null; }
  state.overlayUri.rivers = riversUri ?? null; state.overlayUri.terrain = terrainUri ?? null;
  for (const kind of OVERLAYS) {
    state.indexed[kind] = null;
    state.overlayLoading[kind] = false;
    indexedLoad[kind] = null;
    indexedFailure[kind] = null;
  }
  state.editLayer = 'provinces';
  syncLayerRows();
}

export function initLayers(): void {
  layerPositions.addEventListener('change', function () { state.showPositions = layerPositions.checked; render(); });
  layerText.addEventListener('change', function () { state.showTextLabels = layerText.checked; render(); });
  for (const mode of TINT_MODES) {
    tintBoxes[mode].addEventListener('change', function () { setTintMode(tintBoxes[mode].checked ? mode : null); });
  }
  buildFixedRows();
}
