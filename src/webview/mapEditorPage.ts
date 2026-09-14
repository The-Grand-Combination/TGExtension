/**
 * The Map Editor page. It fetches `provinces.bmp` itself (the extension allows
 * the map folder as a local resource), decodes it, and draws it on a canvas
 * with pan and zoom. A click maps the pixel color to a province through
 * definition.csv and asks the extension for that province's details; the side
 * panel edits them and posts one save per section.
 *
 * Bundled on its own (`dist/mapEditorPage.js`) against the DOM lib, so this is
 * the one part of the page the type checker and the linter can see.
 */

import type {
  MapCountryColors,
  MapEditorMap,
  MapEditorReveal,
  PositionMarker,
  PositionsSection,
  PositionPoint,
  PositionKind,
  ProvinceDefinition,
  NamedIdentifier,
  ProvinceDetails,
  ProvinceHistory,
  DatedHistory,
  HostMessage,
  PopEntry,
  ProvincePositions,
  SaveResult,
  FileRef,
  Rgb,
} from '../model/mapEditor.js';

import type { PaintResult } from '../model/mapEditor.js';

import { DEFAULT_PAINT_UNDO_STEPS, VANILLA_MAX_PROVINCES } from '../model/mapEditor.js';

import { enclosedPixels, floodFill, runsOf, strokePixels } from '../services/provincePaint.js';

import { decodeBmp as decodeBmpFile, type BmpImage } from '../services/bmpDecoder.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();

/** One square of the decoded bitmap; a single 20-megapixel canvas never settles on some GPUs. */
interface Tile {
  readonly x: number;
  readonly y: number;
  readonly canvas: HTMLCanvasElement;
}

interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[];
  /** `red << 16 | green << 8 | blue` per pixel, in the order the rows are drawn. */
  readonly packed: Uint32Array;
}

/** The outline drawn over the selected province, as its own canvas at an offset. */
interface Highlight {
  readonly id: number;
  readonly color: number;
  readonly canvas: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A province's points as the form holds them; an absent kind has no block. */
type Draft = Partial<Record<PositionKind, PositionPoint | undefined>>;

/** The side panel's tabs, in the order they are shown. */
type TabName = 'definition' | 'positions' | 'buildings' | 'dates' | 'pops';

const TAB_NAMES: readonly TabName[] = ['definition', 'positions', 'buildings', 'dates', 'pops'];
const TAB_LABELS: Record<TabName, string> = {
  definition: 'Definition',
  positions: 'Positions',
  buildings: 'Buildings',
  dates: 'Extra Dates',
  pops: 'Pops',
};

interface View {
  scale: number;
  x: number;
  y: number;
}

let map: MapEditorMap | null = null;
const idByColor = new Map<number, number>();
const definitionById = new Map<number, ProvinceDefinition>();
let seaIds = new Set<number>();
let image: DecodedImage | null = null;
const TILE = 1024;
let view: View = { scale: 1, x: 0, y: 0 };
let selection: Highlight | null = null;
/** The province the side panel is about, set before its answer arrives. */
let selectedId: number | null = null;
/** The painted colour the panel is about while the province it names does not exist yet. */
let newColor: number | null = null;
/** The localisation field and the Sea province tick, read when a save has to create the province. */
let nameInput: HTMLInputElement | null = null;
let seaInput: HTMLInputElement | null = null;
let details: ProvinceDetails | null = null;
/** From a map report link, applied once the bitmap is decoded. */
let pendingReveal: MapEditorReveal | null = null;
let popDate = '';
let saving = false;
let activeTab: TabName = 'definition';
/** Terrain name -> data URI, or null for "asked, none"; per map. */
const terrainPictures = new Map<string, string | null>();
let headerBox: HTMLElement | null = null;
let headerTerrainLabel: HTMLElement | null = null;
/** The terrain the header currently shows. */
let previewTerrain = '';
// map/positions.txt: every point of the map as the file has it, drawn once
// the view is close enough; the selected province draws its draft instead.
let markers: PositionMarker[] = [];
let draft: Draft | null = null;
// Points moved but not written, province by province. They survive moving to
// the next province, draw on the map, and go out together on Save all.
const pendingPositions = new Map<number, Draft>();
/** The selected province's points as the file has them. */
let draftBaseline: Draft | null = null;
let pendingTimer: number | null = null;
/** Kind -> the Positions tab inputs, kept in step with a drag. */
let positionInputs: Partial<Record<PositionKind, { x: HTMLInputElement; y: HTMLInputElement }>> = {};
/** Screen pixels per map pixel before positions are drawn. */
const MARKER_MIN_SCALE = 4;
// Map layers (the box over the bottom-left corner). Country Colors tints
// every province towards its start-date owner's colour; the pixels the
// clicks read (image.packed) stay the definition colours.
let showPositions = true;
let showCountryColors = false;
let countryColors: MapCountryColors | null = null;
/** Tiles of the tinted bitmap, built the first time the layer is shown. */
let tintedTiles: Tile[] | null = null;
/** Province colour -> its tint, kept from that build so a painted pixel can be tinted on its own. */
let tintOfColor: Map<number, number> | null = null;
const SEA_TINT: Rgb = [150, 190, 230];
const UNOWNED_TINT: Rgb = [150, 150, 150];
/** Share of the owner's colour (victorianTools.mapEditor.countryColorsTint / 100). */
let TINT_WEIGHT = 0.82;
// Show Rivers: map/rivers.bmp (8-bit, every index below 254 is river) drawn as blue over the map.
let showRivers = false;
/** Webview URI of rivers.bmp, or null when the stack has none. */
let riversUri: string | null = null;
/** Tiles of the river overlay (transparent where there is no river). */
let riverTiles: Tile[] | null = null;
let riversLoading = false;
const RIVER_COLOR: Rgb = [47, 128, 255];
const RIVER_SEA_INDEX = 254;

interface PositionKindSpec {
  readonly kind: PositionKind;
  readonly label: string;
  readonly color: string;
}

const POSITION_KIND_SPECS: readonly PositionKindSpec[] = [
  { kind: 'unit', label: 'Unit', color: '#ff3b30' },
  { kind: 'city', label: 'City', color: '#ffd60a' },
  { kind: 'factory', label: 'Factory', color: '#ff9f0a' },
  { kind: 'fort', label: 'Fort', color: '#30d158' },
  { kind: 'railroad', label: 'Railroad', color: '#0a84ff' },
  { kind: 'naval_base', label: 'Naval base', color: '#bf5af2' },
];
const COLOR_OF: Partial<Record<PositionKind, string>> = {};
for (const spec of POSITION_KIND_SPECS) {
  COLOR_OF[spec.kind] = spec.color;
}

/** The page's own markup defines these; a miss is a bug in the HTML, not a state to handle. */
function required(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error('The page is missing #' + id + '.');
  }
  return node;
}

function requiredButton(id: string): HTMLButtonElement {
  const node = required(id);
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error('#' + id + ' is not a button.');
  }
  return node;
}

function requiredInput(id: string): HTMLInputElement {
  const node = required(id);
  if (!(node instanceof HTMLInputElement)) {
    throw new Error('#' + id + ' is not an input.');
  }
  return node;
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const node = required(id);
  if (!(node instanceof HTMLCanvasElement)) {
    throw new Error('#' + id + ' is not a canvas.');
  }
  return node;
}

const mapArea = required('mapArea');
const canvas = requiredCanvas('canvas');
const context = canvas.getContext('2d');
if (!context) {
  throw new Error('This webview has no 2d canvas context.');
}
const ctx = context;
const tooltip = required('tooltip');
const loading = required('loading');
const layerCountry = requiredInput('layerCountry');
const layerPositions = requiredInput('layerPositions');
const saveAllButton = requiredButton('saveAllButton');
const layerRivers = requiredInput('layerRivers');
const side = required('side');
const statusBox = required('status');
const targetBox = required('target');
const gotoInput = requiredInput('goto');

function setStatus(text: string, kind?: string): void {
  statusBox.textContent = text || '';
  statusBox.className = 'status ' + (kind ?? '');
}

/** What `h` accepts as an attribute value; a function is bound as a listener. */
type AttributeValue = string | number | boolean | null | undefined | EventListener;
type Attributes = Record<string, AttributeValue>;
/** Anything `h` can append: nodes, text, or nested lists, with holes skipped. */
type Child = Node | string | number | boolean | null | undefined | readonly Child[];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attributes | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }
      if (key === 'class') {
        node.className = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    appendChildren(node, child);
  }
  return node;
}

function plusButton(title: string, onClick: EventListener): HTMLButtonElement {
  return h('button', { class: 'glyph plus', title: title, 'aria-label': title, onclick: onClick });
}
function appendChildren(node: HTMLElement, child: Child): void {
  if (child === undefined || child === null || typeof child === 'boolean') { return; }
  if (typeof child === 'string') { node.append(document.createTextNode(child)); return; }
  if (typeof child === 'number') { node.append(document.createTextNode(String(child))); return; }
  if (child instanceof Node) { node.append(child); return; }
  for (const item of child) { appendChildren(node, item); }
}
function textInput(value: string | undefined, type?: string, extraClass?: string): HTMLInputElement {
  const input = h('input', { type: type ?? 'text', class: 'field' + (extraClass ? ' ' + extraClass : ''), spellcheck: 'false' });
  input.value = value ?? '';
  return input;
}
/** A range with its value beside it, read and written like a plain field. */
function sliderInput(value: string | undefined, range: SliderRange, extraClass?: string): FieldElement {
  const input = h('input', { type: 'range', min: String(range.min), max: String(range.max) });
  const readout = h('span', { class: 'readout' });
  const dots = range.ticks
    ? h('div', { class: 'rail' }, Array.from({ length: range.max - range.min + 1 }, function () { return h('span'); }))
    : null;
  const track = h('div', { class: 'range' }, dots, input);
  const classes = 'slider field' + (range.ticks ? ' stepped' : '') + (extraClass ? ' ' + extraClass : '');
  const wrapper = h('div', { class: classes }, track, readout);
  function show(): void {
    readout.textContent = range.labels?.[Number(input.value) - range.min] ?? input.value;
  }
  function setValue(next: string): void {
    input.value = next === '' ? String(range.min) : next;
    show();
  }
  input.addEventListener('input', show);
  Object.defineProperty(wrapper, 'value', {
    get: function (): string { return input.value; },
    set: setValue,
  });
  setValue(value ?? '');
  // `value` is installed by defineProperty just above; no DOM type can say so.
  return wrapper as unknown as FieldElement;
}

/** A yes/no field as a box: ticked reads `yes`, unticked reads empty, which writes no line. */
function checkInput(value: string | undefined): FieldElement {
  const box = h('input', { type: 'checkbox' });
  box.checked = (value ?? '').trim().toLowerCase() === 'yes';
  const wrapper = h('div', { class: 'tick field' }, box);
  Object.defineProperty(wrapper, 'value', {
    get: function (): string { return box.checked ? 'yes' : ''; },
    set: function (next: string): void { box.checked = next.trim().toLowerCase() === 'yes'; },
  });
  // `value` is installed by defineProperty just above; no DOM type can say so.
  return wrapper as unknown as FieldElement;
}

/** The element that takes the caret and the placeholder: a plain input, or the one inside a combo. */
function fieldInput(node: HTMLElement): HTMLElement | null {
  return node.tagName === 'INPUT' ? node : node.querySelector('input');
}
/** Grey a part of the form out and stop it taking input: the province cannot have it. */
function lock(node: HTMLElement): void {
  node.classList.add('locked');
  for (const element of node.querySelectorAll('input, select, button, textarea')) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.disabled = true;
    }
  }
}
/** The example row steps aside for the first real one; it comes back when the last row goes. */
function dropGhost(rows: HTMLElement): void {
  const ghost = rows.querySelector('.row.ghost');
  if (ghost) { ghost.remove(); }
}
function valueOf(input: FieldElement): string | undefined {
  const value = input.value.trim();
  return value === '' ? undefined : value;
}
function option(value: string, label: string): HTMLOptionElement {
  return h('option', { value: value }, label);
}
/** A control the panel reads with `valueOf`: a plain input, or the combo that mimics one. */
type FieldElement = HTMLElement & { value: string };

