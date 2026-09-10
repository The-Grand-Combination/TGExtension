import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import {
  checkColorBlock,
  eachAssignment,
  isEmptyCategory,
  report,
  reportUnknownKey,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

const COUNTRY_UNIT_COLOR_KEYS: ReadonlySet<string> = new Set(['color1', 'color2', 'color3']);

/** common/country_colors.txt (HoD): `TAG = { color1/color2/color3 = { r g b } }`. */
export function validateCountryColorsFile(walk: Walk, document: Document): void {
  for (const country of blockKeysOf(document)) {
    const keyLower = country.key.value.toLowerCase();
    if (!isEmptyCategory(walk, 'country') && !hasIdentifier(walk.index, 'country', keyLower)) {
      reportUnknownKey(walk, country, 'unknown-country', 'country tag', namesOf(walk.index, 'country'));
    }
    walkBlockValue(walk, country, (block) => { validateCountryColorsBody(walk, block); });
  }
}

function validateCountryColorsBody(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (entry) => {
    if (COUNTRY_UNIT_COLOR_KEYS.has(entry.key.value.toLowerCase())) {
      checkColorBlock(walk, entry);
    } else {
      report(
        walk,
        entry,
        'unknown-field',
        `Unknown field '${entry.key.value}' — country_colors entries take color1/color2/color3.`,
      );
    }
  });
}
