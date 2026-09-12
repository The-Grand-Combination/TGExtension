import type { Assignment, Block, Document, Entry, Scalar } from '../model/ast.js';
import type { DatedHistory, KeyValue, PartyLoyalty, ProvinceHistory, StateBuilding } from '../model/mapEditor.js';
import type { Range } from '../model/range.js';
import {
  deleteLinePatch,
  ensureTrailingNewline,
  indentAt,
  indentUnitOf,
  lineEndAt,
  lineEndingOf,
  type TextPatch,
} from './textPatch.js';

/**
 * Province history files (`history/provinces/<folder>/<id> - <name>.txt`) as a
 * typed model, and the patches that bring a file to an edited model. Patches
 * touch only the entries that changed, so comments and the file's own order
 * survive; a block (`party_loyalty`, `state_building`, a dated block) is
 * rewritten whole when anything inside it changed.
 */

const DATE_PATTERN = /^\d+\.\d+\.\d+$/;
const HISTORY_FILE_PATTERN = /^(\d+)\s*-/;

const SCALAR_KEYS = {
  owner: 'owner',
  controller: 'controller',
  trade_goods: 'tradeGoods',
  life_rating: 'lifeRating',
  terrain: 'terrain',
  colonial: 'colonial',
  colony: 'colony',
  is_slave: 'isSlave',
} as const;
type ScalarKey = keyof typeof SCALAR_KEYS;

const LIST_KEYS = {
  add_core: 'cores',
  remove_core: 'removeCores',
  set_province_flag: 'setFlags',
  clr_province_flag: 'clrFlags',
} as const;
type ListKey = keyof typeof LIST_KEYS;

const PARTY_LOYALTY = 'party_loyalty';
const STATE_BUILDING = 'state_building';

export const EMPTY_PROVINCE_HISTORY: ProvinceHistory = {
  owner: undefined,
  controller: undefined,
  cores: [],
  removeCores: [],
  tradeGoods: undefined,
  lifeRating: undefined,
  terrain: undefined,
  colonial: undefined,
  colony: undefined,
  isSlave: undefined,
  buildings: [],
  partyLoyalty: [],
  stateBuildings: [],
  setFlags: [],
  clrFlags: [],
  dated: [],
};

/** The province id a history file name starts with, if any. */
export function provinceIdOfHistoryFile(fileName: string): number | undefined {
  const match = HISTORY_FILE_PATTERN.exec(fileName);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** The relative path whose file name starts with the id, among `history/provinces/...` paths. */
export function findHistoryFile(relativePaths: readonly string[], provinceId: number): string | undefined {
  return relativePaths.find((relativePath) => {
    const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    return fileName.toLowerCase().endsWith('.txt') && provinceIdOfHistoryFile(fileName) === provinceId;
  });
}

/** The subfolders of `history/provinces` that hold files; `''` for files directly in it. */
export function historyFoldersOf(relativePaths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const relativePath of relativePaths) {
    const inside = relativePath.replace(/^history\/provinces\/?/i, '');
    const slash = inside.lastIndexOf('/');
    folders.add(slash === -1 ? '' : inside.slice(0, slash));
  }
  return [...folders].sort();
}

export function parseProvinceHistory(document: Document): ProvinceHistory {
  return historyOf(document.entries, true);
}

function historyOf(entries: readonly Entry[], allowDated: boolean): ProvinceHistory {
  const draft = mutableHistory();
  for (const entry of entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    const key = entry.key.value.toLowerCase();
    if (entry.value.kind === 'block') {
      readBlockEntry(draft, key, entry.value, allowDated);
    } else {
      readScalarEntry(draft, key, entry.value);
    }
  }
  return draft;
}

interface MutableHistory {
  owner: string | undefined;
  controller: string | undefined;
  cores: string[];
  removeCores: string[];
  tradeGoods: string | undefined;
  lifeRating: string | undefined;
  terrain: string | undefined;
  colonial: string | undefined;
  colony: string | undefined;
  isSlave: string | undefined;
  buildings: KeyValue[];
  partyLoyalty: PartyLoyalty[];
  stateBuildings: StateBuilding[];
  setFlags: string[];
  clrFlags: string[];
  dated: DatedHistory[];
}

