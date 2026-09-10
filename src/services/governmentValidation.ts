import { GOVERNMENT_FIELDS } from '../data/commonStructure.js';
import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import {
  checkArg,
  checkTableField,
  eachAssignment,
  isEmptyCategory,
  reportUnknownKey,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

/** common/governments.txt — fixed fields plus `<ideology> = yes/no` toggles. */
export function validateGovernmentsFile(walk: Walk, document: Document): void {
  for (const government of blockKeysOf(document)) {
    walkBlockValue(walk, government, (block) => { validateGovernmentBody(walk, block); });
  }
}

function validateGovernmentBody(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (entry) => {
    if (checkTableField(walk, entry, GOVERNMENT_FIELDS)) {
      return;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (isEmptyCategory(walk, 'ideology') || hasIdentifier(walk.index, 'ideology', keyLower)) {
      checkArg(walk, entry, { kind: 'scalar', accepts: ['yesno'] });
      return;
    }
    reportUnknownKey(walk, entry, 'unknown-government-field', 'government field', [
      ...Object.keys(GOVERNMENT_FIELDS),
      ...namesOf(walk.index, 'ideology'),
    ]);
  });
}
