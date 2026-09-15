import type { FileRef, MapEditorMap, PageSaveParams, ProvinceDetails, SaveResult, SaveSection } from '../../model/mapEditor.js';
import { render } from '../canvas.js';
import { h, setStatus, side } from '../dom.js';
import { lock } from '../fields.js';
import { post } from '../host.js';
import { clonePoints, refreshPending } from '../positions.js';
import { definitionById, pendingPositions, POSITION_KIND_SPECS, state, vocabulary, type Draft } from '../state.js';
import { forms } from './forms.js';
import { historySections, localisationSection } from './history.js';
import { popsSection } from './popsTab.js';
import { positionsSection } from './positionsTab.js';

/** The side panel: the province heading, the tabs, and the Save that every tab ends in. */

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

let activeTab: TabName = 'definition';
let headerBox: HTMLElement | null = null;
let headerTerrainLabel: HTMLElement | null = null;
/** The terrain the header currently shows. */
let previewTerrain = '';
/** Terrain name -> data URI, or null for "asked, none"; per map. */
const terrainPictures = new Map<string, string | null>();
let saving = false;
/** What the save in flight writes: the only parts its answer may read back from disk. */
let savingPartsHeld: ReadonlySet<string> = new Set();
/** The Save bars of the panel as it stands: a failed save frees these, and nothing else. */
let activeSaveBars: SaveBar[] = [];

export function savingParts(): ReadonlySet<string> {
  return savingPartsHeld;
}

/** A new map: nothing is remembered of the last one's pictures. */
export function resetPanel(): void {
  terrainPictures.clear();
  resetHeader();
}

export function resetHeader(): void {
  headerBox = null;
  headerTerrainLabel = null;
  previewTerrain = '';
}

/** The side panel holding one line: what to click, or what it is waiting for. */
export function showHint(text = 'Click a province on the map to edit it.'): void {
  side.replaceChildren(h('p', { class: 'hint' }, text));
}

/** The province's own name: its localisation entry, else its definition.csv row. */
function headingTitle(id: number, current: ProvinceDetails | null): string {
  const locText = current?.localisation.text ?? '';
  if (locText !== '') { return locText; }
  const name = definitionById.get(id)?.name ?? '';
  if (name !== '') { return name; }
  return current?.isNew === true ? 'New province' : 'Province ' + String(id);
}

/** A terrain's localised label, falling back to the identifier itself. */
function terrainLabelOf(terrainName: string): string {
  if (terrainName === '') { return ''; }
  const entry = vocabulary().terrains.find(function (item) { return item.id === terrainName; });
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
  const terrainLabel = terrainLabelOf(terrainName);
  headerTerrainLabel = h('span', { class: 'file' }, terrainLabel === '' ? currentMap.targetName : terrainLabel);
  const heading = h('h1', { title: headingTip(id, currentMap, terrainLabel, terrain?.fromHistory ?? false) },
    h('span', { class: 'name' }, headingTitle(id, current)),
    h('span', { class: 'id' }, '- ' + String(id) + ' -'),
    headerTerrainLabel);
  previewTerrain = terrainName;
  // Keyed by the terrain name, '' included: that is the province with no terrain,
  // which has a picture of its own.
  if (terrain?.pictureDataUri) { terrainPictures.set(terrainName, terrain.pictureDataUri); }
  const box = h('div', { class: 'header' }, heading);
  headerBox = box;
  applyHeaderPicture(terrain?.pictureDataUri ?? null);
  return box;
}

function applyHeaderPicture(uri: string | null | undefined): void {
  if (!headerBox) { return; }
  headerBox.classList.toggle('pictured', Boolean(uri));
  headerBox.style.backgroundImage = uri ? 'linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.55)), url(' + uri + ')' : '';
}

/**
 * Show the picture of the terrain the form now holds — the bitmap's terrain when
 * the field is cleared, and the no-terrain picture when there is neither.
 * Fetched once per terrain per map.
 */
export function showTerrain(name: string): void {
  const effective = name === '' ? (state.details?.terrain.dominant ?? '') : name;
  previewTerrain = effective;
  if (headerTerrainLabel) {
    const entry = vocabulary().terrains.find(function (item) { return item.id === effective; });
    const fallback = effective === '' ? (state.map?.targetName ?? '') : effective;
    headerTerrainLabel.textContent = entry ? entry.label : fallback;
  }
  if (terrainPictures.has(effective)) { applyHeaderPicture(terrainPictures.get(effective)); return; }
  post({ type: 'terrainPicture', terrain: effective });
}

/** The extension's answer to `showTerrain`: kept, and shown when it is still the terrain the form holds. */
export function handleTerrainPicture(terrain: string, pictureDataUri: string | undefined): void {
  terrainPictures.set(terrain, pictureDataUri ?? null);
  if (terrain === previewTerrain) { applyHeaderPicture(pictureDataUri ?? null); }
}

/** Restart the position draft from the file, unless an unsaved edit is being held. */
function resetDraft(current: ProvinceDetails): void {
  const fresh: Draft = {};
  for (const spec of POSITION_KIND_SPECS) {
    const point = current.positions.data?.[spec.kind];
    fresh[spec.kind] = point ? { x: point.x, y: point.y } : undefined;
  }
  state.draft = fresh;
  state.draftBaseline = clonePoints(fresh);
  const held = pendingPositions.get(current.id);
  if (held) { state.draft = clonePoints(held); }
}

