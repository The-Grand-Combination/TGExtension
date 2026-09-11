import type { PopEntry, ProvinceHistory, SaveParams, SaveSection } from '../model/mapEditor.js';

/** What the Map Editor page posts back. */
export type PageMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'reload' }
  | { readonly type: 'log'; readonly message: string }
  | { readonly type: 'select'; readonly provinceId: number; readonly popDate: string }
  | { readonly type: 'openFile'; readonly absolutePath: string; readonly line: number }
  | { readonly type: 'save'; readonly params: SaveParams };

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
      return { type: record['type'] };
    case 'log':
      return typeof record['message'] === 'string' ? { type: 'log', message: record['message'] } : undefined;
    case 'select':
      return typeof record['provinceId'] === 'number' && typeof record['popDate'] === 'string'
        ? { type: 'select', provinceId: record['provinceId'], popDate: record['popDate'] }
        : undefined;
    case 'openFile':
      return typeof record['absolutePath'] === 'string' && typeof record['line'] === 'number'
        ? { type: 'openFile', absolutePath: record['absolutePath'], line: record['line'] }
        : undefined;
    case 'save':
      return asSave(record);
    default:
      return undefined;
  }
}

function asSave(record: UnknownRecord): PageMessage | undefined {
  const section = asSection(record);
  if (!section || typeof record['provinceId'] !== 'number' || typeof record['popDate'] !== 'string') {
    return undefined;
  }
  return {
    type: 'save',
    params: { workspaceFolders: [], mods: [], provinceId: record['provinceId'], popDate: record['popDate'], ...section },
  };
}

function asSection(record: UnknownRecord): SaveSection | undefined {
  switch (record['section']) {
    case 'localisation':
      return typeof record['text'] === 'string'
        ? { section: 'localisation', text: record['text'], renameHistoryFile: record['renameHistoryFile'] === true }
        : undefined;
    case 'history': {
      const data = asHistory(record['data'], true);
      return data ? { section: 'history', data, createInFolder: optionalString(record['createInFolder']) } : undefined;
    }
    case 'pops': {
      const pops = asPops(record['pops']);
      return pops ? { section: 'pops', pops, createInFile: optionalString(record['createInFile']) } : undefined;
    }
    default:
      return undefined;
  }
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
