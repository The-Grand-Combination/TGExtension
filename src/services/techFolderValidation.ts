import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { checkModifierBody } from './modifierFileValidation.js';
import { eachAssignment, report, requireBlockValue, walkBlockValue, type Walk } from './validationWalker.js';

/** common/technology.txt — `folders` (bare tech lists) and `schools` (modifier bodies). */
export function validateTechFoldersFile(walk: Walk, document: Document): void {
  for (const section of blockKeysOf(document)) {
    const keyLower = section.key.value.toLowerCase();
    if (keyLower === 'folders') {
      walkBlockValue(walk, section, (block) => { validateTechFolderList(walk, block); });
    } else if (keyLower === 'schools') {
      walkBlockValue(walk, section, (block) => { validateTechSchools(walk, block); });
    } else {
      report(walk, section, 'unknown-field', `technology.txt only holds 'folders' and 'schools'.`);
    }
  }
}

function validateTechFolderList(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (folder) => { requireBlockValue(walk, folder); });
}

function validateTechSchools(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (school) => {
    walkBlockValue(walk, school, (body) => { checkModifierBody(walk, body); });
  });
}
