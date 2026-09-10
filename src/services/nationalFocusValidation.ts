import { FOCUS_FIELDS } from '../data/commonStructure.js';
import type { Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import {
  checkArg,
  checkTableField,
  eachAssignment,
  requireNumericValue,
  walkBlockValue,
  walkTriggerEntries,
  type Walk,
} from './validationWalker.js';

/** common/national_focus.txt — `<category> = { <focus> = { ... } }`. */
export function validateNationalFocusFile(walk: Walk, document: Document): void {
  for (const category of blockKeysOf(document)) {
    const categoryBlock = asBlock(category.value);
    if (!categoryBlock) {
      continue;
    }
    for (const focus of blockKeysOf(categoryBlock)) {
      const block = asBlock(focus.value);
      if (block) {
        validateFocusBody(walk, block);
      }
    }
  }
}

/** `limit` runs per province of the state (NCE make_focus_limit); the rest are
 *  modifier values, listed fields, or any numeric key (NCE `#any float`). */
function validateFocusBody(walk: Walk, body: Block): void {
  eachAssignment(walk, body.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'limit') {
      walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, 'province'); });
    } else if (keyLower === 'ideology') {
      checkArg(walk, entry, { kind: 'scalar', accepts: ['ideology'] });
    } else if (!checkTableField(walk, entry, FOCUS_FIELDS)) {
      // Modifier keys and dynamic numeric keys (goods for RGO foci) both take numbers.
      requireNumericValue(walk, entry);
    }
  });
}
