import type { MapCountryColors, ProvinceDefinition } from '../model/mapEditor.js';
import { buildTiles, decodeProvincesBmp, decodeRiversBmp, decodeTerrainBmp, fetchBitmap } from './bitmaps.js';
import { fitView, render } from './canvas.js';
import { h, hideLoading, loading, required, requiredInput, setStatus, showLoading } from './dom.js';
import { sliderInput, type Field, type SliderRange } from './fields.js';
import { log, messageOf } from './host.js';
import { applyReveal } from './input.js';
import { placeReferences } from './references.js';
import { definitionById, FIXED_LAYERS, OVERLAYS, SEA_TINT, seaIds, state, UNOWNED_TINT, type FixedLayer, type Overlay } from './state.js';

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
const layerCountry = requiredInput('layerCountry');
const layerPositions = requiredInput('layerPositions');

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
      if (kind !== 'provinces' && value > 0) { loadOverlay(kind); }
      render();
    });
    layerRows.set(kind, row);
    fixedLayersBox.append(row.node);
  }
  syncLayerRows();
}

/** A layer the stack does not have is greyed with its slider at 0; a failed load puts it back there. */
function syncLayerRow(kind: Overlay): void {
  const row = layerRows.get(kind);
  if (!row) { return; }
  const missing = state.overlayUri[kind] === null;
  row.node.classList.toggle('off', missing);
  row.node.title = missing ? 'The picked mods have no map/' + kind + '.bmp' : '';
  row.slider.value = String(state.layerOpacity[kind]);
  for (const input of row.node.querySelectorAll('input')) { input.disabled = missing; }
}

export function syncLayerRows(): void {
  for (const kind of OVERLAYS) { syncLayerRow(kind); }
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
        if (state.showCountryColors && state.countryColors) { buildTintedTiles(); }
        for (const kind of OVERLAYS) { if (state.layerOpacity[kind] > 0) { loadOverlay(kind); } }
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

/** Fetch and decode an overlay once; it is kept until the map is reloaded. */
function loadOverlay(kind: Overlay): void {
  const uri = state.overlayUri[kind];
  if (state.overlayLoading[kind] || state.overlayTiles[kind] || !uri || !state.image) { return; }
  state.overlayLoading[kind] = true;
  const forImage = state.image;
  const name = kind + '.bmp';
  showLoading('Loading ' + name + '…');
  fetchBitmap(uri, name)
    .then(function (buffer) { return kind === 'rivers' ? decodeRiversBmp(buffer) : decodeTerrainBmp(buffer); })
    .then(function (decoded) {
      const image = state.image;
      if (image && (decoded.width !== image.width || decoded.height !== image.height)) {
        setStatus(name + ' is ' + String(decoded.width) + ' x ' + String(decoded.height) + ', the map ' + String(image.width) + ' x ' + String(image.height), 'error');
      }
      return buildTiles(decoded.rgba, decoded.width, decoded.height, 'Drawing ' + kind);
    })
    .then(function (tiles) {
      state.overlayLoading[kind] = false;
      if (state.image !== forImage) { return; }
      state.overlayTiles[kind] = tiles;
      hideLoading();
      render();
    })
    .catch(function (error: unknown) {
      state.overlayLoading[kind] = false;
      hideLoading();
      state.layerOpacity[kind] = 0;
      syncLayerRow(kind);
      setStatus('Could not show ' + name + ': ' + messageOf(error), 'error');
    });
}

/** One tint per province colour: the owner's colour with a share of the province's own, so neighbours still differ. */
function tintByPacked(definitions: readonly ProvinceDefinition[], colors: MapCountryColors): Map<number, number> {
  const tints = new Map<number, number>();
  const weight = state.tintWeight;
  for (const definition of definitions) {
    const tag = colors.owners[String(definition.id)];
    const owned = tag === undefined ? undefined : colors.colors[tag];
    const base = seaIds.has(definition.id) ? SEA_TINT : (owned ?? UNOWNED_TINT);
    const own = definition.color;
    const red = Math.round(weight * base[0] + (1 - weight) * ((own >> 16) & 255));
    const green = Math.round(weight * base[1] + (1 - weight) * ((own >> 8) & 255));
    const blue = Math.round(weight * base[2] + (1 - weight) * (own & 255));
    tints.set(own, (red << 16) | (green << 8) | blue);
  }
  return tints;
}

/** Repaint the whole bitmap by owner and cut it into tiles; drawn instead of image.tiles while the layer is on. */
export function buildTintedTiles(): void {
  const forImage = state.image;
  if (!forImage || !state.countryColors || !state.map) { return; }
  const packed = forImage.packed;
  const count = packed.length;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(count * 4));
  const tints = tintByPacked(state.map.definitions, state.countryColors);
  state.tintOfColor = tints;
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
    state.tintedTiles = tiles;
    hideLoading();
    render();
  }).catch(function (error: unknown) { showLoading('Could not tint the map: ' + messageOf(error)); });
}

/** A new Country Colors tint: the tinted bitmap has to be built again. */
export function applyTint(percent: number): void {
  const weight = Math.min(100, Math.max(0, percent)) / 100;
  if (!isFinite(weight) || weight === state.tintWeight) { return; }
  state.tintWeight = weight;
  state.tintedTiles = null;
  if (state.showCountryColors) { buildTintedTiles(); }
  render();
}

/** A new map: the overlays and the tint start over. */
export function resetLayers(riversUri: string | undefined, terrainUri: string | undefined): void {
  state.countryColors = null; state.tintedTiles = null; state.tintOfColor = null;
  state.overlayUri.rivers = riversUri ?? null; state.overlayUri.terrain = terrainUri ?? null;
  for (const kind of OVERLAYS) { state.overlayTiles[kind] = null; state.overlayLoading[kind] = false; }
  syncLayerRows();
}

export function initLayers(): void {
  layerPositions.addEventListener('change', function () { state.showPositions = layerPositions.checked; render(); });
  layerCountry.addEventListener('change', function () {
    state.showCountryColors = layerCountry.checked;
    if (state.showCountryColors && !state.tintedTiles) { buildTintedTiles(); }
    render();
  });
  buildFixedRows();
}
