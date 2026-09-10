import { BOOKMARK_FIELDS } from '../data/commonStructure.js';
import type { Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { checkTableField, eachAssignment, report, walkBlockValue, type Walk } from './validationWalker.js';

/** common/bookmarks.txt — `bookmark = { date name desc camerax cameray }` blocks. */
export function validateBookmarksFile(walk: Walk, document: Document): void {
  for (const entry of blockKeysOf(document)) {
    if (entry.key.value.toLowerCase() !== 'bookmark') {
      report(walk, entry, 'unknown-field', `bookmarks.txt only holds 'bookmark' blocks.`);
      continue;
    }
    walkBlockValue(walk, entry, (block) => {
      eachAssignment(walk, block.entries, (field) => {
        if (!checkTableField(walk, field, BOOKMARK_FIELDS)) {
          report(walk, field, 'unknown-field', `Unknown bookmark field '${field.key.value}'.`);
        }
      });
    });
  }
}