/** A combo row: a vocabulary entry, or the synthetic "none" row at the top. */
interface ComboEntry {
  readonly id: string;
  readonly label: string;
  readonly empty?: boolean;
}

const COMBO_LIMIT = 80;
/**
 * A searchable pick list over { id, label } entries: typing filters by id or
 * label, arrows move, Enter picks, Escape reverts. The element's value is
 * the picked id; a value the list lacks is kept (and shown as such), and a
 * typed text that matches nothing is taken as a raw id.
 */
function selectInput(
  value: string | undefined,
  entries: readonly NamedIdentifier[],
  emptyLabel?: string,
  freeText?: boolean,
): FieldElement {
  const byId = new Map<string, ComboEntry>();
  for (const entry of entries) { byId.set(entry.id, entry); }
  const input = h('input', { type: 'text', spellcheck: 'false', placeholder: emptyLabel ?? '' });
  const list = h('div', { class: 'combo-list', hidden: true });
  const wrapper = h('div', { class: 'combo field' }, input, list);
  let selected = '';
  let shown: ComboEntry[] = [];
  let activeIndex = -1;
  function labelOf(id: string): string {
    const entry = byId.get(id);
    if (entry) { return entry.label; }
    return id === '' || freeText === true ? id : id + ' (not in the mod)';
  }
  function setValue(id: string | undefined): void {
    selected = id ?? '';
    input.value = labelOf(selected);
  }
  function pick(id: string): void {
    setValue(id);
    close();
    wrapper.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function close(): void { list.hidden = true; activeIndex = -1; }
  function render(filter: string): void {
    const needle = filter.toLowerCase();
    shown = entries.filter(function (entry) {
      return needle === '' || entry.id.toLowerCase().includes(needle) || entry.label.toLowerCase().includes(needle);
    }).slice(0, COMBO_LIMIT);
    if (emptyLabel !== undefined && needle === '') { shown.unshift({ id: '', label: emptyLabel, empty: true }); }
    list.replaceChildren();
    shown.forEach(function (entry, index) {
      list.append(h('div', {
        class: 'combo-item' + (index === activeIndex ? ' active' : '') + (entry.empty ? ' empty' : ''),
        onmousedown: function (event) { event.preventDefault(); pick(entry.id); }
      }, entry.label));
    });
    list.hidden = shown.length === 0;
    const active = list.querySelector('.active');
    if (active) { active.scrollIntoView({ block: 'nearest' }); }
  }
  // Only an entry of the list (or nothing) can be picked; other text reverts to
  // the current value, unless the field takes free text — a file name the mod
  // has yet to hold is one, and the single shown entry must not hijack it.
  function commit(): void {
    const text = input.value.trim();
    if (text === labelOf(selected)) { return; }
    if (text === '') { pick(''); return; }
    const lower = text.toLowerCase();
    const match = entries.find(function (entry) { return entry.label.toLowerCase() === lower || entry.id.toLowerCase() === lower; });
    if (match) { pick(match.id); return; }
    if (freeText === true) { pick(text); return; }
    const only = shown.length === 1 ? shown[0] : undefined;
    if (only && !only.empty) { pick(only.id); return; }
    setValue(selected);
  }
  input.addEventListener('focus', function () { input.select(); activeIndex = -1; });
  // A click opens the list, focus alone does not: a row added to a list lands on
  // an empty field with the rows under it still in view.
  input.addEventListener('click', function () { if (list.hidden) { activeIndex = -1; render(''); } });
  input.addEventListener('input', function () { activeIndex = -1; render(input.value.trim()); });
  input.addEventListener('blur', function () { commit(); close(); });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) { render(input.value.trim()); }
      activeIndex = Math.max(0, Math.min(shown.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      render(input.value.trim());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const active = activeIndex >= 0 ? shown[activeIndex] : undefined;
      if (active) { pick(active.id); } else { commit(); close(); }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setValue(selected);
      close();
    }
  });
  Object.defineProperty(wrapper, 'value', {
    get: function (): string { return selected; },
    set: function (next: string): void { setValue(next); },
  });
  wrapper.focus = function (): void { input.focus(); };
  setValue(value);
  // `value` is installed by defineProperty just above; no DOM type can say so.
  return wrapper as unknown as FieldElement;
}

/**
 * Paradox map bitmaps are stored upside down on purpose: the game reads the rows
 * as they come, so the page shows them in storage order, which flips a normal BMP
 * vertically. `bmpDecoder` hands rows back top-down, so page row `y` is its row
 * `height - 1 - y` for the usual bottom-up file.
 */
function storedRowOffset(image: BmpImage, y: number): number {
  return image.rowOffset(image.topDown ? y : image.height - 1 - y);
}

/** Read a bitmap with the same decoder the reports use, or say why it cannot be shown. */
function readBitmap(buffer: ArrayBuffer, name: string): BmpImage {
  const result = decodeBmpFile(new Uint8Array(buffer));
  if (result.kind === 'error') {
    throw new Error(name + ': ' + result.reason + '.');
  }
  return result.image;
}

interface DecodedPixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly packed: Uint32Array;
}

function decodeBmp(buffer: ArrayBuffer): DecodedPixels {
  const image = readBitmap(buffer, 'provinces.bmp');
  const { width, height, bitsPerPixel } = image;
  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error(String(bitsPerPixel) + '-bit provinces.bmp; only 24-bit and 32-bit maps can be shown.');
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const bytes = image.bytes;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const packed = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    let source = storedRowOffset(image, y);
    let target = y * width;
    for (let x = 0; x < width; x++) {
      const blue = bytes[source] ?? 0;
      const green = bytes[source + 1] ?? 0;
      const red = bytes[source + 2] ?? 0;
      const out = target * 4;
      rgba[out] = red; rgba[out + 1] = green; rgba[out + 2] = blue; rgba[out + 3] = 255;
      packed[target] = (red << 16) | (green << 8) | blue;
      source += bytesPerPixel; target++;
    }
  }
  return { width: width, height: height, rgba: rgba, packed: packed };
}

/** rivers.bmp as a transparent overlay: every palette index below 254 (source, merge, widths) becomes a blue pixel. */
function decodeRiversBmp(buffer: ArrayBuffer): { width: number; height: number; rgba: Uint8ClampedArray } {
  const image = readBitmap(buffer, 'rivers.bmp');
  if (image.bitsPerPixel !== 8) {
    throw new Error(String(image.bitsPerPixel) + '-bit rivers.bmp; the game reads an 8-bit one.');
  }
  const { width, height, bytes } = image;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    let source = storedRowOffset(image, y);
    let out = y * width * 4;
    for (let x = 0; x < width; x++, source++, out += 4) {
      if ((bytes[source] ?? RIVER_SEA_INDEX) < RIVER_SEA_INDEX) {
        rgba[out] = RIVER_COLOR[0]; rgba[out + 1] = RIVER_COLOR[1]; rgba[out + 2] = RIVER_COLOR[2]; rgba[out + 3] = 255;
      }
    }
  }
  return { width: width, height: height, rgba: rgba };
}

function log(message: string): void {
  vscode.postMessage({ type: 'log', message: message });
}
function showLoading(text: string): void {
  loading.hidden = false;
  loading.textContent = text;
  log(text);
}
function readBody(response: Response): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) { return response.arrayBuffer(); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  function step(): Promise<ArrayBuffer> {
    return reader.read().then(function (result): Promise<ArrayBuffer> | ArrayBuffer {
      if (result.done) {
        const joined = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
        return joined.buffer;
      }
      chunks.push(result.value);
      received += result.value.length;
      showLoading('Loading provinces.bmp… ' + (received / 1048576).toFixed(1) + (total > 0 ? ' / ' + (total / 1048576).toFixed(1) : '') + ' MB');
      return step();
    });
  }
  return step();
}
function loadMap(bmpUri: string): void {
  showLoading('Loading provinces.bmp…');
  log('fetching ' + bmpUri);
  fetch(bmpUri)
    .then(function (response) {
      log('response ' + String(response.status) + ' ' + (response.headers.get('content-type') ?? '') + ' ' + (response.headers.get('content-length') ?? '?') + ' bytes');
      if (!response.ok) { throw new Error('provinces.bmp could not be read (HTTP ' + String(response.status) + ').'); }
      return readBody(response);
    })
    .then(function (buffer) {
      showLoading('Decoding provinces.bmp (' + (buffer.byteLength / 1048576).toFixed(1) + ' MB)…');
      return new Promise<void>(function (resolve) { setTimeout(resolve, 0); }).then(function () { return decodeBmp(buffer); });
    })
    .then(function (decoded) {
      showLoading('Drawing ' + String(decoded.width) + ' x ' + String(decoded.height) + '…');
      return buildTiles(decoded.rgba, decoded.width, decoded.height, 'Drawing').then(function (tiles) {
        image = { width: decoded.width, height: decoded.height, tiles: tiles, packed: decoded.packed };
        loading.hidden = true;
        fitView();
        render();
        if (showCountryColors && countryColors) { buildTintedTiles(); }
        if (showRivers && riversUri) { loadRivers(); }
        setStatus(String(decoded.width) + ' x ' + String(decoded.height) + ', ' + String(definitionById.size) + ' provinces');
        log('map ready; overlay ' + getComputedStyle(loading).display);
        applyReveal();
      });
    })
    .catch(function (error: unknown) {
      showLoading('Could not show the map: ' + messageOf(error));
    });
}
/** An unknown thrown value as text; a page error must never be swallowed. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

window.addEventListener('error', function (event) { showLoading('Page error: ' + event.message); });
window.addEventListener('unhandledrejection', function (event) { showLoading('Page error: ' + messageOf(event.reason)); });

/** Copy pixels into TILE x TILE canvases, one row of tiles per turn of the event loop. */
function buildTiles(
  rgba: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  verb: string,
): Promise<Tile[]> {
  const tiles: Tile[] = [];
  const rows = Math.ceil(imageHeight / TILE);
  const columns = Math.ceil(imageWidth / TILE);
  const full = new ImageData(new Uint8ClampedArray(rgba), imageWidth, imageHeight);
  return new Promise(function (resolve, reject) {
    let row = 0;
    function next(): void {
      try {
        for (let column = 0; column < columns; column++) {
          const x = column * TILE;
          const y = row * TILE;
          const width = Math.min(TILE, imageWidth - x);
          const height = Math.min(TILE, imageHeight - y);
          const tile = document.createElement('canvas');
          tile.width = width; tile.height = height;
          const tileContext = tile.getContext('2d');
          if (!tileContext) { throw new Error('The browser refused a ' + String(width) + ' x ' + String(height) + ' canvas.'); }
          tileContext.putImageData(full, -x, -y);
          tiles.push({ x: x, y: y, canvas: tile });
        }
        row++;
        showLoading(verb + ' ' + String(imageWidth) + ' x ' + String(imageHeight) + '… ' + String(Math.round((row / rows) * 100)) + '%');
        if (row < rows) { setTimeout(next, 0); } else { resolve(tiles); }
      } catch (error) { reject(error instanceof Error ? error : new Error(messageOf(error))); }
    }
    next();
  });
}

