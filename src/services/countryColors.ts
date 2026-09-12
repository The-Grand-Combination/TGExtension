/**
 * What the Map Editor's "Country Colors" layer reads: which file defines each
 * tag (common/countries.txt), the `color` of a country definition, and the
 * start-date owner of a province history file. Pure functions over parsed
 * documents; the server reads the files.
 */

import type { Document } from '../model/ast.js';
import type { Rgb } from '../model/mapEditor.js';
import { asBlock, assignmentsOf, firstByKey } from '../model/astQuery.js';
import { parseProvinceHistory } from './provinceHistoryEdit.js';

/** `owner = ---` / `= null`: the province starts uncolonized. */
const NO_OWNER_VALUES: ReadonlySet<string> = new Set(['---', 'null']);

/** `TAG = "countries/France.txt"` lines of common/countries.txt → upper-case tag → `common/countries/France.txt`. */
export function countryFilesOf(document: Document): Map<string, string> {
  const files = new Map<string, string>();
  for (const assignment of assignmentsOf(document.entries)) {
    const tag = assignment.key.value;
    if (assignment.value.kind !== 'scalar' || tag.toLowerCase() === 'dynamic_tags') {
      continue;
    }
    const relative = assignment.value.value.replace(/\\/g, '/').replace(/^\/+/, '');
    if (relative !== '' && !files.has(tag.toUpperCase())) {
      files.set(tag.toUpperCase(), `common/${relative}`);
    }
  }
  return files;
}

/** The top-level `color = { r g b }` of a country definition, or undefined when missing or malformed. */
export function countryColorOf(document: Document): Rgb | undefined {
  const color = firstByKey(document.entries, 'color');
  const block = color === undefined ? undefined : asBlock(color.value);
  if (block?.entries.length !== 3) {
    return undefined;
  }
  const components = block.entries.map((entry) => (entry.kind === 'scalar' ? Number(entry.value) : Number.NaN));
  const [red, green, blue] = components;
  if (red === undefined || green === undefined || blue === undefined || components.some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  return [clampComponent(red), clampComponent(green), clampComponent(blue)];
}

/** The start-date `owner` of a province history file (dated blocks ignored), upper-cased; undefined for none or `---`. */
export function provinceOwnerOf(document: Document): string | undefined {
  const owner = parseProvinceHistory(document).owner;
  if (owner === undefined || owner === '' || NO_OWNER_VALUES.has(owner.toLowerCase())) {
    return undefined;
  }
  return owner.toUpperCase();
}

function clampComponent(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
