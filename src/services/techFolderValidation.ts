import { REQUIRED_TECH_FOLDERS } from '../data/technologyStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import { diagnostic } from '../model/diagnostic.js';
import { range, type Range } from '../model/range.js';
import { checkModifierBody } from './modifierFileValidation.js';
import { eachAssignment, report, requireBlockValue, walkBlockValue, type Walk } from './validationWalker.js';

/** common/technology.txt — `folders` (bare tech lists) and `schools` (modifier bodies). */
export function validateTechFoldersFile(walk: Walk, document: Document): void {
  let folders: Assignment | undefined;
  for (const section of blockKeysOf(document)) {
    const keyLower = section.key.value.toLowerCase();
    if (keyLower === 'folders') {
      folders = section;
      walkBlockValue(walk, section, (block) => { validateTechFolderList(walk, block); });
    } else if (keyLower === 'schools') {
      walkBlockValue(walk, section, (block) => { validateTechSchools(walk, block); });
    } else {
      report(walk, section, 'unknown-field', `technology.txt only holds 'folders' and 'schools'.`);
    }
  }
  checkRequiredFolders(walk, document, folders);
}

/**
 * The engine hardcodes `army_tech` and `navy_tech`; without them it cannot
 * resolve army/navy research and the mod fails to load.
 */
function checkRequiredFolders(walk: Walk, document: Document, folders: Assignment | undefined): void {
  const declared = declaredFolderNames(folders);
  const missing = REQUIRED_TECH_FOLDERS.filter((name) => !declared.has(name));
  if (missing.length === 0) {
    return;
  }
  const named = missing.map((name) => `'${name}'`).join(' and ');
  walk.diagnostics.push(
    diagnostic(
      'error',
      'missing-tech-folder',
      `technology.txt must define the tech folder ${named}; the game hardcodes it and will not load without it.`,
      folders?.key.range ?? documentStart(document),
    ),
  );
}

function declaredFolderNames(folders: Assignment | undefined): ReadonlySet<string> {
  const block = folders ? asBlock(folders.value) : undefined;
  return new Set(block ? blockKeysOf(block).map((folder) => folder.key.value.toLowerCase()) : []);
}

/** No `folders` section to point at, so the finding lands on the first entry. */
function documentStart(document: Document): Range {
  const first = document.entries[0];
  return first ? first.range : range(0, 0);
}

function validateTechFolderList(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (folder) => { requireBlockValue(walk, folder); });
}

function validateTechSchools(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (school) => {
    walkBlockValue(walk, school, (body) => { checkModifierBody(walk, body); });
  });
}