layerPositions.addEventListener('change', function () { showPositions = layerPositions.checked; render(); });
layerRivers.addEventListener('change', function () {
  showRivers = layerRivers.checked;
  if (showRivers && !riversUri && map) {
    setStatus('The picked mods have no map/rivers.bmp.', 'error');
    showRivers = false; layerRivers.checked = false;
    return;
  }
  if (showRivers && !riverTiles && image) { loadRivers(); }
  render();
});
/** Fetch and decode rivers.bmp once; the overlay is kept until the map is reloaded. */
function loadRivers(): void {
  if (riversLoading || riverTiles || !riversUri) { return; }
  riversLoading = true;
  const forImage = image;
  showLoading('Loading rivers.bmp…');
  fetch(riversUri)
    .then(function (response) {
      if (!response.ok) { throw new Error('rivers.bmp could not be read (HTTP ' + String(response.status) + ').'); }
      return readBody(response);
    })
    .then(function (buffer) { return decodeRiversBmp(buffer); })
    .then(function (decoded) {
      if (image && (decoded.width !== image.width || decoded.height !== image.height)) {
        setStatus('rivers.bmp is ' + String(decoded.width) + ' x ' + String(decoded.height) + ', the map ' + String(image.width) + ' x ' + String(image.height), 'error');
      }
      return buildTiles(decoded.rgba, decoded.width, decoded.height, 'Drawing rivers');
    })
    .then(function (tiles) {
      riversLoading = false;
      if (image !== forImage) { return; }
      riverTiles = tiles;
      loading.hidden = true;
      render();
    })
    .catch(function (error: unknown) {
      riversLoading = false;
      loading.hidden = true;
      showRivers = false; layerRivers.checked = false;
      setStatus('Could not show rivers: ' + messageOf(error), 'error');
    });
}
layerCountry.addEventListener('change', function () {
  showCountryColors = layerCountry.checked;
  if (showCountryColors && !tintedTiles) { buildTintedTiles(); }
  render();
});
/** One tint per province colour: the owner's colour with a share of the province's own, so neighbours still differ. */
function tintByPacked(definitions: readonly ProvinceDefinition[], colors: MapCountryColors): Map<number, number> {
  const tints = new Map<number, number>();
  for (const definition of definitions) {
    const tag = colors.owners[String(definition.id)];
    const owned = tag === undefined ? undefined : colors.colors[tag];
    const base = seaIds.has(definition.id) ? SEA_TINT : (owned ?? UNOWNED_TINT);
    const own = definition.color;
    const red = Math.round(TINT_WEIGHT * base[0] + (1 - TINT_WEIGHT) * ((own >> 16) & 255));
    const green = Math.round(TINT_WEIGHT * base[1] + (1 - TINT_WEIGHT) * ((own >> 8) & 255));
    const blue = Math.round(TINT_WEIGHT * base[2] + (1 - TINT_WEIGHT) * (own & 255));
    tints.set(own, (red << 16) | (green << 8) | blue);
  }
  return tints;
}
/** Repaint the whole bitmap by owner and cut it into tiles; drawn instead of image.tiles while the layer is on. */
function buildTintedTiles(): void {
  const forImage = image;
  if (!forImage || !countryColors || !map) { return; }
  const packed = forImage.packed;
  const count = packed.length;
  const rgba = new Uint8ClampedArray(count * 4);
  const tints = tintByPacked(map.definitions, countryColors);
  tintOfColor = tints;
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
    if (image !== forImage) { return; }
    tintedTiles = tiles;
    loading.hidden = true;
    render();
  }).catch(function (error: unknown) { showLoading('Could not tint the map: ' + messageOf(error)); });
}

