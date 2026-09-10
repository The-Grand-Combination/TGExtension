import type { Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import { walkBlockValue, walkTriggerEntries, type Walk } from './validationWalker.js';

/**
 * news/<name>.txt — generator/priority/article scripts. The structure varies
 * and the engine ignores unknown blocks, so only the `trigger` blocks are
 * validated (country scope with the news comparison triggers).
 */
export function validateNewsFile(walk: Walk, document: Document): void {
  for (const top of blockKeysOf(document)) {
    const block = asBlock(top.value);
    if (block) {
      walkNewsBlock(walk, block);
    }
  }
}

function walkNewsBlock(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    if (entry.key.value.toLowerCase() === 'trigger') {
      walkBlockValue(walk, entry, (body) => { walkTriggerEntries(walk, body.entries, 'country'); });
    } else if (entry.value.kind === 'block') {
      walkNewsBlock(walk, entry.value);
    }
  }
}
