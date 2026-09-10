import {
  REBEL_BODY_FIELDS,
  REBEL_EFFECT_FIELDS,
  REBEL_TRIGGER_FIELDS,
  REBEL_WEIGHT_FIELDS,
} from '../data/rebelTypeStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import {
  checkArg,
  eachAssignment,
  isEmptyCategory,
  reportUnknownKey,
  walkBlockValue,
  walkEffectEntries,
  walkTriggerEntries,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/** common/rebel_types.txt — one block per rebel type (NCE rebel_body). */
export function validateRebelTypeFile(walk: Walk, document: Document): void {
  for (const rebel of blockKeysOf(document)) {
    const block = asBlock(rebel.value);
    if (block) {
      validateRebelBody(walk, block);
    }
  }
}

function validateRebelBody(walk: Walk, body: Block): void {
  eachAssignment(walk, body.entries, (entry) => {
    if (!handleRebelField(walk, entry)) {
      reportUnknownKey(walk, entry, 'unknown-rebel-field', 'rebel type field', [
        ...REBEL_BODY_FIELDS,
        ...Object.keys(REBEL_WEIGHT_FIELDS),
        ...Object.keys(REBEL_TRIGGER_FIELDS),
        ...Object.keys(REBEL_EFFECT_FIELDS),
        'government',
        'ideology',
      ]);
    }
  });
}

function handleRebelField(walk: Walk, entry: Assignment): boolean {
  const keyLower = entry.key.value.toLowerCase();
  const weightScope = REBEL_WEIGHT_FIELDS[keyLower];
  if (weightScope) {
    walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, weightScope); });
    return true;
  }
  const triggerScope = REBEL_TRIGGER_FIELDS[keyLower];
  if (triggerScope) {
    walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, triggerScope); });
    return true;
  }
  const effectScope = REBEL_EFFECT_FIELDS[keyLower];
  if (effectScope) {
    walkBlockValue(walk, entry, (block) => { walkEffectEntries(walk, block.entries, effectScope); });
    return true;
  }
  if (keyLower === 'government') {
    walkBlockValue(walk, entry, (block) => { checkGovernmentMap(walk, block); });
    return true;
  }
  if (keyLower === 'ideology') {
    checkArg(walk, entry, { kind: 'scalar', accepts: ['ideology'] });
    return true;
  }
  return REBEL_BODY_FIELDS.has(keyLower);
}

/** Rebel `government` maps current government → government installed on win. */
function checkGovernmentMap(walk: Walk, block: Block): void {
  if (isEmptyCategory(walk, 'government')) {
    return;
  }
  eachAssignment(walk, block.entries, (entry) => {
    if (!hasIdentifier(walk.index, 'government', entry.key.value.toLowerCase())) {
      reportUnknownKey(walk, entry, 'unknown-government', 'government', namesOf(walk.index, 'government'));
    }
    checkArg(walk, entry, { kind: 'scalar', accepts: ['government'] });
  });
}