function resizeCanvas(): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(mapArea.clientWidth * ratio));
  const height = Math.max(1, Math.floor(mapArea.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
}
function fitView(): void {
  if (!image) { return; }
  const scale = Math.min(mapArea.clientWidth / image.width, mapArea.clientHeight / image.height);
  view = { scale: scale, x: (mapArea.clientWidth - image.width * scale) / 2, y: (mapArea.clientHeight - image.height * scale) / 2 };
}
function render(): void {
  resizeCanvas();
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!image) { return; }
  ctx.imageSmoothingEnabled = view.scale < 1;
  ctx.setTransform(ratio * view.scale, 0, 0, ratio * view.scale, ratio * view.x, ratio * view.y);
  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + mapArea.clientWidth / view.scale;
  const bottom = top + mapArea.clientHeight / view.scale;
  drawTiles(showCountryColors && tintedTiles ? tintedTiles : image.tiles, left, top, right, bottom);
  if (showRivers && riverTiles) {
    ctx.imageSmoothingEnabled = false;
    drawTiles(riverTiles, left, top, right, bottom);
  }
  if (selection) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(selection.canvas, selection.x, selection.y);
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

// Positions are one map pixel each, so they only appear once a map pixel is
// a few screen pixels wide. The selected province's points come from the
// form's draft and get a white rim; a point being edited moves live.
function drawMarkers(left: number, top: number, right: number, bottom: number): void {
  const currentImage = image;
  if (!currentImage) { return; }
  ctx.imageSmoothingEnabled = false;
  if (showPositions && view.scale >= MARKER_MIN_SCALE) {
    drawFileMarkers(currentImage, left, top, right, bottom);
  }
  // Points edited and not yet written are the edit itself, so neither the zoom
  // nor the layer switch hides them, and below one map pixel they are drawn
  // big enough to see. The province being edited also gets a rim.
  const size = Math.max(1, 3 / view.scale);
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
  for (const marker of markers) {
    if (draft && marker.id === selectedId) { continue; }
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
    if (id === selectedId) { continue; }
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
  if (!draft) { return; }
  const rim = 1.5 / view.scale;
  for (const spec of POSITION_KIND_SPECS) {
    if (details?.isSea && spec.kind !== 'unit') { continue; }
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
function clonePoints(points: Draft | null | undefined): Draft {
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
function capturePending(): void {
  if (!details || !draft) { return; }
  if (samePoints(draft, draftBaseline)) { pendingPositions.delete(details.id); }
  else { pendingPositions.set(details.id, clonePoints(draft)); }
  refreshPending();
}
function pendingCount(): number { return pendingPositions.size; }
function refreshPending(): void {
  const count = pendingCount();
  saveAllButton.hidden = count === 0;
  saveAllButton.textContent = count === 1 ? 'Save 1 province' : 'Save ' + String(count) + ' provinces';
  if (pendingTimer !== null) { clearTimeout(pendingTimer); }
  pendingTimer = window.setTimeout(sendPending, 400);
}
/** The extension keeps the same list, so closing the tab can still offer to write it. */
function sendPending(): void {
  pendingTimer = null;
  vscode.postMessage({ type: 'pending', edits: [...pendingPositions].map(function ([id, data]) {
    return { provinceId: id, data: data };
  }) });
}
/** The draft's point of a kind as numbers, or null when unset or not numeric. */
function draftPoint(kind: PositionKind): { x: number; y: number } | null {
  const point = draft?.[kind];
  if (!point) { return null; }
  const x = Number(point.x);
  const y = Number(point.y);
  return isFinite(x) && isFinite(y) && point.x !== '' && point.y !== '' ? { x: x, y: y } : null;
}
/** The kind of the selected province's point under the pointer, when close enough to grab. */
function markerAt(clientX: number, clientY: number): PositionKind | null {
  const currentImage = image;
  if (!showPositions || !currentImage || !draft || view.scale < MARKER_MIN_SCALE || tool !== 'hand') { return null; }
  const rect = mapArea.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  let best: PositionKind | null = null;
  let bestDistance = Math.max(6, view.scale / 2 + 2);
  for (const spec of POSITION_KIND_SPECS) {
    if (details?.isSea && spec.kind !== 'unit') { continue; }
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
function setDraftPoint(kind: PositionKind, x: number, y: number): void {
  if (!draft || !image) { return; }
  const clampedX = Math.min(image.width, Math.max(0, x));
  const clampedY = Math.min(image.height, Math.max(0, y));
  const point: PositionPoint = { x: clampedX.toFixed(2), y: clampedY.toFixed(2) };
  draft[kind] = point;
  const inputs = positionInputs[kind];
  if (inputs) { inputs.x.value = point.x; inputs.y.value = point.y; }
  capturePending();
  render();
}
/**
 * Where to put a point that should sit "in" the province: its centre of mass,
 * moved to the nearest pixel the province owns, because a crescent-shaped one
 * has its centre outside itself. A map place, y up from the bottom.
 */
function selectionCenter(): { x: number; y: number } | null {
  const current = selection;
  const currentImage = image;
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
/** Replace what the map knows about one province's points with what the disk now holds. */
function replaceMarkers(id: number, positions: PositionsSection | undefined): void {
  markers = markers.filter(function (marker) { return marker.id !== id; });
  const data = positions?.data;
  if (!data) { return; }
  for (const spec of POSITION_KIND_SPECS) {
    const point = data[spec.kind];
    const x = point ? Number(point.x) : NaN;
    const y = point ? Number(point.y) : NaN;
    if (isFinite(x) && isFinite(y)) { markers.push({ id: id, kind: spec.kind, x: x, y: y }); }
  }
}
interface Point {
  readonly x: number;
  readonly y: number;
}

function toImage(clientX: number, clientY: number): Point {
  const exact = toImageExact(clientX, clientY);
  return { x: Math.floor(exact.x), y: Math.floor(exact.y) };
}
function toImageExact(clientX: number, clientY: number): Point {
  const rect = mapArea.getBoundingClientRect();
  return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
}
function provinceAt(point: Point): number | undefined {
  if (!image || point.x < 0 || point.y < 0 || point.x >= image.width || point.y >= image.height) { return undefined; }
  const color = image.packed[point.y * image.width + point.x];
  return color === undefined ? undefined : idByColor.get(color);
}
function zoomAt(clientX: number, clientY: number, factor: number): void {
  if (!image) { return; }
  const rect = mapArea.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const minScale = Math.min(mapArea.clientWidth / image.width, mapArea.clientHeight / image.height) * 0.5;
  const scale = Math.min(64, Math.max(minScale, view.scale * factor));
  const ratio = scale / view.scale;
  view = { scale: scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
  render();
}

// --- Painting provinces -------------------------------------------------------
// The pencil and the bucket write into the decoded bitmap and into the tiles it
// is drawn from. Nothing reaches provinces.bmp until Save map, and every stroke
// can be taken back until then.

type Tool = 'hand' | 'pencil' | 'draw' | 'bucket' | 'pick';

const TOOLS: readonly { readonly tool: Tool; readonly id: string }[] = [
  { tool: 'hand', id: 'toolHand' },
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
const savePaintButton = requiredButton('savePaintButton');
const resetPaintButton = requiredButton('resetPaintButton');

let tool: Tool = 'hand';
/** What the brush writes. A colour of its own, not a province: the map is pixels. */
let brushColor = 0xff0000;
let brush = 1;
let undoLimit = DEFAULT_PAINT_UNDO_STEPS;
/** Pixel -> the colour provinces.bmp has for it, kept from the first time it was painted. */
const paintedFrom = new Map<number, number>();
/** Pixels that no longer hold their file colour: what a Save writes. */
const painted = new Set<number>();
/** One stroke, as pixel -> the colour it had before it: undo writes that straight back. */
const undoSteps: Map<number, number>[] = [];
const redoSteps: Map<number, number>[] = [];
let stroke: Map<number, number> | null = null;
/** Where the pencil last was, so a fast mouse draws a line and not a dotted one. */
let brushAt: Point | null = null;
/** Draw and paint: the line being drawn, kept until the button comes up and it is closed off. */
let drawLine: number[] | null = null;
let paintTimer: number | null = null;

function setTool(next: Tool): void {
  tool = next;
  for (const entry of toolButtons) { entry.button.classList.toggle('active', entry.tool === next); }
  brushSize.disabled = !paints(next);
  brushRow.classList.toggle('off', !paints(next));
  mapArea.classList.toggle('painting', next !== 'hand' && next !== 'pick');
  mapArea.classList.toggle('picking', next === 'pick');
}

/** The tools the brush width is for. */
function paints(which: Tool): boolean {
  return which === 'pencil' || which === 'draw';
}

/**
 * A drawn line is a wall the fill must not leak through, and a one-pixel line
 * drawn at an angle leaks through its own corners: it is never thinner than two.
 */
function brushWidth(): number {
  return tool === 'draw' ? Math.max(2, brush) : brush;
}

function setBrushColor(color: number): void {
  brushColor = color & 0xffffff;
  paintColorInput.value = hexOf(brushColor);
  paintColorText.textContent = hexOf(brushColor);
}

function hexOf(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function startPaint(event: MouseEvent): void {
  const currentImage = image;
  if (!currentImage) { return; }
  const point = toImage(event.clientX, event.clientY);
  if (point.x < 0 || point.y < 0 || point.x >= currentImage.width || point.y >= currentImage.height) { return; }
  if (tool === 'pick') { pickAt(point); return; }
  const color = brushColor;
  stroke = new Map();
  if (tool === 'bucket') {
    paintIndices(floodFill(currentImage.packed, currentImage.width, currentImage.height, point.y * currentImage.width + point.x, color), color);
    endStroke();
    return;
  }
  brushAt = point;
  if (tool === 'draw') { drawLine = []; }
  drawInto(strokePixels(point, point, brushWidth(), currentImage.width, currentImage.height), color);
}

function continueStroke(event: MouseEvent): void {
  const currentImage = image;
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
  const currentImage = image;
  if (!currentImage || line.length === 0) { return; }
  const inside = enclosedPixels(currentImage.packed, currentImage.width, currentImage.height, line, brushColor);
  if (inside.length === 0) {
    setStatus('The line closed nothing off: draw out of the colour and back into it.', 'warning');
    return;
  }
  paintIndices(inside, brushColor);
  setStatus('Filled ' + String(inside.length) + ' pixel(s)');
}

/** The eye drop takes the colour the pixel holds, whether or not a province owns it. */
function pickAt(point: Point): void {
  const currentImage = image;
  if (!currentImage) { return; }
  const color = currentImage.packed[point.y * currentImage.width + point.x];
  if (color === undefined) { return; }
  setBrushColor(color);
  const id = provinceAt(point);
  setStatus('Painting with ' + hexOf(color) + (id === undefined ? '' : ' (province ' + String(id) + ')'));
}

function paintIndices(indices: readonly number[], color: number): void {
  const currentImage = image;
  if (!currentImage) { return; }
  const pixels = new Map<number, number>();
  for (const index of indices) {
    const before = currentImage.packed[index];
    if (before === undefined || before === color) { continue; }
    pixels.set(index, color);
    if (stroke && !stroke.has(index)) { stroke.set(index, before); }
  }
  paintPixels(pixels);
}

/** Put the colours on the map: the pixels the clicks read, and the tiles the eye reads. */
function paintPixels(pixels: ReadonlyMap<number, number>): void {
  const currentImage = image;
  if (!currentImage || pixels.size === 0) { return; }
  for (const [index, color] of pixels) {
    if (!paintedFrom.has(index)) { paintedFrom.set(index, currentImage.packed[index] ?? color); }
    currentImage.packed[index] = color;
    if (paintedFrom.get(index) === color) { painted.delete(index); } else { painted.add(index); }
  }
  patchTiles(currentImage, pixels);
  render();
}

function patchTiles(currentImage: DecodedImage, pixels: ReadonlyMap<number, number>): void {
  const columns = Math.ceil(currentImage.width / TILE);
  const byTile = new Map<number, number[]>();
  for (const index of pixels.keys()) {
    const x = index % currentImage.width;
    const y = (index - x) / currentImage.width;
    const at = Math.floor(y / TILE) * columns + Math.floor(x / TILE);
    const held = byTile.get(at);
    if (held) { held.push(index); } else { byTile.set(at, [index]); }
  }
  for (const [at, indices] of byTile) {
    patchTile(currentImage.tiles[at], indices, pixels, currentImage.width, false);
    if (tintedTiles) { patchTile(tintedTiles[at], indices, pixels, currentImage.width, true); }
  }
}

/** One tile's painted pixels, written through the one box that holds them all. */
function patchTile(
  tile: Tile | undefined,
  indices: readonly number[],
  pixels: ReadonlyMap<number, number>,
  width: number,
  tinted: boolean,
): void {
  const context = tile?.canvas.getContext('2d');
  if (!tile || !context) { return; }
  let minX = tile.canvas.width;
  let minY = tile.canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (const index of indices) {
    const x = (index % width) - tile.x;
    const y = (index - (index % width)) / width - tile.y;
    if (x < minX) { minX = x; }
    if (x > maxX) { maxX = x; }
    if (y < minY) { minY = y; }
    if (y > maxY) { maxY = y; }
  }
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const box = context.getImageData(minX, minY, boxWidth, boxHeight);
  for (const index of indices) {
    const own = pixels.get(index) ?? 0;
    const color = tinted ? (tintOfColor?.get(own) ?? own) : own;
    const x = (index % width) - tile.x - minX;
    const y = (index - (index % width)) / width - tile.y - minY;
    const out = (y * boxWidth + x) * 4;
    box.data[out] = (color >> 16) & 255;
    box.data[out + 1] = (color >> 8) & 255;
    box.data[out + 2] = color & 255;
    box.data[out + 3] = 255;
  }
  context.putImageData(box, minX, minY);
}

function endStroke(): void {
  if (drawLine) {
    closeLine(drawLine);
    drawLine = null;
  }
  const step = stroke;
  stroke = null;
  brushAt = null;
  if (!step || step.size === 0) { return; }
  undoSteps.push(step);
  while (undoSteps.length > undoLimit) { undoSteps.shift(); }
  redoSteps.length = 0;
  refreshPainted();
  refreshOutline(step);
}

function stepBack(): void {
  const step = undoSteps.pop();
  if (!step) { return; }
  redoSteps.push(colorsNow(step));
  applyStep(step);
}

function stepForward(): void {
  const step = redoSteps.pop();
  if (!step) { return; }
  undoSteps.push(colorsNow(step));
  applyStep(step);
}

/** The colours those pixels hold right now: the way back from the step about to be applied. */
function colorsNow(step: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const index of step.keys()) { out.set(index, image?.packed[index] ?? 0); }
  return out;
}

function applyStep(step: ReadonlyMap<number, number>): void {
  // What the pixels held before the step is what says whether the outline moved:
  // a step that takes the selected province's colour away leaves nothing of it behind.
  const before = colorsNow(step);
  paintPixels(step);
  refreshPainted();
  refreshOutline(before);
}

/**
 * The selected province may have gained or lost pixels, and its outline is a
 * walk of the whole bitmap: it is drawn again at the end of a stroke, never
 * during one.
 */
/** `was` is the colour of each pixel before the change; the map already holds the new one. */
function refreshOutline(was: ReadonlyMap<number, number>): void {
  const currentImage = image;
  const id = selectedId;
  const color = id === null ? undefined : definitionById.get(id)?.color;
  if (id === null || !currentImage || color === undefined) { return; }
  for (const [index, before] of was) {
    if (before === color || currentImage.packed[index] === color) {
      selection = highlightOf(id);
      render();
      return;
    }
  }
}

/** Both buttons stand whether there is anything to write or not, greyed until there is. */
function refreshPainted(): void {
  const held = painted.size;
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
    vscode.postMessage({ type: 'paintPending', pixels: painted.size });
  }, 400);
}

/** A new map, or one written back: nothing is held any more. */
function resetPaint(): void {
  painted.clear();
  paintedFrom.clear();
  undoSteps.length = 0;
  redoSteps.length = 0;
  stroke = null;
  brushAt = null;
  drawLine = null;
  refreshPainted();
}

function handlePainted(result: PaintResult): void {
  if (!result.ok) { refreshPainted(); setStatus(result.reason, 'error'); return; }
  const pixels = result.pixels;
  resetPaint();
  setStatus('Wrote ' + String(pixels) + ' pixel(s) to ' + (result.path.split(/[\\/]/).pop() ?? result.path), 'ok');
}

for (const entry of toolButtons) {
  entry.button.addEventListener('click', function () { setTool(entry.tool); });
}
brushSize.addEventListener('input', function () {
  brush = Math.min(16, Math.max(1, Math.round(Number(brushSize.value) || 1)));
  brushSizeValue.textContent = String(brush);
});
paintColorInput.addEventListener('input', function () {
  const color = Number.parseInt(paintColorInput.value.slice(1), 16);
  setBrushColor(Number.isNaN(color) ? 0 : color);
});
resetPaintButton.addEventListener('click', function () {
  const currentImage = image;
  if (!currentImage || painted.size === 0) { return; }
  const before = new Map<number, number>();
  const back = new Map<number, number>();
  for (const index of painted) {
    before.set(index, currentImage.packed[index] ?? 0);
    back.set(index, paintedFrom.get(index) ?? currentImage.packed[index] ?? 0);
  }
  paintPixels(back);
  resetPaint();
  refreshOutline(before);
  setStatus('The map is back the way the file has it');
});
savePaintButton.addEventListener('click', function () {
  const currentImage = image;
  if (!currentImage || painted.size === 0) { return; }
  const pixels = new Map<number, number>();
  for (const index of painted) { pixels.set(index, currentImage.packed[index] ?? 0); }
  savePaintButton.disabled = true;
  setStatus('Writing ' + String(painted.size) + ' pixel(s) to provinces.bmp…');
  vscode.postMessage({ type: 'paint', runs: runsOf(pixels) });
});
window.addEventListener('keydown', function (event) {
  const target = event.target;
  if (!(event.ctrlKey || event.metaKey) || target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) { return; }
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    stepBack();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    stepForward();
  }
});
setTool('hand');
refreshPainted();

/** A press that is either panning the map or moving one of the selected province's points. */
interface Drag {
  readonly startX: number;
  readonly startY: number;
  readonly viewX: number;
  readonly viewY: number;
  moved: boolean;
  readonly marker: PositionKind | null;
  /** Only the left button opens a province: the others are here to move the map. */
  readonly select: boolean;
  /** The tool the right button borrowed the hand from, given back when it comes up. */
  readonly restore: Tool | null;
}

let drag: Drag | null = null;
mapArea.addEventListener('mousedown', function (event) {
  // The middle button pans under every tool: painting a border is no reason to
  // have to put the brush down to reach the rest of the map.
  if (event.button === 0 && tool !== 'hand') {
    if (event.target === canvas) { startPaint(event); }
    return;
  }
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) { return; }
  // The right button is the hand while it is held: it ends whatever was being
  // drawn, moves the map, and gives the tool back on the way up.
  let restore: Tool | null = null;
  if (event.button === 2 && tool !== 'hand') {
    if (brushAt) { endStroke(); }
    restore = tool;
    setTool('hand');
  }
  // A press on one of the selected province's points moves that point instead of the map.
  const marker = event.button === 0 && event.target === canvas ? markerAt(event.clientX, event.clientY) : null;
  drag = { startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false, marker: marker, select: event.button === 0, restore: restore };
  mapArea.classList.add(marker ? 'moving' : 'dragging');
});
window.addEventListener('mousemove', function (event) {
  if (brushAt) { continueStroke(event); return; }
  const current = drag;
  if (current?.marker && image) {
    current.moved = true;
    const place = toImageExact(event.clientX, event.clientY);
    setDraftPoint(current.marker, place.x, image.height - place.y);
    return;
  }
  if (current) {
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) { current.moved = true; }
    view.x = current.viewX + dx; view.y = current.viewY + dy;
    render();
    return;
  }
  showTooltip(event);
});
window.addEventListener('mouseup', function (event) {
  if (brushAt) { endStroke(); return; }
  if (!drag) { return; }
  const wasClick = !drag.moved && !drag.marker && drag.select;
  const restore = drag.restore;
  drag = null;
  mapArea.classList.remove('dragging');
  if (restore) { setTool(restore); }
  if (wasClick && event.target === canvas) {
    clickAt(toImage(event.clientX, event.clientY));
  }
});
// The right button is the page's own: no menu over the map.
mapArea.addEventListener('contextmenu', function (event) { event.preventDefault(); });
mapArea.addEventListener('mouseleave', function () { tooltip.hidden = true; });
mapArea.addEventListener('wheel', function (event) {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.2 : 1 / 1.2);
}, { passive: false });
new ResizeObserver(function () { render(); }).observe(mapArea);

function showTooltip(event: MouseEvent): void {
  if (!image || event.target !== canvas) { tooltip.hidden = true; mapArea.classList.remove('moving'); return; }
  const kind = tool === 'hand' ? markerAt(event.clientX, event.clientY) : null;
  mapArea.classList.toggle('moving', kind !== null);
  const place = toImage(event.clientX, event.clientY);
  const id = kind ? selectedId : provinceAt(place);
  if (id === undefined || id === null) { showColorTooltip(event, place); return; }
  const definition = definitionById.get(id);
  const kindLabel = POSITION_KIND_SPECS.find(function (spec) { return spec.kind === kind; })?.label ?? String(kind);
  tooltip.textContent = kind
    ? kindLabel + ' · ' + String(id) + ' (drag to move)'
    : String(id) + (definition?.name ? ' · ' + definition.name : '') + (seaIds.has(id) ? ' (sea)' : '');
  tooltip.hidden = false;
  const rect = mapArea.getBoundingClientRect();
  tooltip.style.left = String(event.clientX - rect.left + 12) + 'px';
  tooltip.style.top = String(event.clientY - rect.top + 12) + 'px';
}

/** A colour of definition.csv is a province; anything else is paint waiting for a province. */
function showColorTooltip(event: MouseEvent, place: Point): void {
  const currentImage = image;
  const color = currentImage === null ? undefined : currentImage.packed[place.y * currentImage.width + place.x];
  if (color === undefined) { tooltip.hidden = true; return; }
  tooltip.textContent = map?.lakeColors.includes(color) === true
    ? hexOf(color) + ' (lake)'
    : hexOf(color) + ' · click to make it a province';
  tooltip.hidden = false;
  const rect = mapArea.getBoundingClientRect();
  tooltip.style.left = String(event.clientX - rect.left + 12) + 'px';
  tooltip.style.top = String(event.clientY - rect.top + 12) + 'px';
}

/** The box the colour's pixels fit in; `maxX` below zero when the map has none of it. */
function boundsOfColor(currentImage: DecodedImage, color: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const packed = currentImage.packed;
  const width = currentImage.width;
  const box = { minX: width, minY: currentImage.height, maxX: -1, maxY: -1 };
  for (let index = 0; index < packed.length; index++) {
    if (packed[index] === color) {
      const x = index % width;
      const y = (index - x) / width;
      if (x < box.minX) { box.minX = x; } if (x > box.maxX) { box.maxX = x; }
      if (y < box.minY) { box.minY = y; } if (y > box.maxY) { box.maxY = y; }
    }
  }
  return box;
}

function highlightOf(id: number, painted?: number): Highlight | null {
  const color = painted ?? definitionById.get(id)?.color;
  const currentImage = image;
  if (color === undefined || !currentImage) { return null; }
  const packed = currentImage.packed;
  const width = currentImage.width;
  const { minX, minY, maxX, maxY } = boundsOfColor(currentImage, color);
  if (maxX < 0) { return null; }
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const mask = new Uint8ClampedArray(boxWidth * boxHeight * 4);
  for (let yy = 0; yy < boxHeight; yy++) {
    const rowStart = (minY + yy) * width + minX;
    for (let xx = 0; xx < boxWidth; xx++) {
      if (packed[rowStart + xx] === color) {
        const out = (yy * boxWidth + xx) * 4;
        mask[out] = 255; mask[out + 1] = 255; mask[out + 2] = 255; mask[out + 3] = 150;
      }
    }
  }
  const overlay = document.createElement('canvas');
  overlay.width = boxWidth; overlay.height = boxHeight;
  const overlayContext = overlay.getContext('2d');
  if (!overlayContext) { return null; }
  overlayContext.putImageData(new ImageData(mask, boxWidth, boxHeight), 0, 0);
  return { id: id, color: color, canvas: overlay, x: minX, y: minY, width: boxWidth, height: boxHeight };
}
/**
 * A click on the map: the province opens, or — for a colour painted here and
 * named by no row of definition.csv — the panel of a province that does not
 * exist yet, which the first Save creates.
 */
function clickAt(point: Point): void {
  const currentImage = image;
  const id = provinceAt(point);
  if (id !== undefined) { toggleProvince(id); return; }
  const color = currentImage?.packed[point.y * currentImage.width + point.x];
  if (color === undefined) { return; }
  if (map?.lakeColors.includes(color)) {
    setStatus(hexOf(color) + ' is a lake row of definition.csv, not a province.', 'warning');
    return;
  }
  capturePending();
  newColor = color;
  selectedId = null;
  details = null;
  draft = null;
  selection = null;
  render();
  setStatus('Reading a province for ' + hexOf(color) + '…');
  vscode.postMessage({ type: 'newProvince', color: color, popDate: popDate });
}

/** A click on the map: the province opens, or closes when it is the one already open. */
function toggleProvince(id: number): void {
  if (id !== selectedId) { selectProvince(id); return; }
  capturePending();
  clearSelection();
}

function selectProvince(id: number): void {
  capturePending();
  newColor = null;
  selection = highlightOf(id);
  selectedId = id;
  details = null;
  draft = null;
  render();
  renderSide(id);
  setStatus('Reading province ' + String(id) + '…');
  vscode.postMessage({ type: 'select', provinceId: id, popDate: popDate });
}
function clearSelection(): void {
  selection = null;
  selectedId = null;
  newColor = null;
  nameInput = null;
  seaInput = null;
  details = null;
  draft = null;
  draftBaseline = null;
  positionInputs = {};
  headerBox = null;
  headerTerrainLabel = null;
  previewTerrain = '';
  showHint();
  setStatus('');
  render();
}

function showHint(): void {
  side.replaceChildren(h('p', { class: 'hint' }, 'Click a province on the map to edit it.'));
}

function centerOn(id: number): void {
  const found = highlightOf(id);
  if (!found) { setStatus('Province ' + String(id) + ' is not on the map.', 'warning'); return; }
  const scale = Math.min(8, Math.max(view.scale, Math.min(mapArea.clientWidth / (found.width * 3), mapArea.clientHeight / (found.height * 3))));
  const centerX = found.x + found.width / 2;
  const centerY = found.y + found.height / 2;
  view = { scale: scale, x: mapArea.clientWidth / 2 - centerX * scale, y: mapArea.clientHeight / 2 - centerY * scale };
  selectProvince(id);
}
// The map report gives pixels as an image editor shows them, top-left origin,
// while the canvas draws the file's rows as the game reads them. That flips y.
function applyReveal(): void {
  const currentImage = image;
  if (!pendingReveal || !currentImage) { return; }
  const reveal = pendingReveal;
  pendingReveal = null;
  const point = { x: reveal.x, y: currentImage.height - 1 - reveal.y };
  if (point.x < 0 || point.y < 0 || point.x >= currentImage.width || point.y >= currentImage.height) {
    setStatus('Pixel ' + String(reveal.x) + ', ' + String(reveal.y) + ' is outside the map.', 'warning');
    return;
  }
  const scale = Math.max(view.scale, 8);
  view = { scale: scale, x: mapArea.clientWidth / 2 - point.x * scale, y: mapArea.clientHeight / 2 - point.y * scale };
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
required('gotoButton').addEventListener('click', goToProvince);
gotoInput.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') { goToProvince(); }
});
saveAllButton.addEventListener('click', function () {
  const count = pendingCount();
  if (count === 0) { return; }
  sendPending();
  vscode.postMessage({ type: 'saveAll' });
  saveAllButton.disabled = true;
  setStatus('Saving ' + String(count) + (count === 1 ? ' province…' : ' provinces…'));
});
required('fitButton').addEventListener('click', function () { fitView(); render(); });
required('reloadButton').addEventListener('click', function () { vscode.postMessage({ type: 'reload' }); });

/** The province's own name: its localisation entry, else its definition.csv row. */
function headingTitle(id: number, current: ProvinceDetails | null): string {
  const locText = current?.localisation.text ?? '';
  if (locText !== '') { return locText; }
  const name = definitionById.get(id)?.name ?? '';
  if (name !== '') { return name; }
  return current?.isNew === true ? 'New province' : 'Province ' + String(id);
}

/** A terrain's localised label, falling back to the identifier itself. */
function terrainLabelOf(current: ProvinceDetails | null, terrainName: string): string {
  if (terrainName === '') { return ''; }
  const entry = current?.vocabulary.terrains.find(function (item) { return item.id === terrainName; });
  return entry?.label ?? terrainName;
}

/** What the heading says on hover: where the row came from, and where edits go. */
function headingTip(id: number, currentMap: MapEditorMap, terrainLabel: string, fromHistory: boolean): string {
  const definitionName = definitionById.get(id)?.name;
  const tip = 'definition.csv: ' + (definitionName ?? '(no row)') + '\nEdits go to ' + currentMap.targetName + '\n' + currentMap.targetRoot;
  if (terrainLabel === '') { return tip; }
  return tip + '\nTerrain: ' + terrainLabel + (fromHistory ? ' (from the history file)' : ' (from terrain.bmp)');
}

/** The province heading: its name, id, terrain and the picture behind them. */
function renderHeader(id: number, current: ProvinceDetails | null, currentMap: MapEditorMap): HTMLElement {
  const terrain = current ? current.terrain : null;
  const terrainName = terrain?.name ?? '';
  const terrainLabel = terrainLabelOf(current, terrainName);
  headerTerrainLabel = h('span', { class: 'file' }, terrainLabel === '' ? currentMap.targetName : terrainLabel);
  const heading = h('h1', { title: headingTip(id, currentMap, terrainLabel, terrain?.fromHistory ?? false) },
    h('span', { class: 'name' }, headingTitle(id, current)),
    h('span', { class: 'id' }, '- ' + String(id) + ' -'),
    headerTerrainLabel);
  previewTerrain = terrainName;
  if (terrainName !== '' && terrain?.pictureDataUri) { terrainPictures.set(terrainName, terrain.pictureDataUri); }
  const box = h('div', { class: 'header' }, heading);
  headerBox = box;
  applyHeaderPicture(terrain?.pictureDataUri ?? null);
  return box;
}

/** Restart the position draft from the file, unless an unsaved edit is being held. */
function resetDraft(current: ProvinceDetails): void {
  const fresh: Draft = {};
  for (const spec of POSITION_KIND_SPECS) {
    const point = current.positions.data?.[spec.kind];
    fresh[spec.kind] = point ? { x: point.x, y: point.y } : undefined;
  }
  draft = fresh;
  draftBaseline = clonePoints(fresh);
  const held = pendingPositions.get(current.id);
  if (held) { draft = clonePoints(held); }
}

function renderSide(id: number): void {
  const currentMap = map;
  if (!currentMap) { return; }
  side.replaceChildren();
  const current = details;
  side.append(renderHeader(id, current, currentMap));
  if (!current) { side.append(h('p', { class: 'hint' }, 'Loading…')); return; }
  // The disk is the truth after every read: the draft restarts from it.
  resetDraft(current);
  const history = historySections(current);
  const panes: Record<TabName, HTMLElement> = {
    definition: h('div', null, localisationSection(current), history.definition),
    positions: h('div', null, positionsSection(current)),
    buildings: history.buildings,
    dates: history.dates,
    pops: h('div', null, popsSection(current)),
  };
  // A sea province has no history file and no pops: the game gives it a name
  // and a unit point, so only those two are editable and the rest is locked.
  const closed: Partial<Record<TabName, boolean>> = {};
  if (current.isSea) {
    lock(history.definition);
    for (const name of ['buildings', 'dates', 'pops'] as const) { lock(panes[name]); closed[name] = true; }
  }
  render();
  if (closed[activeTab]) { activeTab = 'definition'; }
  const tabs = h('div', { class: 'tabs' }, TAB_NAMES.map(function (name) {
    return h('button', { class: 'tab' + (activeTab === name ? ' active' : ''), 'data-tab': name, disabled: closed[name] ?? undefined, title: closed[name] ? 'A sea province has no ' + TAB_LABELS[name].toLowerCase() : undefined, onclick: function () {
      activeTab = name;
      for (const key of TAB_NAMES) { panes[key].hidden = key !== name; }
      for (const button of tabs.querySelectorAll('button')) { button.classList.toggle('active', button.getAttribute('data-tab') === name); }
    } }, TAB_LABELS[name]);
  }));
  for (const key of TAB_NAMES) { panes[key].hidden = key !== activeTab; }
  side.append(tabs);
  for (const name of TAB_NAMES) { side.append(panes[name]); }
}

function applyHeaderPicture(uri: string | null | undefined): void {
  if (!headerBox) { return; }
  headerBox.classList.toggle('pictured', Boolean(uri));
  headerBox.style.backgroundImage = uri ? 'linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.55)), url(' + uri + ')' : '';
}
/** Show the picture of the terrain the form now holds (or the bitmap's terrain when cleared), fetching it once per map. */
function showTerrain(name: string): void {
  const effective = name === '' ? (details?.terrain.dominant ?? '') : name;
  previewTerrain = effective;
  if (headerTerrainLabel) {
    const entry = details?.vocabulary.terrains.find(function (item) { return item.id === effective; });
    const fallback = effective === '' ? (map?.targetName ?? '') : effective;
    headerTerrainLabel.textContent = entry ? entry.label : fallback;
  }
  if (!effective) { applyHeaderPicture(null); return; }
  if (terrainPictures.has(effective)) { applyHeaderPicture(terrainPictures.get(effective)); return; }
  vscode.postMessage({ type: 'terrainPicture', terrain: effective });
}

/** Title, file path (grey, trimmed from the left) and an Open File button on one line. */
interface SectionFile {
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
}

/** What the header says instead of a path, and whether that is worth a warning colour. */
interface MissingNote {
  readonly text: string;
  readonly warning: boolean;
}

function sectionHeader(title: string, section: SectionFile, missing: MissingNote): HTMLElement {
  const file = section.file;
  const open = file ? h('button', { class: 'outline', onclick: function () { vscode.postMessage({ type: 'openFile', absolutePath: file.absolutePath, line: file.line }); } }, 'Open File') : null;
  return h('h2', null, h('span', { class: 'title' }, title), pathOrNote(section, missing), open);
}

/**
 * A path is trimmed from the left, which takes `direction: rtl` and a mark to
 * keep its own order; a sentence takes neither, or its full stop would move to
 * the front of it.
 */
function pathOrNote(section: SectionFile, missing: MissingNote): HTMLElement {
  const file = section.file;
  if (!file) {
    return h('span', { class: 'file' + (missing.warning ? ' warning' : ''), title: missing.text }, missing.text);
  }
  const text = section.inTarget ? file.absolutePath.replace(map?.targetRoot ?? '', '').replace(/^[\\/]/, '') : file.absolutePath;
  return h('span', { class: 'file path' + (section.inTarget ? '' : ' warning'), title: text }, '\u200e' + text);
}
function layerNote(section: SectionFile): HTMLElement | null {
  if (!section.file || section.inTarget) { return null; }
  return h('div', { class: 'file warning' }, 'Read from a layer below ' + (map?.targetName ?? 'the target') + '; saving writes a copy into it.');
}

interface SaveBar {
  readonly node: HTMLElement;
  readonly status: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
}

function saveBar(onSave: () => void): SaveBar {
  const status = h('span', { class: 'status' });
  const button = h('button', { onclick: function () {
    if (saving) { return; }
    saving = true; button.disabled = true; status.textContent = 'Saving…'; status.className = 'status';
    onSave();
  } }, 'Save');
  // Every tab edits one province, so dropping the changes means reading it
  // back from what the server last sent: the file, unchanged.
  const cancel = h('button', { class: 'secondary', title: 'Put every field back as the file has it', onclick: function () {
    if (saving || !details) { return; }
    pendingPositions.delete(details.id);
    refreshPending();
    renderSide(details.id);
    setStatus('Changes dropped; the form is back to the file.');
  } }, 'Cancel');
  return { node: h('div', { class: 'actions' }, button, cancel, status), status: status, button: button, cancel: cancel };
}
/** One section's edit, addressed to the province the panel is about. */
function postSave(payload: Record<string, unknown>): void {
  if (!details) { return; }
  const create = details.isNew && newColor !== null
    ? { color: newColor, isSea: seaInput?.checked === true, name: nameInput?.value ?? '' }
    : undefined;
  vscode.postMessage({
    ...payload,
    ...(create ? { create: create } : {}),
    type: 'save',
    provinceId: details.id,
    popDate: popDate,
  });
}

function localisationSection(current: ProvinceDetails): HTMLElement {
  const loc = current.localisation;
  const input = textInput(loc.text);
  // The name a save writes into definition.csv, and whether the id joins sea_starts.
  nameInput = input;
  const sea = h('input', { type: 'checkbox' });
  seaInput = current.isNew ? sea : null;
  const seaRow = current.isNew
    ? h('label', { class: 'check' }, sea, 'Sea province (the id joins sea_starts in default.map)')
    : null;
  const rename = h('input', { type: 'checkbox' });
  // A base-game province keeps the name vanilla gave its file, and other tools match
  // on it, so renaming there is opt-in. Above that id the province is the mod's own.
  const renamable = current.history.file !== undefined && !current.isSea;
  rename.checked = current.id > VANILLA_MAX_PROVINCES && renamable;
  const renameRow = h('label', { class: 'check' }, rename, 'Rename the history file to match');
  if (!renamable) { lock(renameRow); }
  const bar = saveBar(function () { postSave({ section: 'localisation', text: input.value, renameHistoryFile: rename.checked }); });
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter') { bar.button.click(); } });
  return h('div', { class: 'section' },
    sectionHeader('Localisation', loc, { text: loc.key + ' is not defined; saving adds it to the mod\'s province names file.', warning: true }),
    layerNote(loc),
    h('div', { class: 'inline' }, h('label', null, loc.key), input, bar.button, bar.cancel, bar.status),
    seaRow,
    renameRow);
}

// History — one form behind four tabs. Cores, Buildings and the dated blocks
// live in the same history file, so every Save posts the whole form and the
// tabs never drift.
interface HistoryPanes {
  readonly definition: HTMLElement;
  readonly buildings: HTMLElement;
  readonly dates: HTMLElement;
}

function historySections(current: ProvinceDetails): HistoryPanes {
  const history = current.history;
  const form = historyForm(current, history.data ?? emptyHistory(), true);
  // Where a new history file goes. The row stands whether it is needed or not,
  // greyed once the file exists, so the panel keeps its height from one province
  // to the next; a sea province has the whole pane locked over it.
  const folders = map && map.historyFolders.length > 0 ? map.historyFolders : [''];
  const folder = h('select', null, folders.map(function (name) { return option(name, name || '(history/provinces)'); }));
  const folderRow = h('div', { class: 'grid lone' }, h('label', null, 'Folder'), folder);
  if (history.data) { lock(folderRow); }
  function pane(title: string, body: Child): HTMLElement {
    const bar = saveBar(function () { postSave({ section: 'history', data: form.read(), createInFolder: folder.value }); });
    const missing: MissingNote = current.isSea
      ? { text: 'Sea tiles don\'t need history files.', warning: false }
      : { text: 'No history file; saving creates one', warning: true };
    return h('div', { class: 'section' }, sectionHeader(title, history, missing), layerNote(history), body, bar.node);
  }
  return {
    definition: pane('History', h('div', null, folderRow, form.node)),
    buildings: pane('Buildings', form.buildings),
    dates: pane('Extra Dates', form.dated),
  };
}
function emptyHistory(): ProvinceHistory {
  return { owner: undefined, controller: undefined, cores: [], removeCores: [], tradeGoods: undefined, lifeRating: undefined, terrain: undefined, colonial: undefined, colony: undefined, isSlave: undefined, buildings: [], partyLoyalty: [], stateBuildings: [], setFlags: [], clrFlags: [], dated: [] };
}
// topLevel is the province's own history: it allows dated blocks and hands the
// Cores, Buildings and dated-block groups back separately, for their own tabs.
// A dated block keeps every group inside its one node.
/** The single-value fields of a history block, in the order the form shows them. */
type HistoryField = 'owner' | 'controller' | 'tradeGoods' | 'lifeRating' | 'terrain' | 'colonial' | 'colony';

interface HistoryFieldSpec {
  readonly name: HistoryField;
  readonly label: string;
  readonly entries: readonly NamedIdentifier[] | null;
  readonly slider?: SliderRange;
}

interface HistoryFormHandle {
  readonly node: HTMLElement;
  readonly buildings: HTMLElement;
  readonly dated: HTMLElement | null;
  readonly read: () => ProvinceHistory;
}

const LOYALTY_RANGE: SliderRange = { min: 1, max: 100 };
const COLONIAL_RANGE: SliderRange = {
  min: 0, max: 2, ticks: true, labels: ['No', 'Colony', 'Colonial State'],
};

function historyField(spec: HistoryFieldSpec, value: string | undefined): FieldElement {
  if (spec.slider) { return sliderInput(value, spec.slider); }
  if (spec.entries) { return selectInput(value, spec.entries, '(none)'); }
  return textInput(value, 'number');
}

/**
 * The lowest level is the game's default, so a slider left there writes nothing
 * — unless the block already spelled it out: a dated `colonial = 0` is how a
 * province stops being a colony, and dropping it would change what the file says.
 */
function levelOf(input: FieldElement, written: boolean): string | undefined {
  const value = input.value.trim();
  if (value === '0' && !written) { return undefined; }
  return value === '' ? undefined : value;
}

/** The loyalty sliders that stand for a line of the file; the example row is not one. */
function loyaltyFields(rows: HTMLElement): FieldElement[] {
  return [...rows.querySelectorAll('.row:not(.ghost) .loyalty')]
    .filter(function (node): node is FieldElement { return node instanceof HTMLElement && 'value' in node; });
}

/**
 * Loyalty is a share of the province's parties, so the rows together stop at
 * 100: each slider reaches only what the others leave it. A file already over
 * the cap is never rewritten — a slider is never capped below the value it
 * came with — and the running total says so until the modder brings it down.
 */
function capLoyalties(table: RowsHandle): void {
  const total = h('span', { class: 'total' });
  table.heading.append(total);
  function apply(): void {
    const fields = loyaltyFields(table.rows);
    const sum = fields.reduce(function (acc, field) { return acc + (Number(field.value) || 0); }, 0);
    for (const field of fields) {
      const own = Number(field.value) || 0;
      const input = fieldInput(field);
      if (input instanceof HTMLInputElement) {
        input.max = String(Math.max(own, LOYALTY_RANGE.max - (sum - own), LOYALTY_RANGE.min));
      }
    }
    total.textContent = 'Total loyalty: ' + String(sum) + ' / ' + String(LOYALTY_RANGE.max);
    total.classList.toggle('warning', sum > LOYALTY_RANGE.max);
  }
  table.node.addEventListener('input', apply);
  // Adding a row is a click, not an input, and its slider needs a cap as well.
  table.node.addEventListener('click', apply);
  apply();
}

function historyForm(current: ProvinceDetails, data: ProvinceHistory, topLevel: boolean): HistoryFormHandle {
  const vocabulary = current.vocabulary;
  const fields: readonly HistoryFieldSpec[] = [
    { name: 'owner', label: 'Owner', entries: vocabulary.countries },
    { name: 'controller', label: 'Controller', entries: vocabulary.countries },
    { name: 'tradeGoods', label: 'Trade goods', entries: vocabulary.goods },
    { name: 'lifeRating', label: 'Life rating', entries: null },
    { name: 'terrain', label: 'Terrain', entries: vocabulary.terrains },
    { name: 'colonial', label: 'Colonial', entries: null, slider: COLONIAL_RANGE },
    { name: 'colony', label: 'Colony', entries: null },
  ];
  const inputs = {} as Record<HistoryField, FieldElement>;
  const grid = h('div', { class: 'grid' });
  for (const spec of fields) {
    const field = historyField(spec, data[spec.name]);
    inputs[spec.name] = field;
    grid.append(h('label', null, spec.label), field);
  }
  // Ticked writes is_slave = yes; unticked drops the line (the game's default is no).
  if (topLevel) { inputs.terrain.addEventListener('input', function () { showTerrain(inputs.terrain.value); }); }
  const isSlave = h('input', { type: 'checkbox' });
  isSlave.checked = (data.isSlave ?? '').toLowerCase() === 'yes';
  grid.append(h('label', null, 'Slave state'), h('div', null, isSlave));
  const cores = listEditor('Cores', data.cores, vocabulary.countries, 'country');
  // Only a dated block edits remove_core: at the start date a core is simply
  // listed or not. A remove_core line already in the file rides along.
  const removeCores = topLevel ? null : listEditor('Remove cores', data.removeCores, vocabulary.countries, 'country');
  const buildings = rowsEditor('Buildings', data.buildings, [{ key: 'key', placeholder: 'building', entries: vocabulary.buildings }, { key: 'value', placeholder: 'level', type: 'number', extraClass: 'narrow' }], function () { return { key: '', value: '1' }; });
  const partyLoyalty = rowsEditor('Party loyalty', data.partyLoyalty, [{ key: 'ideology', placeholder: 'ideology', entries: vocabulary.ideologies, extraClass: 'half' }, { key: 'loyaltyValue', placeholder: 'loyalty', slider: LOYALTY_RANGE, extraClass: 'loyalty' }], function () { return { ideology: '', loyaltyValue: String(LOYALTY_RANGE.min) }; });
  capLoyalties(partyLoyalty);
  const stateBuildings = rowsEditor('State buildings', data.stateBuildings, [{ key: 'building', placeholder: 'factory', entries: vocabulary.factories }, { key: 'level', placeholder: 'level', type: 'number', extraClass: 'narrow' }, { key: 'upgrade', placeholder: 'upgrade', check: true, extraClass: 'tick' }], function () { return { building: '', level: '1', upgrade: 'yes' }; });
  const dated = topLevel ? datedEditor(current, data.dated) : null;
  const coresGroup = h('div', { class: 'form' }, cores.node, removeCores ? removeCores.node : null);
  const buildingsGroup = h('div', { class: 'form' }, buildings.node, stateBuildings.node);
  // The province's own cores sit in the Definition tab, under Party loyalty;
  // a dated block keeps every group inside its one node.
  const node = topLevel
    ? h('div', { class: 'form' }, grid, partyLoyalty.node, cores.node)
    : h('div', { class: 'form' }, grid, coresGroup, buildingsGroup, partyLoyalty.node);
  return {
    node: node,
    buildings: buildingsGroup,
    dated: dated ? dated.node : null,
    read: function (): ProvinceHistory {
      return {
        owner: valueOf(inputs.owner), controller: valueOf(inputs.controller),
        cores: cores.read(), removeCores: removeCores ? removeCores.read() : data.removeCores,
        tradeGoods: valueOf(inputs.tradeGoods), lifeRating: valueOf(inputs.lifeRating), terrain: valueOf(inputs.terrain),
        colonial: levelOf(inputs.colonial, data.colonial !== undefined), colony: valueOf(inputs.colony), isSlave: isSlave.checked ? 'yes' : undefined,
        buildings: buildings.read().map(function (row) { return { key: row['key'] ?? '', value: row['value'] ?? '' }; }),
        partyLoyalty: partyLoyalty.read().map(function (row) { return { ideology: row['ideology'] ?? '', loyaltyValue: row['loyaltyValue'] ?? '' }; }),
        stateBuildings: stateBuildings.read().map(function (row) { return { building: row['building'] ?? '', level: row['level'] ?? '', upgrade: row['upgrade'] ?? '' }; }),
        // Province flags are not edited here; the ones in the file are kept as they are.
        setFlags: data.setFlags, clrFlags: data.clrFlags, dated: dated ? dated.read() : [],
      };
    },
  };
}
// An empty list still shows one row, dimmed and with the field named in its
// placeholder; the first keystroke wakes it, and it is dropped on save.
interface ListHandle {
  readonly node: HTMLElement;
  readonly read: () => string[];
}

/** Set the placeholder on whichever element actually takes the caret. */
function setPlaceholder(field: HTMLElement, text: string): void {
  const target = fieldInput(field);
  if (target instanceof HTMLInputElement) { target.placeholder = text; }
}

function listEditor(
  title: string,
  values: readonly string[],
  entries: readonly NamedIdentifier[] | null,
  placeholder?: string,
): ListHandle {
  const rows = h('div', { class: 'rows' });
  function addRow(value: string, ghost?: boolean): FieldElement {
    const input = entries ? selectInput(value, entries, '(pick)') : textInput(value);
    const row = h('div', { class: 'row' + (ghost ? ' ghost' : '') }, input, h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); keepOne(); } }, '×'));
    if (ghost) {
      setPlaceholder(input, placeholder ?? '');
      row.addEventListener('input', function () { row.classList.remove('ghost'); });
    }
    rows.append(row);
    return input;
  }
  function keepOne(): void { if (rows.children.length === 0) { addRow('', true); } }
  for (const value of values) { addRow(value); }
  keepOne();
  const node = h('div', { class: 'group' }, h('h3', null, title, plusButton('Add to ' + title, function () { dropGhost(rows); fieldInput(addRow(''))?.focus(); })), rows);
  return {
    node: node,
    read: function (): string[] {
      return [...rows.querySelectorAll('.field')]
        .map(function (field) { return field instanceof HTMLElement && 'value' in field ? String(field.value).trim() : ''; })
        .filter(function (value) { return value !== ''; });
    },
  };
}
/** A table row as the form holds it: every value is script text. */
type RowItem = Record<string, string | undefined>;

