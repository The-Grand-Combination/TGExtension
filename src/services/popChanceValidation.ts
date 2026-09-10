import { POP_CHANCE_KEYS } from '../data/commonStructure.js';
import type { Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { reportUnknownKey, walkBlockValue, walkWeightBlock, type Walk } from './validationWalker.js';

/** common/pop_types.txt — the seven pop-scope promotion/migration weights. */
export function validatePopChancesFile(walk: Walk, document: Document): void {
  for (const chance of blockKeysOf(document)) {
    if (!POP_CHANCE_KEYS.has(chance.key.value.toLowerCase())) {
      reportUnknownKey(walk, chance, 'unknown-pop-chance', 'pop chance', POP_CHANCE_KEYS);
    }
    walkBlockValue(walk, chance, (block) => { walkWeightBlock(walk, block, 'pop'); });
  }
}
