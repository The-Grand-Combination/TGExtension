import type { Range } from '../model/range.js';
import { csvRows } from '../parser/csv.js';

/** Fields of a `map/definition.csv` row: id, three colour channels, then the name. */
const NAME_FIELD = 4;
const DEFINITION_FIELDS = 5;

/** A province `map/definition.csv` declares, and where it declares it. */
export interface DeclaredProvince {
  readonly id: string;
  readonly name: string;
  /** Where the id sits in `map/definition.csv`. */
  readonly range: Range;
}

/** What decides whether a declared province is one the engine actually plays with. */
export interface ProvinceScope {
  /** `max_provinces` from `map/default.map`: the engine ignores any id at or above it. */
  readonly maxProvinces: number | undefined;
  /** Province ids `sea_starts` names; they carry no history and belong to no continent. */
  readonly seaProvinces: ReadonlySet<string>;
}

/**
 * The provinces `map/definition.csv` declares, in file order. A row with no
 * numeric id is a lake, and an id declared twice is counted once: the first row
 * is the one the engine keeps.
 */
export function declaredProvinces(definitionText: string | undefined): DeclaredProvince[] {
  if (definitionText === undefined) {
    return [];
  }
  const found: DeclaredProvince[] = [];
  const seen = new Set<string>();
  for (const row of csvRows(definitionText, { maxFields: DEFINITION_FIELDS })) {
    const id = row.fields[0];
    if (id === undefined || !/^\d+$/.test(id.text) || seen.has(id.text)) {
      continue;
    }
    seen.add(id.text);
    found.push({ id: id.text, name: row.fields[NAME_FIELD]?.text ?? '', range: id.range });
  }
  return found;
}

/**
 * The land provinces the engine plays with: everything `definition.csv`
 * declares, minus the sea and minus the ids past `max_provinces`, which the
 * engine never loads however many rows the file carries.
 */
export function landProvinces(
  definitionText: string | undefined,
  scope: ProvinceScope,
): DeclaredProvince[] {
  return declaredProvinces(definitionText).filter(
    (province) =>
      !scope.seaProvinces.has(province.id) &&
      (scope.maxProvinces === undefined || Number(province.id) < scope.maxProvinces),
  );
}

/** `Province 12 (Kyoto)`, or `Province 12` when `definition.csv` gives no name. */
export function describeProvince(province: DeclaredProvince): string {
  return province.name === '' ? `Province ${province.id}` : `Province ${province.id} (${province.name})`;
}
