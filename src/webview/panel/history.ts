import type { DatedHistory, HistorySection, NamedIdentifier, ProvinceDetails, ProvinceHistory } from '../../model/mapEditor.js';
import { VANILLA_MAX_PROVINCES } from '../../model/mapEditor.js';
import { h, type Child } from '../dom.js';
import {
  checkInput,
  checkRow,
  dropGhost,
  fieldOf,
  fieldsIn,
  lock,
  plusButton,
  removeButton,
  selectInput,
  setPlaceholder,
  sliderInput,
  textInput,
  valueOf,
  type Field,
  type SliderRange,
} from '../fields.js';
import { state, vocabulary } from '../state.js';
import { reservedKind } from '../paintColor.js';
import { forms } from './forms.js';
import { lastSaveButton, layerNote, postSave, saveBar, sectionHeader, showTerrain, type MissingNote } from './panel.js';

// History — one form behind four tabs. Cores, Buildings and the dated blocks
// live in the same history file, so every Save posts the whole form and the
// tabs never drift.

export function localisationSection(current: ProvinceDetails): HTMLElement {
  const loc = current.localisation;
  const input = textInput(loc.text);
  // The name a save writes into definition.csv, and whether the id joins sea_starts.
  forms.nameInput = input;
  // Multi Draw made the colour out of water in the other files, so the province it becomes is a sea one.
  const sea = checkRow('Sea province (the id joins sea_starts in default.map)', reservedKind(state.newColor ?? -1) === 'sea');
  forms.seaInput = current.isNew ? sea.box : null;
  const seaRow = current.isNew ? sea.node : null;
  // A base-game province keeps the name vanilla gave its file, and other tools match
  // on it, so renaming there is opt-in. Above that id the province is the mod's own.
  const renamable = current.history.file !== undefined && !current.isSea;
  const rename = checkRow('Rename the history file to match', current.id > VANILLA_MAX_PROVINCES && renamable);
  forms.renameInput = rename.box;
  if (!renamable) { lock(rename.node); }
  // The tab has one Save, at the bottom of the History section; Enter reaches it.
  input.node.addEventListener('keydown', function (event) { if (event instanceof KeyboardEvent && event.key === 'Enter') { forms.definitionSave?.click(); } });
  return h('div', { class: 'section' },
    sectionHeader('Localisation', loc, { text: loc.key + ' is not defined; saving adds it to the mod\'s province names file.', warning: true }),
    layerNote(loc, 'saving adds the name to this mod\'s own province names file, and leaves that one alone'),
    h('div', { class: 'inline' }, h('label', null, loc.key), input.node),
    seaRow,
    rename.node);
}

export interface HistoryPanes {
  readonly definition: HTMLElement;
  readonly buildings: HTMLElement;
  readonly dates: HTMLElement;
}

/** How `history/provinces` itself reads in the Folder list, where the other rows are subfolder names. */
const ROOT_FOLDER_LABEL = '(history/provinces)';

/** What picking another folder does, which is not the same for a file this mod does not own. */
function folderTitle(history: HistorySection): string {
  if (history.file === undefined) { return 'Where the history file is created'; }
  return history.inTarget
    ? 'Where the history file sits; picking another folder moves it on the next save'
    : 'Where the copy of the history file this mod takes over is created';
}

export function historySections(current: ProvinceDetails): HistoryPanes {
  const history = current.history;
  const data = forms.carriedHistory ?? history.data ?? emptyHistory();
  forms.carriedHistory = null;
  const form = historyForm(data, {
    climate: forms.carriedClimate ?? current.climate.name,
    continent: forms.carriedContinent ?? current.continent.name,
    state: stateSection(current),
  });
  forms.carriedClimate = null;
  forms.carriedContinent = null;
  forms.historyRead = form.read;
  forms.historyRendered = JSON.stringify(data);
  forms.climateRendered = form.climate();
  forms.continentRendered = form.continent();
  // Which subfolder of history/provinces the file sits in: where a new one goes,
  // and where a save puts one that exists — the target's own file is moved, and a
  // file another layer owns is copied there. A sea province has the pane locked.
  const map = state.map;
  const folders = map && map.historyFolders.length > 0 ? map.historyFolders : [''];
  const known = history.folder !== undefined && !folders.includes(history.folder) ? [history.folder, ...folders] : folders;
  // The same pick list the fields below use, rather than a plain select: a select
  // insets its text a pixel further than an input, leaving this row out of line.
  // A province with no file keeps the first folder the list offers; one with a file opens on its own.
  const folder = selectInput(history.folder ?? known[0], known.map(function (name) { return { id: name, label: name === '' ? ROOT_FOLDER_LABEL : name }; }));
  folder.node.title = folderTitle(history);
  forms.historyFolder = function (): string { return folder.value; };
  const folderRow = h('div', { class: 'grid lone' }, h('label', null, 'Folder'), folder.node);
  // The Definition tab shows the name, the climate and the states as well, so
  // its one Save carries them; the other two history tabs show none of them.
  function pane(title: string, whole: boolean): (body: Child) => HTMLElement {
    const bar = saveBar(function () {
      postSave({
        section: 'history', data: form.read(), climate: form.climate(), continent: form.continent(),
        createInFolder: folder.value,
        ...(whole
          ? {
            localisation: { text: forms.nameInput?.value ?? '', renameHistoryFile: forms.renameInput?.checked === true },
            states: forms.statesRead ? forms.statesRead() : [],
          }
          : {}),
      });
    });
    if (whole) { forms.definitionSave = lastSaveButton(); }
    return function (body: Child): HTMLElement {
      const missing: MissingNote = current.isSea
        ? { text: 'Sea tiles don\'t need history files.', warning: false }
        : { text: 'No history file; saving creates one', warning: true };
      return h('div', { class: 'section' }, sectionHeader(title, history, missing), layerNote(history), h('div', { class: 'body' }, body), bar);
    };
  }
  return {
    definition: pane('History', true)(h('div', null, folderRow, form.node)),
    buildings: pane('Buildings', false)(form.buildings),
    dates: pane('Extra Dates', false)(form.dated),
  };
}

