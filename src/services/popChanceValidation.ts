import { POP_CHANCE_KEYS } from '../data/commonStructure.js';
import type { Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { reportKeysAnywhere, reportUnknownKey, walkBlockValue, walkWeightBlock, type Walk } from './validationWalker.js';

/** The pop screen crashes when a chance in this file checks a country modifier. */
const FORBIDDEN_POP_CHANCE_KEYS: ReadonlySet<string> = new Set(['has_country_modifier']);

/** common/pop_types.txt — the seven pop-scope promotion/migration weights. */
export function validatePopChancesFile(walk: Walk, document: Document): void {
  reportKeysAnywhere(walk, document.entries, FORBIDDEN_POP_CHANCE_KEYS, 'pop-chance-country-modifier',
    (key) => `'${key}' cannot be used in pop_types.txt: it crashes the game in the pop screen.`);
  for (const chance of blockKeysOf(document)) {
    if (!POP_CHANCE_KEYS.has(chance.key.value.toLowerCase())) {
      reportUnknownKey(walk, chance, 'unknown-pop-chance', 'pop chance', POP_CHANCE_KEYS);
    }
    walkBlockValue(walk, chance, (block) => { walkWeightBlock(walk, block, 'pop'); });
  }
}
