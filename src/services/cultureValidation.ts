import { CULTURE_FIELDS, CULTURE_GROUP_FIELDS } from '../data/commonStructure.js';
import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import {
  checkColorBlock,
  checkTableField,
  eachAssignment,
  report,
  requireBlockValue,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

/** common/cultures.txt — `<group> = { <fields> <culture> = { ... } }` (NCE culture_group). */
export function validateCulturesFile(walk: Walk, document: Document): void {
  for (const group of blockKeysOf(document)) {
    walkBlockValue(walk, group, (block) => { validateCultureGroup(walk, block); });
  }
}

function validateCultureGroup(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (entry) => {
    if (checkTableField(walk, entry, CULTURE_GROUP_FIELDS)) {
      return;
    }
    if (entry.value.kind === 'block') {
      validateCultureBody(walk, entry.value);
      return;
    }
    report(walk, entry, 'unknown-culture-field', `Unknown culture group field '${entry.key.value}'.`);
  });
}

function validateCultureBody(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'color') {
      checkColorBlock(walk, entry);
    } else if (keyLower === 'first_names' || keyLower === 'last_names') {
      requireBlockValue(walk, entry);
    } else if (!checkTableField(walk, entry, CULTURE_FIELDS)) {
      report(walk, entry, 'unknown-culture-field', `Unknown culture field '${entry.key.value}'.`);
    }
  });
}