/**
 * `map/region.txt`: the states the province belongs to. The engine puts it in
 * the first one that claims it, and a land province in none of them is in no
 * state at all, so a Save is refused until the list has one.
 */
function stateSection(current: ProvinceDetails): HTMLElement {
  const section = current.state;
  const names = forms.carriedStates ?? section.names;
  forms.carriedStates = null;
  const list = listEditor('States', names, section.options, 'state');
  forms.statesRead = list.read;
  forms.statesRendered = JSON.stringify([...names]);
  return h('div', { class: 'section group' },
    sectionHeader('State', section, { text: 'The picked mods have no map/region.txt.', warning: true }),
    layerNote(section),
    list.node);
}

export function emptyHistory(): ProvinceHistory {
  return { owner: undefined, controller: undefined, cores: [], removeCores: [], tradeGoods: undefined, lifeRating: undefined, terrain: undefined, colonial: undefined, colony: undefined, isSlave: undefined, buildings: [], partyLoyalty: [], stateBuildings: [], setFlags: [], clrFlags: [], dated: [] };
}

/** The single-value fields of a history block, in the order the form shows them. */
type HistoryField = 'owner' | 'controller' | 'tradeGoods' | 'lifeRating' | 'terrain' | 'colonial';

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
  /** The climate the form holds; a dated block has none, and answers ''. */
  readonly climate: () => string;
  /** The continent the form holds; a dated block has none, and answers ''. */
  readonly continent: () => string;
}

/** What only the province's own form carries: its climate and continent, and the State section under it. */
interface HistoryExtras {
  readonly climate: string | undefined;
  readonly continent: string | undefined;
  readonly state: HTMLElement;
}

const LOYALTY_RANGE: SliderRange = { min: 1, max: 100 };
const COLONIAL_RANGE: SliderRange = {
  min: 0, max: 2, ticks: true, labels: ['No', 'Colony', 'Colonial State'],
};

function historyField(spec: HistoryFieldSpec, value: string | undefined): Field {
  if (spec.slider) { return sliderInput(value, spec.slider); }
  if (spec.entries) { return selectInput(value, spec.entries, '(none)'); }
  return textInput(value, 'number');
}

/**
 * The lowest level is the game's default, so a slider left there writes nothing
 * — unless the block already spelled it out: a dated `colonial = 0` is how a
 * province stops being a colony, and dropping it would change what the file says.
 */
function levelOf(input: Field, written: boolean): string | undefined {
  const value = input.value.trim();
  if (value === '0' && !written) { return undefined; }
  return value === '' ? undefined : value;
}