interface SliderRange {
  readonly min: number;
  readonly max: number;
  /** Draw a dot per step: a short range is picked, not dragged. */
  readonly ticks?: boolean;
  /** What each step is called, from `min` up; the number itself when absent. */
  readonly labels?: readonly string[];
}

interface ColumnSpec {
  readonly key: string;
  readonly placeholder: string;
  readonly type?: string;
  readonly extraClass?: string;
  readonly entries?: readonly NamedIdentifier[];
  readonly slider?: SliderRange;
  /** A yes/no column: ticked writes `yes`, unticked writes no line at all. */
  readonly check?: boolean;
}

interface RowsHandle {
  readonly node: HTMLElement;
  readonly heading: HTMLElement;
  readonly rows: HTMLElement;
  readonly read: () => RowItem[];
}

/** A field the form left empty is not written at all. */
function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** The model's row shapes carry no index signature; every field of them is script text. */
function toRowItem(item: object): RowItem {
  const out: RowItem = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string') { out[key] = value; }
  }
  return out;
}

function columnField(column: ColumnSpec, value: string | undefined): FieldElement {
  if (column.check) { return checkInput(value); }
  if (column.slider) { return sliderInput(value, column.slider, column.extraClass); }
  if (column.entries) { return selectInput(value, column.entries, '(pick)'); }
  return textInput(value, column.type, column.extraClass);
}

