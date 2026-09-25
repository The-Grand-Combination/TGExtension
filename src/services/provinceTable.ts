import type { ProvinceDefinition } from '../model/mapEditor.js';
import { csvRows } from '../parser/csv.js';

/** One usable row of `map/definition.csv`; `id` is undefined for lake rows (empty first field). */
export interface ProvinceRow {
  readonly id: number | undefined;
  /** Packed `red << 16 | green << 8 | blue`. */
  readonly color: number;
  readonly name: string;
}

/** Rows whose color parses; an id must be a positive integer, anything else is a lake row. */
export function parseProvinceRows(definitionText: string): ProvinceRow[] {
  const rows: ProvinceRow[] = [];
  for (const row of csvRows(definitionText, { skipHeader: true })) {
    const [id, red, green, blue, name] = row.fields;
    const color = packColor(red?.text, green?.text, blue?.text);
    if (id === undefined || color === undefined) {
      continue;
    }
    if (id.text === '') {
      rows.push({ id: undefined, color, name: name?.text ?? '' });
    } else if (/^\d+$/.test(id.text) && Number(id.text) > 0) {
      rows.push({ id: Number(id.text), color, name: name?.text ?? '' });
    }
  }
  return rows;
}

export function parseProvinceDefinitions(definitionText: string): ProvinceDefinition[] {
  return parseProvinceRows(definitionText).flatMap((row) =>
    row.id === undefined ? [] : [{ id: row.id, color: row.color, name: row.name }],
  );
}

export function packColor(
  red: string | undefined,
  green: string | undefined,
  blue: string | undefined,
): number | undefined {
  const parts = [red, green, blue].map((text) => (text !== undefined && /^\d+$/.test(text) ? Number(text) : -1));
  if (parts.some((part) => part < 0 || part > 255)) {
    return undefined;
  }
  return ((parts[0] ?? 0) << 16) | ((parts[1] ?? 0) << 8) | (parts[2] ?? 0);
}

/** The id a lake row or an unusable id maps to; a real id is always below it. */
export const LAKE_ID = 0xffff;

/** Packed colour → province id for every row with an id below `LAKE_ID`; lake rows map to `lakeAs`, or to nothing. */
export function idByColorOf(rows: readonly ProvinceRow[], lakeAs?: number): { idByColor: Uint16Array; maxId: number } {
  const idByColor = new Uint16Array(1 << 24);
  let maxId = 0;
  for (const row of rows) {
    if (row.id === undefined) {
      if (lakeAs !== undefined) {
        idByColor[row.color] = lakeAs;
      }
    } else if (row.id < LAKE_ID) {
      idByColor[row.color] = row.id;
      maxId = Math.max(maxId, row.id);
    }
  }
  return { idByColor, maxId };
}