function mutableHistory(): MutableHistory {
  return {
    ...EMPTY_PROVINCE_HISTORY,
    cores: [],
    removeCores: [],
    buildings: [],
    partyLoyalty: [],
    stateBuildings: [],
    setFlags: [],
    clrFlags: [],
    dated: [],
  };
}

function readScalarEntry(draft: MutableHistory, key: string, value: Scalar): void {
  if (isScalarKey(key)) {
    draft[SCALAR_KEYS[key]] = value.value;
  } else if (isListKey(key)) {
    draft[LIST_KEYS[key]].push(value.value);
  } else if (value.type === 'number') {
    draft.buildings.push({ key, value: value.value });
  }
}

function readBlockEntry(draft: MutableHistory, key: string, block: Block, allowDated: boolean): void {
  if (key === PARTY_LOYALTY) {
    draft.partyLoyalty.push({
      ideology: scalarIn(block, 'ideology') ?? '',
      loyaltyValue: scalarIn(block, 'loyalty_value') ?? '',
    });
  } else if (key === STATE_BUILDING) {
    draft.stateBuildings.push({
      building: scalarIn(block, 'building') ?? '',
      level: scalarIn(block, 'level') ?? '',
      upgrade: scalarIn(block, 'upgrade') ?? '',
    });
  } else if (allowDated && DATE_PATTERN.test(key)) {
    draft.dated.push({ date: key, entries: historyOf(block.entries, false) });
  }
}

function scalarIn(block: Block, key: string): string | undefined {
  for (const entry of block.entries) {
    if (entry.kind === 'assignment' && entry.key.value.toLowerCase() === key && entry.value.kind === 'scalar') {
      return entry.value.value;
    }
  }
  return undefined;
}

function isScalarKey(key: string): key is ScalarKey {
  return Object.hasOwn(SCALAR_KEYS, key);
}

function isListKey(key: string): key is ListKey {
  return Object.hasOwn(LIST_KEYS, key);
}

/** A whole new history file. */
export function renderProvinceHistory(history: ProvinceHistory, eol = '\r\n', unit = '\t'): string {
  const lines = [
    ...groupedItems(history, true).flatMap((group) => group.items.map((item) => item.render('', unit, eol))),
  ];
  return ensureTrailingNewline(lines.join(eol), eol);
}

function renderScalar(key: string, value: string): string {
  return `${key} = ${scalarText(value)}`;
}

