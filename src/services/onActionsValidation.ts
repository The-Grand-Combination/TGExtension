import { ON_ACTION_KEYS } from '../data/commonStructure.js';
import type { Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import { didYouMean } from './suggestions.js';
import { checkArg, report, type Walk } from './validationWalker.js';

/** common/on_actions.txt — `<hook> = { <weight> = <event id> }`. */
export function validateOnActionsFile(walk: Walk, document: Document): void {
  for (const action of blockKeysOf(document)) {
    const keyLower = action.key.value.toLowerCase();
    if (!ON_ACTION_KEYS.has(keyLower)) {
      report(
        walk,
        action,
        'unknown-on-action',
        `Unknown on_actions hook '${action.key.value}' — the engine will never fire it.${didYouMean(keyLower, ON_ACTION_KEYS)}`,
      );
    }
    const block = asBlock(action.value);
    for (const entry of block?.entries ?? []) {
      if (entry.kind === 'assignment') {
        checkArg(walk, entry, { kind: 'scalar', accepts: ['event'] });
      }
    }
  }
}
