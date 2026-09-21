import type { Scalar } from '../model/ast.js';
import { parseDocument } from './syntaxValidation.js';

/** `dynamic_tags = yes` splits the file; below it the tags are released nations, not countries of their own. */
const DYNAMIC_TAGS_SWITCH = 'dynamic_tags';

export interface CountryListEntry {
  readonly tag: Scalar;
  /**
   * The country definition the tag points at, as the file spells it. It is
   * relative to `common/`, not to `history/`: `"countries/England.txt"` is
   * `common/countries/England.txt`, which holds the colour and the party list.
   * A tag's history file is found another way — by the three characters its
   * name starts with (see `greatPowerValidation.ts`).
   */
  readonly definitionFile: string;
  readonly dynamic: boolean;
}

/**
 * `common/countries.txt` — `TAG = "countries/<file>.txt"`, one per line. The
 * first spelling of a tag wins, as it does in the engine, and the tags below
 * `dynamic_tags = yes` are marked rather than dropped: what they are good for
 * depends on the check reading them.
 */
export function parseCountryList(text: string): CountryListEntry[] {
  const entries: CountryListEntry[] = [];
  const seen = new Set<string>();
  let dynamic = false;
  for (const entry of parseDocument(text).document.entries) {
    if (entry.kind !== 'assignment' || entry.value.kind !== 'scalar') {
      continue;
    }
    const tagLower = entry.key.value.toLowerCase();
    if (tagLower === DYNAMIC_TAGS_SWITCH) {
      dynamic = true;
      continue;
    }
    if (!seen.has(tagLower)) {
      seen.add(tagLower);
      entries.push({ tag: entry.key, definitionFile: entry.value.value, dynamic });
    }
  }
  return entries;
}