function scalarText(value: string): string {
  const trimmed = value.trim();
  return trimmed === '' || /[\s#"={}]/.test(trimmed) ? `"${trimmed.replace(/"/g, '')}"` : trimmed;
}

function renderBlock(key: string, lines: readonly string[], indent: string, unit: string, eol: string): string {
  const inner = lines.map((line) => `${indent}${unit}${line}`);
  return [`${indent}${key} = {`, ...inner, `${indent}}`].join(eol);
}

function renderPartyLoyalty(loyalty: PartyLoyalty, indent: string, unit: string, eol: string): string {
  return renderBlock(
    PARTY_LOYALTY,
    [renderScalar('ideology', loyalty.ideology), renderScalar('loyalty_value', loyalty.loyaltyValue)],
    indent,
    unit,
    eol,
  );
}

function renderStateBuilding(building: StateBuilding, indent: string, unit: string, eol: string): string {
  const lines = [renderScalar('level', building.level), renderScalar('building', building.building)];
  if (building.upgrade.trim() !== '') {
    lines.push(renderScalar('upgrade', building.upgrade));
  }
  return renderBlock(STATE_BUILDING, lines, indent, unit, eol);
}

function renderDated(dated: DatedHistory, indent: string, unit: string, eol: string): string {
  const lines = groupedItems(dated.entries, false).flatMap((group) =>
    group.items.map((item) => item.render('', unit, eol)),
  );
  // Nested blocks come back with their own line breaks; indent every line of them.
  const flattened = lines.flatMap((line) => line.split(eol));
  return renderBlock(dated.date, flattened, indent, unit, eol);
}

// --- Diffing ---------------------------------------------------------------------

/** One entry the form can produce, with how to write it. */
interface RenderedItem {
  readonly canonical: string;
  readonly render: (indent: string, unit: string, eol: string) => string;
}

interface ItemGroup {
  readonly key: string;
  readonly dated: boolean;
  readonly items: readonly RenderedItem[];
}

/** The groups a model renders to, in the order a new file lists them. */
function groupedItems(history: ProvinceHistory, allowDated: boolean): ItemGroup[] {
  const groups: ItemGroup[] = [];
  const scalarGroup = (key: string, value: string | undefined): void => {
    if (value !== undefined && value.trim() !== '') {
      groups.push({ key, dated: false, items: [scalarItem(key, value)] });
    }
  };
  const listGroup = (key: string, values: readonly string[]): void => {
    const items = values.filter((value) => value.trim() !== '').map((value) => scalarItem(key, value));
    if (items.length > 0) {
      groups.push({ key, dated: false, items });
    }
  };
  scalarGroup('owner', history.owner);
  scalarGroup('controller', history.controller);
  listGroup('add_core', history.cores);
  listGroup('remove_core', history.removeCores);
  scalarGroup('trade_goods', history.tradeGoods);
  scalarGroup('life_rating', history.lifeRating);
  scalarGroup('terrain', history.terrain);
  scalarGroup('colonial', history.colonial);
  scalarGroup('colony', history.colony);
  scalarGroup('is_slave', history.isSlave);
  for (const [key, values] of buildingsByKey(history.buildings)) {
    listGroup(key, values);
  }
  listGroup('set_province_flag', history.setFlags);
  listGroup('clr_province_flag', history.clrFlags);
  pushBlockGroup(groups, PARTY_LOYALTY, history.partyLoyalty, renderPartyLoyalty);
  pushBlockGroup(groups, STATE_BUILDING, history.stateBuildings, renderStateBuilding);
  if (allowDated) {
    for (const [date, blocks] of datedByDate(history.dated)) {
      pushBlockGroup(groups, date, blocks, renderDated, true);
    }
  }
  return groups;
}

function pushBlockGroup<T>(
  groups: ItemGroup[],
  key: string,
  values: readonly T[],
  render: (value: T, indent: string, unit: string, eol: string) => string,
  dated = false,
): void {
  if (values.length === 0) {
    return;
  }
  groups.push({
    key,
    dated,
    items: values.map((value) => ({
      canonical: render(value, '', '\t', '\n'),
      render: (indent, unit, eol): string => render(value, indent, unit, eol),
    })),
  });
}

function scalarItem(key: string, value: string): RenderedItem {
  const canonical = renderScalar(key, value);
  return { canonical, render: (indent): string => `${indent}${canonical}` };
}

function buildingsByKey(buildings: readonly KeyValue[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const building of buildings) {
    const key = building.key.trim().toLowerCase();
    if (key === '' || isScalarKey(key) || isListKey(key)) {
      continue;
    }
    byKey.set(key, [...(byKey.get(key) ?? []), building.value]);
  }
  return byKey;
}

function datedByDate(dated: readonly DatedHistory[]): Map<string, DatedHistory[]> {
  const byDate = new Map<string, DatedHistory[]>();
  for (const block of dated) {
    const date = block.date.trim();
    if (DATE_PATTERN.test(date)) {
      byDate.set(date, [...(byDate.get(date) ?? []), { ...block, date }]);
    }
  }
  return byDate;
}

/** A top-level entry of the file the form knows about, with its canonical text. */
interface ExistingItem {
  readonly canonical: string;
  readonly range: Range;
}

/** Top-level entries grouped the same way `groupedItems` groups the model; unknown entries are left out (and untouched). */
function existingGroups(document: Document): Map<string, ExistingItem[]> {
  const groups = new Map<string, ExistingItem[]>();
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    const key = entry.key.value.toLowerCase();
    const canonical = canonicalOfExisting(entry, key);
    if (canonical !== undefined) {
      groups.set(key, [...(groups.get(key) ?? []), { canonical, range: entry.range }]);
    }
  }
  return groups;
}

