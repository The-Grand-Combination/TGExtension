import { CB_BODY_FIELDS, CB_EFFECT_FIELDS, CB_TRIGGER_FIELDS } from '../data/cbTypeStructure.js';
import type { Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import { diagnostic } from '../model/diagnostic.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import { didYouMean } from './suggestions.js';
import {
  eachAssignment,
  reportUnknownKey,
  walkBlockValue,
  walkEffectEntries,
  walkTriggerEntries,
  type Walk,
} from './validationWalker.js';

/** common/cb_types.txt — one block per casus belli, plus the `peace_order` list. */
export function validateCbTypeFile(walk: Walk, document: Document): void {
  for (const assignment of blockKeysOf(document)) {
    const block = asBlock(assignment.value);
    if (!block) {
      continue;
    }
    if (assignment.key.value.toLowerCase() === 'peace_order') {
      checkPeaceOrder(walk, block);
    } else {
      validateCbBody(walk, block);
    }
  }
}

function checkPeaceOrder(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'scalar') {
      continue;
    }
    const nameLower = entry.value.toLowerCase();
    if (!hasIdentifier(walk.index, 'cbType', nameLower)) {
      walk.diagnostics.push(
        diagnostic(
          'error',
          'unknown-cbtype',
          `Unknown casus belli '${entry.value}' in peace_order.${didYouMean(nameLower, namesOf(walk.index, 'cbType'))}`,
          entry.range,
        ),
      );
    }
  }
}

function validateCbBody(walk: Walk, body: Block): void {
  eachAssignment(walk, body.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    const triggerScope = CB_TRIGGER_FIELDS[keyLower];
    if (triggerScope) {
      walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, triggerScope); });
      return;
    }
    const effectScope = CB_EFFECT_FIELDS[keyLower];
    if (effectScope) {
      walkBlockValue(walk, entry, (block) => { walkEffectEntries(walk, block.entries, effectScope); });
      return;
    }
    if (!CB_BODY_FIELDS.has(keyLower)) {
      reportUnknownKey(walk, entry, 'unknown-cb-field', 'casus belli field', [
        ...CB_BODY_FIELDS,
        ...Object.keys(CB_TRIGGER_FIELDS),
        ...Object.keys(CB_EFFECT_FIELDS),
      ]);
    }
  });
}