export function renderSide(id: number): void {
  const currentMap = state.map;
  if (!currentMap) { return; }
  side.replaceChildren();
  activeSaveBars = [];
  const current = state.details;
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
    // The tab's one Save writes the name, which a sea province does have, so
    // only the history form under it is locked — not the Save itself.
    const body = history.definition.querySelector('.body');
    if (body instanceof HTMLElement) { lock(body); }
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

/** Title, file path (grey, trimmed from the left) and an Open File button on one line. */
export interface SectionFile {
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
}

/** What the header says instead of a path, and whether that is worth a warning colour. */
export interface MissingNote {
  readonly text: string;
  readonly warning: boolean;
}

export function sectionHeader(title: string, section: SectionFile, missing: MissingNote): HTMLElement {
  const file = section.file;
  const open = file ? h('button', { class: 'outline', onclick: function () { post({ type: 'openFile', absolutePath: file.absolutePath, line: file.line }); } }, 'Open File') : null;
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
  const text = section.inTarget ? file.absolutePath.replace(state.map?.targetRoot ?? '', '').replace(/^[\\/]/, '') : file.absolutePath;
  return h('span', { class: 'file path' + (section.inTarget ? '' : ' warning'), title: text }, '‎' + text);
}

export function layerNote(section: SectionFile): HTMLElement | null {
  if (!section.file || section.inTarget) { return null; }
  return h('div', { class: 'file warning' }, 'Read from a layer below ' + (state.map?.targetName ?? 'the target') + '; saving writes a copy into it.');
}

interface SaveBar {
  readonly node: HTMLElement;
  readonly status: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
}

export function saveBar(onSave: () => void): HTMLElement {
  const status = h('span', { class: 'status' });
  const button = h('button', { onclick: function () {
    if (saving) { return; }
    saving = true; button.disabled = true; status.textContent = 'Saving…'; status.className = 'status';
    onSave();
  } }, 'Save');
  // Every tab edits one province, so dropping the changes means reading it
  // back from what the server last sent: the file, unchanged.
  const cancel = h('button', { class: 'secondary', title: 'Put every field back as the file has it', onclick: function () {
    const details = state.details;
    if (saving || !details) { return; }
    pendingPositions.delete(details.id);
    refreshPending();
    renderSide(details.id);
    setStatus('Changes dropped; the form is back to the file.');
  } }, 'Cancel');
  const bar: SaveBar = { node: h('div', { class: 'actions' }, button, cancel, status), status: status, button: button, cancel: cancel };
  activeSaveBars.push(bar);
  return bar.node;
}

/** The Definition tab's Save is the one Enter in the name field reaches: the bar built last for it. */
export function lastSaveButton(): HTMLButtonElement | null {
  return activeSaveBars[activeSaveBars.length - 1]?.button ?? null;
}

/**
 * The save in flight is over. A failure gives the Save buttons back and nothing
 * else: what was locked because the province cannot have it stays locked.
 */
export function finishSave(): void {
  saving = false;
  for (const bar of activeSaveBars) {
    bar.button.disabled = false;
    bar.status.textContent = '';
  }
}

/**
 * What a save writes, by the fields it carries: one tab's Save can stand for
 * several files, and only what it writes may be read back from disk after it.
 */
function partsOf(payload: PageSaveParams): Set<string> {
  const parts = new Set<string>([payload.section]);
  if (payload.section === 'history') {
    for (const key of ['climate', 'states', 'localisation'] as const) {
      if (payload[key] !== undefined) { parts.add(key); }
    }
  }
  return parts;
}

/** One section's edit, addressed to the province the panel is about. */
export function postSave(section: SaveSection): void {
  const details = state.details;
  if (!details) { return; }
  const payload: PageSaveParams = { ...section, provinceId: details.id, popDate: state.popDate };
  savingPartsHeld = partsOf(payload);
  const create = details.isNew && state.newColor !== null
    ? {
      color: state.newColor, isSea: forms.seaInput?.checked === true, name: forms.nameInput?.value ?? '',
      // A land province is refused without both: the server writes them with the row.
      climate: forms.climateInput?.value ?? '', states: forms.statesRead ? forms.statesRead() : [],
    }
    : undefined;
  post({ type: 'save', params: create ? { ...payload, create: create } : payload });
}

/** What the tabs the save did not write are holding, to be put back after the re-render. */
export function carryForms(): void {
  const parts = savingPartsHeld;
  if (!parts.has('history') && forms.historyRead) {
    const held = forms.historyRead();
    if (JSON.stringify(held) !== forms.historyRendered) { forms.carriedHistory = held; }
  }
  if (!parts.has('pops') && forms.popsRead) {
    const held = forms.popsRead();
    if (JSON.stringify(held) !== forms.popsRendered) { forms.carriedPops = held; }
  }
  if (!parts.has('climate') && forms.climateInput && forms.climateInput.value !== forms.climateRendered) {
    forms.carriedClimate = forms.climateInput.value;
  }
  if (!parts.has('states') && forms.statesRead) {
    const held = forms.statesRead();
    if (JSON.stringify(held) !== forms.statesRendered) { forms.carriedStates = held; }
  }
}

/** The files a save (or the part of one that got through) put on disk, by name. */
export function fileNames(files: readonly string[]): string {
  return files.map(function (file) { return file.split(/[\\/]/).pop() ?? file; }).join(', ');
}

/** A failure names what it managed to write before it stopped: those files are on disk now. */
export function failureText(result: SaveResult & { ok: false }): string {
  return result.written && result.written.length > 0
    ? result.reason + ' (already written: ' + fileNames(result.written) + ')'
    : result.reason;
}