function canonicalOfExisting(entry: Assignment, key: string): string | undefined {
  if (entry.value.kind === 'scalar') {
    if (isScalarKey(key) || isListKey(key) || entry.value.type === 'number') {
      return renderScalar(key, entry.value.value);
    }
    return undefined;
  }
  const single = historyOf([entry], true);
  if (key === PARTY_LOYALTY) {
    return single.partyLoyalty[0] === undefined ? undefined : renderPartyLoyalty(single.partyLoyalty[0], '', '\t', '\n');
  }
  if (key === STATE_BUILDING) {
    return single.stateBuildings[0] === undefined ? undefined : renderStateBuilding(single.stateBuildings[0], '', '\t', '\n');
  }
  if (DATE_PATTERN.test(key)) {
    return single.dated[0] === undefined ? undefined : renderDated(single.dated[0], '', '\t', '\n');
  }
  return undefined;
}

/**
 * The patches that turn `text` (parsed as `document`) into `after`. Changed
 * entries are rewritten in place, dropped entries lose their line, new entries
 * go after the last entry of their kind: plain fields before the first dated
 * block, dated blocks at the end.
 */
export function planHistoryEdit(text: string, document: Document, after: ProvinceHistory): TextPatch[] {
  const eol = lineEndingOf(text);
  const unit = indentUnitOf(text);
  const existing = existingGroups(document);
  const wanted = new Map(groupedItems(after, true).map((group) => [group.key, group]));
  const patches: TextPatch[] = [];
  const additions = { plain: [] as string[], dated: [] as string[] };

  for (const key of new Set([...existing.keys(), ...wanted.keys()])) {
    const before = existing.get(key) ?? [];
    const group = wanted.get(key);
    const items = group?.items ?? [];
    const added = patchGroup(text, before, items, unit, eol, patches);
    if (added.length > 0) {
      additions[group?.dated === true ? 'dated' : 'plain'].push(...added);
    }
  }
  patches.push(...insertionPatches(text, document, additions, eol));
  return patches;
}

/**
 * Patches for one group: rewrites, deletions, and additions after the group's
 * last entry. Returns the rendered additions when the group has no entry yet,
 * so the caller can place them.
 */
function patchGroup(
  text: string,
  before: readonly ExistingItem[],
  items: readonly RenderedItem[],
  unit: string,
  eol: string,
  patches: TextPatch[],
): string[] {
  const shared = Math.min(before.length, items.length);
  for (let index = 0; index < shared; index++) {
    const current = before[index];
    const next = items[index];
    if (current && next && current.canonical !== next.canonical) {
      const indent = indentAt(text, current.range.start);
      patches.push({ ...current.range, text: next.render(indent, unit, eol).slice(indent.length) });
    }
  }
  for (const dropped of before.slice(shared)) {
    patches.push(deleteLinePatch(text, dropped.range.start, dropped.range.end));
  }
  const added = items.slice(shared).map((item) => item.render('', unit, eol));
  const last = before[before.length - 1];
  if (added.length === 0 || !last) {
    return added;
  }
  const at = lineEndAt(text, last.range.end);
  const needsEol = at === text.length && !text.endsWith('\n');
  patches.push({ start: at, end: at, text: `${needsEol ? eol : ''}${added.join(eol)}${eol}` });
  return [];
}

function insertionPatches(
  text: string,
  document: Document,
  additions: { readonly plain: readonly string[]; readonly dated: readonly string[] },
  eol: string,
): TextPatch[] {
  const patches: TextPatch[] = [];
  const end = text.length;
  const trailingEol = text === '' || text.endsWith('\n') ? '' : eol;
  if (additions.plain.length > 0) {
    const anchor = plainInsertionOffset(text, document);
    const lead = anchor === end ? trailingEol : '';
    patches.push({ start: anchor, end: anchor, text: `${lead}${additions.plain.join(eol)}${eol}` });
  }
  if (additions.dated.length > 0) {
    const lead = additions.plain.length > 0 && plainInsertionOffset(text, document) === end ? '' : trailingEol;
    patches.push({ start: end, end, text: `${lead}${additions.dated.join(eol)}${eol}` });
  }
  return patches;
}

/** Just after the last top-level entry that is not a dated block, else the text end. */
function plainInsertionOffset(text: string, document: Document): number {
  let last: Entry | undefined;
  for (const entry of document.entries) {
    const isDated = entry.kind === 'assignment' && DATE_PATTERN.test(entry.key.value);
    if (!isDated) {
      last = entry;
    }
  }
  return last === undefined ? text.length : lineEndAt(text, last.range.end);
}