/** The loyalty sliders that stand for a line of the file; the example row is not one. */
function loyaltyFields(rows: HTMLElement): Field[] {
  return fieldsIn(rows, '.row:not(.ghost) .loyalty');
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
      if (field.input) {
        field.input.max = String(Math.max(own, LOYALTY_RANGE.max - (sum - own), LOYALTY_RANGE.min));
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

// topLevel is the province's own history: it allows dated blocks and hands the
// Cores, Buildings and dated-block groups back separately, for their own tabs.
// A dated block keeps every group inside its one node.
function historyForm(data: ProvinceHistory, extras: HistoryExtras | null): HistoryFormHandle {
  const topLevel = extras !== null;
  const words = vocabulary();
  const fields: readonly HistoryFieldSpec[] = [
    { name: 'owner', label: 'Owner', entries: words.countries },
    { name: 'controller', label: 'Controller', entries: words.countries },
    { name: 'tradeGoods', label: 'Trade goods', entries: words.goods },
    { name: 'lifeRating', label: 'Life rating', entries: null },
    { name: 'terrain', label: 'Terrain', entries: words.terrains },
    { name: 'colonial', label: 'Colonial', entries: null, slider: COLONIAL_RANGE },
  ];
  const inputs = {} as Record<HistoryField, Field>;
  const grid = h('div', { class: 'grid' });
  for (const spec of fields) {
    const field = historyField(spec, data[spec.name]);
    inputs[spec.name] = field;
    grid.append(h('label', null, spec.label), field.node);
  }
  if (topLevel) { inputs.terrain.node.addEventListener('input', function () { showTerrain(inputs.terrain.value); }); }
  // Neither the continent nor the climate is in the history file, but both are
  // the same province and the same Save: map/continent.txt and map/climate.txt
  // are written with it. The continent goes first, being the wider of the two.
  const continent = extras && state.details ? selectInput(extras.continent, state.details.continent.options, '(none)') : null;
  if (continent) {
    forms.continentInput = continent;
    grid.append(h('label', null, 'Continent'), continent.node);
  }
  const climate = extras && state.details ? selectInput(extras.climate, state.details.climate.options, '(none)') : null;
  if (climate) {
    forms.climateInput = climate;
    grid.append(h('label', null, 'Climate'), climate.node);
  }
  const cores = listEditor('Cores', data.cores, words.countries, 'country');
  // Only a dated block edits remove_core: at the start date a core is simply
  // listed or not. A remove_core line already in the file rides along.
  const removeCores = topLevel ? null : listEditor('Remove cores', data.removeCores, words.countries, 'country');
  const buildings = rowsEditor('Buildings', data.buildings, [{ key: 'key', placeholder: 'building', entries: words.buildings }, { key: 'value', placeholder: 'level', type: 'number', extraClass: 'narrow' }], function () { return { key: '', value: '1' }; });
  const partyLoyalty = rowsEditor('Party loyalty', data.partyLoyalty, [{ key: 'ideology', placeholder: 'ideology', entries: words.ideologies, extraClass: 'half' }, { key: 'loyaltyValue', placeholder: 'loyalty', slider: LOYALTY_RANGE, extraClass: 'loyalty' }], function () { return { ideology: '', loyaltyValue: String(LOYALTY_RANGE.min) }; });
  capLoyalties(partyLoyalty);
  const stateBuildings = rowsEditor('State buildings', data.stateBuildings, [{ key: 'building', placeholder: 'factory', entries: words.factories }, { key: 'level', placeholder: 'level', type: 'number', extraClass: 'narrow' }, { key: 'upgrade', placeholder: 'upgrade', check: true, extraClass: 'tick' }], function () { return { building: '', level: '1', upgrade: 'yes' }; });
  const dated = topLevel ? datedEditor(data.dated) : null;
  const coresGroup = h('div', { class: 'form' }, cores.node, removeCores ? removeCores.node : null);
  const buildingsGroup = h('div', { class: 'form' }, buildings.node, stateBuildings.node);
  // The province's own cores sit in the Definition tab, under Party loyalty;
  // a dated block keeps every group inside its one node.
  const node = extras
    ? h('div', { class: 'form' }, grid, extras.state, partyLoyalty.node, cores.node)
    : h('div', { class: 'form' }, grid, coresGroup, buildingsGroup, partyLoyalty.node);
  return {
    node: node,
    buildings: buildingsGroup,
    dated: dated ? dated.node : null,
    climate: function (): string { return climate ? climate.value : ''; },
    continent: function (): string { return continent ? continent.value : ''; },
    read: function (): ProvinceHistory {
      return {
        owner: valueOf(inputs.owner), controller: valueOf(inputs.controller),
        cores: cores.read(), removeCores: removeCores ? removeCores.read() : data.removeCores,
        tradeGoods: valueOf(inputs.tradeGoods), lifeRating: valueOf(inputs.lifeRating), terrain: valueOf(inputs.terrain),
        colonial: levelOf(inputs.colonial, data.colonial !== undefined),
        // Not shown by the form: colony, is_slave and the province flags are
        // written back exactly as the file has them.
        colony: data.colony, isSlave: data.isSlave,
        buildings: buildings.read().map(function (row) { return { key: row['key'] ?? '', value: row['value'] ?? '' }; }),
        partyLoyalty: partyLoyalty.read().map(function (row) { return { ideology: row['ideology'] ?? '', loyaltyValue: row['loyaltyValue'] ?? '' }; }),
        stateBuildings: stateBuildings.read().map(function (row) { return { building: row['building'] ?? '', level: row['level'] ?? '', upgrade: row['upgrade'] ?? '' }; }),
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

export function listEditor(
  title: string,
  values: readonly string[],
  entries: readonly NamedIdentifier[] | null,
  placeholder?: string,
): ListHandle {
  const rows = h('div', { class: 'rows' });
  function addRow(value: string, ghost?: boolean): Field {
    const input = entries ? selectInput(value, entries, '(pick)') : textInput(value);
    const row = h('div', { class: 'row' + (ghost ? ' ghost' : '') }, input.node, removeButton('Remove', function () { row.remove(); keepOne(); }));
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
  const node = h('div', { class: 'group' }, h('h3', null, title, plusButton('Add to ' + title, function () { dropGhost(rows); addRow('').focus(); })), rows);
  return {
    node: node,
    read: function (): string[] {
      return fieldsIn(rows)
        .map(function (field) { return field.value.trim(); })
        .filter(function (value) { return value !== ''; });
    },
  };
}

/** A table row as the form holds it: every value is script text. */
export type RowItem = Record<string, string | undefined>;

export interface ColumnSpec {
  readonly key: string;
  readonly placeholder: string;
  readonly type?: string;
  readonly extraClass?: string;
  readonly entries?: readonly NamedIdentifier[];
  readonly slider?: SliderRange;
  /** A yes/no column: ticked writes `yes`, unticked writes no line at all. */
  readonly check?: boolean;
}

export interface RowsHandle {
  readonly node: HTMLElement;
  readonly heading: HTMLElement;
  readonly rows: HTMLElement;
  readonly read: () => RowItem[];
}

/** The model's row shapes carry no index signature; every field of them is script text. */
function toRowItem(item: object): RowItem {
  const out: RowItem = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string') { out[key] = value; }
  }
  return out;
}

function columnField(column: ColumnSpec, value: string | undefined): Field {
  if (column.check) { return checkInput(value); }
  if (column.slider) { return sliderInput(value, column.slider, column.extraClass); }
  if (column.entries) { return selectInput(value, column.entries, '(pick)'); }
  return textInput(value, column.type, column.extraClass);
}

export function rowsEditor(
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
      if (column.extraClass) { input.node.classList.add(column.extraClass); }
      return input;
    });
    const row = h('div', { class: 'row' + (ghost ? ' ghost' : '') }, inputs.map(function (input) { return input.node; }),
      options.duplicate ? h('button', { class: 'secondary icon', title: 'Duplicate', onclick: function () { addRow(readRow(row)); } }, '⧉') : null,
      removeButton('Remove', function () { row.remove(); keepOne(); rows.dispatchEvent(new Event('input', { bubbles: true })); }));
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
    const inputs = fieldsIn(row);
    const out: RowItem = { ...hiddenFields.get(row) };
    columns.forEach(function (column, index) {
      out[column.key] = inputs[index]?.value.trim() ?? '';
    });
    return out;
  }
  function keepOne(): void { if (rows.children.length === 0) { addRow({}, true); } }
  for (const item of items) { addRow(toRowItem(item)); }
  keepOne();
  const head = h('div', { class: 'head' }, columns.map(function (column) { return h('span', { class: column.extraClass ?? undefined }, column.placeholder); }));
  const heading = h('h3', null, title, plusButton('Add to ' + title, function () { dropGhost(rows); fieldOf(addRow(blank()).querySelector('.field'))?.focus(); }));
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

function datedEditor(blocks: readonly DatedHistory[]): DatedHandle {
  const rows = h('div', { class: 'rows' });
  const entries: { date: Field; form: HistoryFormHandle }[] = [];
  function addBlock(block: DatedHistory): HTMLDetailsElement {
    const date = textInput(block.date);
    const form = historyForm(block.entries, null);
    const entry = { date: date, form: form };
    entries.push(entry);
    const node = h('details', { class: 'dated' },
      h('summary', null, 'Dated block ', date.node, h('span', { class: 'spacer' }), removeButton('Remove', function (event) { event.preventDefault(); entries.splice(entries.indexOf(entry), 1); node.remove(); })),
      form.node);
    date.node.addEventListener('click', function (event) { event.preventDefault(); });
    rows.append(node);
    return node;
  }
  for (const block of blocks) { addBlock(block); }
  const node = h('div', { class: 'group' }, h('h3', null, 'Dated blocks', plusButton('Add a dated block', function () { addBlock({ date: '1861.1.1', entries: emptyHistory() }).open = true; })), rows);
  return {
    node: node,
    read: function (): DatedHistory[] {
      return entries.map(function (entry) { return { date: entry.date.value.trim(), entries: entry.form.read() }; }).filter(function (block) { return block.date !== ''; });
    },
  };
}