function rowsEditor(
  title: string,
  items: readonly object[],
  columns: readonly ColumnSpec[],
  blank: () => RowItem,
  options: { readonly duplicate?: boolean } = {},
): RowsHandle {
  const rows = h('div', { class: 'rows' });
  // Fields the table does not show (a pop's militancy, rebel_type) ride along
  // unchanged; they belong to the row, not to the DOM, so they live beside it.
  const hiddenFields = new WeakMap<HTMLElement, RowItem>();
  function addRow(item: RowItem, ghost?: boolean): HTMLElement {
    const inputs = columns.map(function (column) {
      const input = columnField(column, item[column.key]);
      if (column.extraClass) { input.classList.add(column.extraClass); }
      return input;
    });
    const row = h('div', { class: 'row' + (ghost ? ' ghost' : '') }, inputs,
      options.duplicate ? h('button', { class: 'secondary icon', title: 'Duplicate', onclick: function () { addRow(readRow(row)); } }, '⧉') : null,
      h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); keepOne(); rows.dispatchEvent(new Event('input', { bubbles: true })); } }, '×'));
    if (ghost) {
      // The column heads name the fields; an empty table repeats them in the row.
      inputs.forEach(function (input, index) { setPlaceholder(input, columns[index]?.placeholder ?? ''); });
      row.addEventListener('input', function () { row.classList.remove('ghost'); });
    }
    const hidden: RowItem = {};
    for (const [key, value] of Object.entries(item)) {
      if (!columns.some(function (column) { return column.key === key; })) { hidden[key] = value; }
    }
    hiddenFields.set(row, hidden);
    rows.append(row);
    return row;
  }
  function readRow(row: HTMLElement): RowItem {
    const inputs = [...row.querySelectorAll('.field')];
    const out: RowItem = { ...hiddenFields.get(row) };
    columns.forEach(function (column, index) {
      const field = inputs[index];
      out[column.key] = field instanceof HTMLElement && 'value' in field ? String(field.value).trim() : '';
    });
    return out;
  }
  function keepOne(): void { if (rows.children.length === 0) { addRow({}, true); } }
  for (const item of items) { addRow(toRowItem(item)); }
  keepOne();
  const head = h('div', { class: 'head' }, columns.map(function (column) { return h('span', { class: column.extraClass ?? undefined }, column.placeholder); }));
  const heading = h('h3', null, title, plusButton('Add to ' + title, function () { dropGhost(rows); addRow(blank()).querySelector('input')?.focus(); }));
  const node = h('div', { class: 'group' }, heading, head, rows);
  // A tick box is never missing: unticked is an answer. Every other column has
  // to be filled in for the row to be a line of the file — a half-written row is
  // dropped by a Save, the way an empty one is.
  const required = columns.filter(function (column) { return !column.check; });
  return {
    node: node, heading: heading, rows: rows,
    read: function (): RowItem[] {
      return [...rows.children]
        .filter(function (row): row is HTMLElement { return row instanceof HTMLElement; })
        .map(readRow)
        .filter(function (item) { return required.every(function (column) { return item[column.key] !== ''; }); });
    },
  };
}
interface DatedHandle {
  readonly node: HTMLElement;
  readonly read: () => DatedHistory[];
}

