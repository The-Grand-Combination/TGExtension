import type { Document, Entry } from '../model/ast.js';
import { checkColorBlock, type Walk } from './validationWalker.js';

/** Untyped common/ files (unit definitions, defines, ...) still get every
 *  `color = { r g b }` definition checked, at any depth. */
export function validateCommonOtherFile(walk: Walk, document: Document): void {
  checkColorAssignments(walk, document.entries);
}

function checkColorAssignments(walk: Walk, entries: readonly Entry[]): void {
  for (const entry of entries) {
    if (entry.kind === 'block') {
      checkColorAssignments(walk, entry.entries);
      continue;
    }
    if (entry.kind !== 'assignment') {
      continue;
    }
    if (entry.key.value.toLowerCase() === 'color') {
      checkColorBlock(walk, entry);
    } else if (entry.value.kind === 'block') {
      checkColorAssignments(walk, entry.value.entries);
    }
  }
}
