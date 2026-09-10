import { TRAIT_FIELDS } from '../data/commonStructure.js';
import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import {
  eachAssignment,
  report,
  reportUnknownKey,
  requireNumericValue,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

/** common/traits.txt — `personality` and `background` sets of leader traits (NCE trait). */
export function validateTraitsFile(walk: Walk, document: Document): void {
  for (const set of blockKeysOf(document)) {
    const keyLower = set.key.value.toLowerCase();
    if (keyLower !== 'personality' && keyLower !== 'background') {
      report(walk, set, 'unknown-field', `traits.txt only holds 'personality' and 'background' sets.`);
      continue;
    }
    walkBlockValue(walk, set, (block) => { validateTraitSet(walk, block); });
  }
}

function validateTraitSet(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (trait) => {
    walkBlockValue(walk, trait, (body) => {
      eachAssignment(walk, body.entries, (stat) => {
        if (TRAIT_FIELDS.has(stat.key.value.toLowerCase())) {
          requireNumericValue(walk, stat);
        } else {
          reportUnknownKey(walk, stat, 'unknown-trait-stat', 'leader stat', TRAIT_FIELDS);
        }
      });
    });
  });
}
