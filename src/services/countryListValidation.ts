import { RESERVED_COUNTRY_TAGS } from '../data/commonStructure.js';
import type { Document } from '../model/ast.js';
import { eachAssignment, report, type Walk } from './validationWalker.js';

/** `dynamic_tags = yes` splits the file; it is a switch, not a tag. */
const FILE_SWITCHES: ReadonlySet<string> = new Set(['dynamic_tags']);

/**
 * common/countries.txt — `TAG = "countries/<file>.txt"`, one per line. Only the
 * tag itself is checked: the path is a free string the mod resolves however it
 * likes, and unknown keys here are not an error.
 */
export function validateCountryListFile(walk: Walk, document: Document): void {
  eachAssignment(walk, document.entries, (entry) => {
    const tagLower = entry.key.value.toLowerCase();
    if (FILE_SWITCHES.has(tagLower)) {
      return;
    }
    if (RESERVED_COUNTRY_TAGS.has(tagLower)) {
      report(
        walk,
        entry,
        'reserved-country-tag',
        `'${entry.key.value}' is reserved by the engine and cannot be a country tag. Pick another three letters.`,
      );
    }
  });
}