function datedEditor(current: ProvinceDetails, blocks: readonly DatedHistory[]): DatedHandle {
  const rows = h('div', { class: 'rows' });
  const forms: { date: HTMLInputElement; form: HistoryFormHandle }[] = [];
  function addBlock(block: DatedHistory): HTMLDetailsElement {
    const date = textInput(block.date);
    const form = historyForm(current, block.entries, false);
    const entry = { date: date, form: form };
    forms.push(entry);
    const node = h('details', { class: 'dated' },
      h('summary', null, 'Dated block ', date, h('span', { class: 'spacer' }), h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function (event) { event.preventDefault(); forms.splice(forms.indexOf(entry), 1); node.remove(); } }, '×')),
      form.node);
    date.addEventListener('click', function (event) { event.preventDefault(); });
    rows.append(node);
    return node;
  }
  for (const block of blocks) { addBlock(block); }
  const node = h('div', { class: 'group' }, h('h3', null, 'Dated blocks', plusButton('Add a dated block', function () { addBlock({ date: '1861.1.1', entries: emptyHistory() }).open = true; })), rows);
  return {
    node: node,
    read: function (): DatedHistory[] {
      return forms.map(function (entry) { return { date: entry.date.value.trim(), entries: entry.form.read() }; }).filter(function (block) { return block.date !== ''; });
    },
  };
}

