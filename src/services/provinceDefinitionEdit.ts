import type { ProvinceDefinition } from '../model/mapEditor.js';
import type { ProvinceRow } from './provinceTable.js';
import { ensureTrailingNewline, lineEndingOf } from './textPatch.js';

/**
 * `map/definition.csv`: `id;red;green;blue;name;x`, one row per province, plus
 * the lake rows that leave the id empty. The Map Editor only ever adds a row —
 * a province painted in a colour the table does not name yet.
 */

/** Past the last id in the table: a new province never takes an id another one had. */
export function nextProvinceId(rows: readonly ProvinceRow[]): number {
  let highest = 0;
  for (const row of rows) {
    if (row.id !== undefined && row.id > highest) { highest = row.id; }
  }
  return highest + 1;
}

export function rowOfColor(rows: readonly ProvinceRow[], color: number): ProvinceRow | undefined {
  return rows.find((row) => row.color === color);
}

/**
 * The new row after the last row that has an id, in the line ending the file
 * already uses. The lake rows, which have none, sit at the end of the file and
 * stay there: a province put after them would be the one province among lakes.
 */
export function appendDefinitionRow(text: string, definition: ProvinceDefinition): string {
  const ending = lineEndingOf(text);
  const row = [
    String(definition.id),
    String((definition.color >> 16) & 0xff),
    String((definition.color >> 8) & 0xff),
    String(definition.color & 0xff),
    definition.name,
    'x',
  ].join(';') + ending;
  const whole = ensureTrailingNewline(text, ending);
  const lines = whole.split(ending);
  let last = -1;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*\d+\s*;/.test(lines[index] ?? '')) { last = index; }
  }
  if (last < 0) {
    return whole + row;
  }
  const at = lines.slice(0, last + 1).join(ending).length + ending.length;
  return whole.slice(0, at) + row + whole.slice(at);
}
