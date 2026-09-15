import {
  POSITION_KINDS,
  type LocalisationEdit,
  type NewProvince,
  type PageSaveParams,
  type PopEntry,
  type PositionKind,
  type PositionPoint,
  type ProvinceHistory,
  type ProvincePositions,
  type SaveSection,
} from '../model/mapEditor.js';
import { asReference, type ReferenceLayer } from './referenceLayers.js';

/** One province's map positions, edited in the page and not yet written. */
export interface PendingPositions {
  readonly provinceId: number;
  readonly data: ProvincePositions;
}

export type PageMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'reload' }
  | { readonly type: 'log'; readonly message: string }
  | { readonly type: 'terrainPicture'; readonly terrain: string }
  | { readonly type: 'select'; readonly provinceId: number; readonly popDate: string }
  /** A colour with no province: the page asks for a province that does not exist yet. */
  | { readonly type: 'newProvince'; readonly color: number; readonly popDate: string }
  | { readonly type: 'openFile'; readonly absolutePath: string; readonly line: number }
  | { readonly type: 'save'; readonly params: PageSaveParams }
  | { readonly type: 'pending'; readonly edits: readonly PendingPositions[] }
  /** Painted pixels as `index, length, colour` triples; see `provincePaint.runsOf`. */
  | { readonly type: 'paint'; readonly runs: readonly number[] }
  /** How many painted pixels the page is holding, so closing the tab can say so. */
  | { readonly type: 'paintPending'; readonly pixels: number }
  | { readonly type: 'saveAll' }
  /** A picture dropped from the desktop: its bytes, base64, kept in `map/references` and placed at the drop point. */
  | { readonly type: 'addReference'; readonly name: string; readonly bytes: string; readonly x: number; readonly y: number }
  /** A picture dragged from the Explorer: a `file:` URI the extension copies. */
  | { readonly type: 'addReferencePath'; readonly uri: string; readonly x: number; readonly y: number }
  /** Open the file picker for a picture, to land at this map point. */
  | { readonly type: 'pickReference'; readonly x: number; readonly y: number }
  /** The whole list as the page holds it, written to the manifest. */
  | { readonly type: 'references'; readonly layers: readonly ReferenceLayer[] }
  | { readonly type: 'removeReference'; readonly file: string };

type UnknownRecord = Record<string, unknown>;

/** The page is ours, but its messages arrive untyped; every field is checked before use. */
export function asPageMessage(message: unknown): PageMessage | undefined {
  const record = asRecord(message);
  if (!record) {
    return undefined;
  }
  switch (record['type']) {
    case 'ready':
    case 'reload':
    case 'saveAll':
      return { type: record['type'] };
    case 'save':
      return asSave(record);
    case 'pending':
      return { type: 'pending', edits: asArray(record['edits'], asPending) };
    case 'newProvince':
      return typeof record['color'] === 'number' && typeof record['popDate'] === 'string'
        ? { type: 'newProvince', color: record['color'], popDate: record['popDate'] }
        : undefined;
    case 'paint':
      return asPaint(record);
    case 'references':
      return { type: 'references', layers: asArray(record['layers'], asReference) };
    default:
      return asFieldMessage(record) ?? asReferenceMessage(record);
  }
}

function asFieldMessage(record: UnknownRecord): PageMessage | undefined {
  switch (record['type']) {
    case 'log':
      return typeof record['message'] === 'string' ? { type: 'log', message: record['message'] } : undefined;
    case 'terrainPicture':
      return typeof record['terrain'] === 'string' ? { type: 'terrainPicture', terrain: record['terrain'] } : undefined;
    case 'paintPending':
      return typeof record['pixels'] === 'number' ? { type: 'paintPending', pixels: record['pixels'] } : undefined;
    case 'select':
      return typeof record['provinceId'] === 'number' && typeof record['popDate'] === 'string'
        ? { type: 'select', provinceId: record['provinceId'], popDate: record['popDate'] }
        : undefined;
    case 'openFile':
      return typeof record['absolutePath'] === 'string' && typeof record['line'] === 'number'
        ? { type: 'openFile', absolutePath: record['absolutePath'], line: record['line'] }
        : undefined;
    default:
      return undefined;
  }
}

function asReferenceMessage(record: UnknownRecord): PageMessage | undefined {
  switch (record['type']) {
    case 'addReference':
      return typeof record['name'] === 'string' && typeof record['bytes'] === 'string' && isPoint(record)
        ? { type: 'addReference', name: record['name'], bytes: record['bytes'], x: record.x, y: record.y }
        : undefined;
    case 'addReferencePath':
      return typeof record['uri'] === 'string' && isPoint(record)
        ? { type: 'addReferencePath', uri: record['uri'], x: record.x, y: record.y }
        : undefined;
    case 'pickReference':
      return isPoint(record) ? { type: 'pickReference', x: record.x, y: record.y } : undefined;
    case 'removeReference':
      return typeof record['file'] === 'string' ? { type: 'removeReference', file: record['file'] } : undefined;
    default:
      return undefined;
  }
}

function isPoint(record: UnknownRecord): record is UnknownRecord & { x: number; y: number } {
  return typeof record['x'] === 'number' && typeof record['y'] === 'number' && Number.isFinite(record['x']) && Number.isFinite(record['y']);
}