// Positions: one row per kind, the swatch doubling as the map legend. Typing
// moves the point on the map at once; dragging the point fills the row.
function positionsSection(current: ProvinceDetails): HTMLElement {
  const section = current.positions;
  positionInputs = {};
  const rows = h('div', { class: 'rows' });
  for (const spec of POSITION_KIND_SPECS) {
    const point = draft?.[spec.kind];
    const x = textInput(point ? point.x : '', 'number');
    const y = textInput(point ? point.y : '', 'number');
    x.step = '0.01'; y.step = '0.01'; x.placeholder = 'x'; y.placeholder = 'y';
    function changed(): void {
      const xText = x.value.trim();
      const yText = y.value.trim();
      if (draft) { draft[spec.kind] = xText !== '' && yText !== '' ? { x: xText, y: yText } : undefined; }
      capturePending();
      render();
    }
    x.addEventListener('input', changed);
    y.addEventListener('input', changed);
    const swatch = h('span', { class: 'swatch', title: spec.label });
    swatch.style.background = spec.color;
    const clear = h('button', { class: 'secondary icon remove', title: 'Clear ' + spec.label, onclick: function () { x.value = ''; y.value = ''; changed(); } }, '×');
    const center = h('button', { class: 'glyph center', title: 'Put ' + spec.label + ' in the middle of the province', 'aria-label': 'Center ' + spec.label, onclick: function () {
      const middle = selectionCenter();
      if (!middle) { setStatus('The province has no pixels to centre on.', 'warning'); return; }
      setDraftPoint(spec.kind, middle.x, middle.y);
    } });
    positionInputs[spec.kind] = { x: x, y: y };
    const row = h('div', { class: 'row pos-row' }, swatch, h('span', { class: 'pos-label' }, spec.label), center, x, y, clear);
    // A sea province only ever carries the unit point; the rest is land's.
    if (current.isSea && spec.kind !== 'unit') { lock(row); }
    rows.append(row);
  }
  const bar = saveBar(function () {
    const held = draft;
    const data: Draft = {};
    for (const spec of POSITION_KIND_SPECS) { data[spec.kind] = held?.[spec.kind]; }
    postSave({ section: 'positions', data: data });
  });
  return h('div', { class: 'section' },
    sectionHeader('Positions', section, { text: 'No entry in map/positions.txt; saving adds one', warning: true }),
    layerNote(section),
    h('p', { class: 'hint' }, current.isSea
      ? 'A sea province carries one point: where the game draws fleets in it. y counts from the bottom of the map. Zoom in until the point shows; drag it to move it, or type here.'
      : 'Where the game draws the province\'s unit, city, factory and buildings. y counts from the bottom of the map. Zoom in until the points show; drag one to move it, or type here.'),
    h('div', { class: 'head pos-head' }, h('span', null, 'x'), h('span', null, 'y')),
    rows,
    bar.node);
}

function popsSection(current: ProvinceDetails): HTMLElement {
  const pops = current.pops;
  const missing: MissingNote = current.isSea
    ? { text: 'Sea tiles don\'t need pops.', warning: false }
    : { text: 'No pops in history/pops/' + popDate + '; pick a file below', warning: true };
  const parts: Child[] = [sectionHeader('Pops', pops, missing), layerNote(pops)];
  const currentMap = map;
  if (currentMap && currentMap.popDates.length > 1) {
    const dateSelect = h('select', { onchange: function () { popDate = dateSelect.value; selectProvince(current.id); } }, currentMap.popDates.map(function (date) { return option(date, date); }));
    dateSelect.value = popDate;
    parts.push(h('div', { class: 'grid lone' }, h('label', null, 'Start date'), dateSelect));
  }
  const names = currentMap?.popFiles[popDate] ?? [];
  const fileField = selectInput('', names.map(function (name) { return { id: name, label: name }; }), 'Existing or new file name', true);
  const fileRow = h('div', { class: 'grid lone' }, h('label', null, 'File'), fileField);
  // Where a block would be created. The row stands whether it is needed or not,
  // greyed once the province has a block, so the panel keeps its height from one
  // province to the next.
  if (pops.pops) { lock(fileRow); }
  parts.push(fileRow);
  const vocabulary = current.vocabulary;
  const table = rowsEditor('Pops', pops.pops ?? [], [
    { key: 'type', placeholder: 'type', entries: vocabulary.popTypes },
    { key: 'culture', placeholder: 'culture', entries: vocabulary.cultures },
    { key: 'religion', placeholder: 'religion', entries: vocabulary.religions },
    { key: 'size', placeholder: 'size', type: 'number', extraClass: 'narrow' },
  ], function () { return { type: 'farmers', culture: '', religion: '', size: '1000' }; }, { duplicate: true });
  const total = h('div', { class: 'total' });
  function updateTotal(): void {
    const sum = table.read().reduce(function (acc, pop) { return acc + (Number(pop['size']) || 0); }, 0);
    total.textContent = 'Total size: ' + sum.toLocaleString();
  }
  table.rows.addEventListener('input', updateTotal);
  updateTotal();
  const bar = saveBar(function () {
    const rows = table.read().map(function (pop): PopEntry {
      return {
        type: pop['type'] ?? '', culture: pop['culture'] ?? '', religion: pop['religion'] ?? '',
        size: pop['size'] ?? '', militancy: blankToUndefined(pop['militancy']), rebelType: blankToUndefined(pop['rebelType']),
      };
    });
    postSave({ section: 'pops', pops: rows, createInFile: fileField.value });
  });
  parts.push(table.node, total, bar.node);
  return h('div', { class: 'section' }, parts);
}

window.addEventListener('message', function (event: MessageEvent<HostMessage>) {
  try { handleMessage(event.data); } catch (error) { showLoading('Page error: ' + messageOf(error)); }
});

function loadFreshMap(message: Extract<HostMessage, { type: 'map' }>): void {
  const fresh = message.map;
  map = fresh;
  idByColor.clear();
  definitionById.clear();
  seaIds = new Set(fresh.seaProvinces);
  for (const definition of fresh.definitions) {
    idByColor.set(definition.color, definition.id);
    definitionById.set(definition.id, definition);
  }
  popDate = fresh.popDates[0] ?? '';
  terrainPictures.clear();
  targetBox.textContent = fresh.targetName;
  selection = null; selectedId = null; details = null; draft = null; markers = [];
  pendingPositions.clear();
  draftBaseline = null; refreshPending();
  countryColors = null; tintedTiles = null; tintOfColor = null;
  resetPaint(); setTool('hand');
  riversUri = message.riversUri ?? null; riverTiles = null; riversLoading = false;
  showHint();
  loadMap(message.bmpUri);
}

function handleMessage(message: HostMessage): void {
  if (message.type === 'map') {
    loadFreshMap(message);
  } else if (message.type === 'revealPixel') {
    pendingReveal = { file: message.file, x: message.x, y: message.y };
    applyReveal();
  } else {
    handleUpdate(message);
  }
}

/** Everything that changes an already-loaded map: a province, the layers, a save. */
/**
 * Two clicks in a row race: a late answer would redraw the province we left,
 * terrain picture and all, over the one we are now on. A province that is still
 * only paint has no id to match on, so its colour stands for it.
 */
function handleDetails(fresh: ProvinceDetails): void {
  const forPaint = newColor !== null && fresh.isNew && selectedId === null;
  if (selectedId !== fresh.id && !forPaint) { return; }
  if (forPaint) {
    selectedId = fresh.id;
    selection = highlightOf(fresh.id, newColor ?? undefined);
  }
  details = fresh;
  replaceMarkers(fresh.id, fresh.positions);
  renderSide(fresh.id);
  setStatus('Province ' + String(fresh.id));
}

function handleUpdate(message: Exclude<HostMessage, { type: 'map' | 'revealPixel' }>): void {
  if (message.type === 'details') {
    handleDetails(message.details);
  } else if (message.type === 'positions') {
    markers = [...message.markers];
    render();
  } else if (message.type === 'settings') {
    applyTint(message.countryColorsTint);
    applyUndoLimit(message.paintUndoSteps);
  } else if (message.type === 'countryColors') {
    countryColors = { kind: 'ready', owners: message.owners, colors: message.colors };
    tintedTiles = null;
    if (showCountryColors) { buildTintedTiles(); }
  } else if (message.type === 'saved') {
    handleSaved(message.result);
  } else if (message.type === 'painted') {
    handlePainted(message.result);
  } else if (message.type === 'savedAll') {
    handleSavedAll(message.written, message.failed.length);
  } else if (message.type === 'error') {
    saving = false;
    setStatus(message.message, 'error');
  } else {
    terrainPictures.set(message.terrain, message.pictureDataUri ?? null);
    if (message.terrain === previewTerrain) { applyHeaderPicture(message.pictureDataUri ?? null); }
  }
}

/** How many strokes can be taken back; the ones over the new limit are dropped. */
function applyUndoLimit(steps: number): void {
  undoLimit = Math.max(1, Math.round(steps));
  while (undoSteps.length > undoLimit) { undoSteps.shift(); }
}

/** A new Country Colors tint: the tinted bitmap has to be built again. */
function applyTint(percent: number): void {
  const weight = Math.min(100, Math.max(0, percent)) / 100;
  if (!isFinite(weight) || weight === TINT_WEIGHT) { return; }
  TINT_WEIGHT = weight;
  tintedTiles = null;
  if (showCountryColors) { buildTintedTiles(); }
  render();
}

/** Save all: what the page was holding is now on disk, so the map reads it from there. */
function handleSavedAll(written: readonly number[], failed: number): void {
  saveAllButton.disabled = false;
  for (const id of written) {
    const held = pendingPositions.get(id);
    if (held) { replaceMarkers(id, { file: undefined, inTarget: true, data: asPositions(held) }); }
    pendingPositions.delete(id);
    if (details?.id === id) { draftBaseline = clonePoints(draft); }
  }
  refreshPending();
  setStatus(failed > 0
    ? String(failed) + ' province(s) could not be saved; they are still held.'
    : 'Saved ' + String(written.length) + ' province(s)', failed > 0 ? 'error' : 'ok');
  render();
}

/** A draft as a full positions record: every kind present, unset ones undefined. */
function asPositions(points: Draft): ProvincePositions {
  const out = {} as Record<PositionKind, PositionPoint | undefined>;
  for (const spec of POSITION_KIND_SPECS) { out[spec.kind] = points[spec.kind]; }
  return out;
}

function handleSaved(result: SaveResult): void {
  saving = false;
  if (!result.ok) {
    for (const button of side.querySelectorAll('button')) { button.disabled = false; }
    setStatus(result.reason, 'error');
    return;
  }
  const saved = result.details;
  if (newColor !== null && !saved.isNew) {
    definitionById.set(saved.id, { id: saved.id, color: newColor, name: saved.definitionName });
    idByColor.set(newColor, saved.id);
    if (saved.isSea) { seaIds.add(saved.id); }
    newColor = null;
  }
  pendingPositions.delete(saved.id);
  refreshPending();
  replaceMarkers(saved.id, saved.positions);
  if (selectedId !== saved.id) { setStatus('Saved province ' + String(saved.id), 'ok'); render(); return; }
  details = saved;
  renderSide(saved.id);
  setStatus(result.written.length > 0
    ? 'Saved ' + result.written.map(function (file) { return file.split(/[\\/]/).pop() ?? file; }).join(', ')
    : 'Nothing to save', 'ok');
}
vscode.postMessage({ type: 'ready' });