/** What a save of a province that is only paint so far carries; anything short of whole is no creation at all. */
function asCreate(value: unknown): NewProvince | undefined {
  const record = asRecord(value);
  if (!record || typeof record['color'] !== 'number' || !Number.isInteger(record['color'])) {
    return undefined;
  }
  return {
    color: record['color'],
    isSea: record['isSea'] === true,
    name: optionalString(record['name']) ?? '',
    climate: optionalString(record['climate']) ?? '',
    states: stringList(record['states']),
  };
}

/** Only the tab that shows the name carries it; a save without it leaves the localisation alone. */
function asLocalisation(value: unknown): LocalisationEdit | undefined {
  const record = asRecord(value);
  return record && typeof record['text'] === 'string'
    ? { text: record['text'], renameHistoryFile: record['renameHistoryFile'] === true }
    : undefined;
}

/** A triple short of whole, or holding anything but whole numbers, is dropped: it would paint the wrong pixels. */
function asPaint(record: UnknownRecord): PageMessage | undefined {
  const value: unknown = record['runs'];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const runs = numberList(value);
  return runs.length === value.length && runs.length % 3 === 0 ? { type: 'paint', runs } : undefined;
}

function asPending(value: unknown): PendingPositions | undefined {
  const record = asRecord(value);
  const data = record ? asPositions(record['data']) : undefined;
  return record && data && typeof record['provinceId'] === 'number'
    ? { provinceId: record['provinceId'], data }
    : undefined;
}

function asSave(record: UnknownRecord): PageMessage | undefined {
  const section = asSection(record);
  if (!section || typeof record['provinceId'] !== 'number' || typeof record['popDate'] !== 'string') {
    return undefined;
  }
  const create = asCreate(record['create']);
  return {
    type: 'save',
    params: {
      provinceId: record['provinceId'],
      popDate: record['popDate'],
      ...section,
      ...(create ? { create } : {}),
    },
  };
}

function asSection(record: UnknownRecord): SaveSection | undefined {
  switch (record['section']) {
    case 'history': {
      const data = asHistory(record['data'], true);
      const localisation = asLocalisation(record['localisation']);
      return data
        ? {
            section: 'history',
            data,
            climate: optionalString(record['climate']) ?? '',
            createInFolder: optionalString(record['createInFolder']),
            ...(localisation ? { localisation } : {}),
            ...(Array.isArray(record['states']) ? { states: stringList(record['states']) } : {}),
          }
        : undefined;
    }
    case 'pops': {
      const pops = asPops(record['pops']);
      return pops ? { section: 'pops', pops, createInFile: optionalString(record['createInFile']) } : undefined;
    }
    case 'positions': {
      const data = asPositions(record['data']);
      return data ? { section: 'positions', data } : undefined;
    }
    default:
      return undefined;
  }
}

/** Every kind is present; one without both coordinates as strings counts as cleared. */
function asPositions(value: unknown): ProvincePositions | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const positions: Partial<Record<PositionKind, PositionPoint | undefined>> = {};
  for (const kind of POSITION_KINDS) {
    const point = asStringFields(record[kind], ['x', 'y']);
    positions[kind] = point && point.x !== '' && point.y !== '' ? point : undefined;
  }
  // Every kind was assigned just above.
  return positions as ProvincePositions;
}

function asHistory(value: unknown, allowDated: boolean): ProvinceHistory | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const dated = allowDated ? asArray(record['dated'], asDated) : [];
  const partyLoyalty = asArray(record['partyLoyalty'], (item) => asStringFields(item, ['ideology', 'loyaltyValue']));
  const stateBuildings = asArray(record['stateBuildings'], (item) => asStringFields(item, ['building', 'level', 'upgrade']));
  const buildings = asArray(record['buildings'], (item) => asStringFields(item, ['key', 'value']));
  return {
    owner: optionalString(record['owner']),
    controller: optionalString(record['controller']),
    cores: stringList(record['cores']),
    removeCores: stringList(record['removeCores']),
    tradeGoods: optionalString(record['tradeGoods']),
    lifeRating: optionalString(record['lifeRating']),
    terrain: optionalString(record['terrain']),
    colonial: optionalString(record['colonial']),
    colony: optionalString(record['colony']),
    isSlave: optionalString(record['isSlave']),
    buildings,
    partyLoyalty,
    stateBuildings,
    setFlags: stringList(record['setFlags']),
    clrFlags: stringList(record['clrFlags']),
    dated,
  };
}

function asDated(value: unknown): { date: string; entries: ProvinceHistory } | undefined {
  const record = asRecord(value);
  const entries = record ? asHistory(record['entries'], false) : undefined;
  return record && entries && typeof record['date'] === 'string' ? { date: record['date'], entries } : undefined;
}

function asPops(value: unknown): PopEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return asArray(value, (item) => {
    const fields = asStringFields(item, ['type', 'culture', 'religion', 'size']);
    const record = asRecord(item);
    return fields && record
      ? { ...fields, militancy: optionalString(record['militancy']), rebelType: optionalString(record['rebelType']) }
      : undefined;
  });
}

/** An object whose listed fields are all strings, as exactly that shape. */
function asStringFields<K extends string>(value: unknown, keys: readonly K[]): Record<K, string> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const field = record[key];
    out[key] = typeof field === 'string' ? field : '';
  }
  // Every key was assigned a string just above.
  return out as Record<K, string>;
}

function asArray<T>(value: unknown, item: (element: unknown) => T | undefined): T[] {
  return Array.isArray(value) ? value.flatMap((element: unknown) => {
    const converted = item(element);
    return converted === undefined ? [] : [converted];
  }) : [];
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item)) : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  // Messages come from postMessage as plain objects; the fields are checked one by one afterwards.
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
}
