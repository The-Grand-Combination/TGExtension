import {
  DECISION_BODY_FIELDS,
  DECISION_EFFECT_FIELDS,
  DECISION_TRIGGER_FIELDS,
  EVENT_LOC_FIELDS,
} from '../data/eventStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf, findByKey } from '../model/astQuery.js';
import { diagnostic } from '../model/diagnostic.js';
import { hasIdentifier } from './modIndex.js';
import {
  checkLocKey,
  checkPicture,
  eachAssignment,
  isEmptyCategory,
  report,
  walkBlockValue,
  walkEffectEntries,
  walkTriggerEntries,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/** decisions/<name>.txt — `political_decisions = { <name> = { ... } }`. */
export function validateDecisionFile(walk: Walk, document: Document): void {
  const seenNames = new Set<string>();
  for (const wrapper of findByKey(document.entries, 'political_decisions')) {
    const wrapperBlock = asBlock(wrapper.value);
    if (!wrapperBlock) {
      continue;
    }
    for (const decision of blockKeysOf(wrapperBlock)) {
      const block = asBlock(decision.value);
      if (block) {
        checkDecisionDuplicate(walk, decision, seenNames);
        checkDecisionLocKeys(walk, decision);
        validateDecisionBody(walk, block);
      }
    }
  }
}

/**
 * A decision name must be unique across the whole mod. Earlier definitions in
 * this file and definitions in other files (from the index) both count.
 */
function checkDecisionDuplicate(walk: Walk, decision: Assignment, seenNames: Set<string>): void {
  const nameLower = decision.key.value.toLowerCase();
  const occurrences = walk.index.decisionOccurrences.get(nameLower) ?? [];
  const places = [
    ...new Set(
      occurrences
        .filter((occurrence) => occurrence.filePath !== walk.currentFile)
        .map((occurrence) => occurrence.filePath),
    ),
  ];
  if (seenNames.has(nameLower)) {
    places.unshift('this file');
  }
  seenNames.add(nameLower);
  if (places.length > 0) {
    walk.diagnostics.push(
      diagnostic(
        'error',
        'duplicate-decision-name',
        `Decision '${decision.key.value}' is also defined in ${places.join(', ')}.`,
        decision.key.range,
      ),
    );
  }
}

function checkDecisionLocKeys(walk: Walk, decision: Assignment): void {
  if (isEmptyCategory(walk, 'locKey')) {
    return;
  }
  const nameLower = decision.key.value.toLowerCase();
  for (const suffix of ['_title', '_desc']) {
    const locKey = `${nameLower}${suffix}`;
    if (!hasIdentifier(walk.index, 'locKey', locKey)) {
      walk.diagnostics.push(
        diagnostic(
          'warning',
          'missing-localisation',
          `Localisation key '${locKey}' (derived from the decision name) was not found in localisation/.`,
          decision.key.range,
        ),
      );
    }
  }
}

function validateDecisionBody(walk: Walk, body: Block): void {
  eachAssignment(walk, body.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (DECISION_BODY_FIELDS.has(keyLower)) {
      if (keyLower === 'picture') {
        checkPicture(walk, entry, 'decisionPicture');
      } else if (EVENT_LOC_FIELDS.has(keyLower)) {
        checkLocKey(walk, entry);
      }
      return;
    }
    if (DECISION_TRIGGER_FIELDS.has(keyLower)) {
      walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, 'country'); });
    } else if (DECISION_EFFECT_FIELDS.has(keyLower)) {
      walkBlockValue(walk, entry, (block) => { walkEffectEntries(walk, block.entries, 'country'); });
    } else if (keyLower === 'ai_will_do') {
      walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, 'country'); });
    } else {
      report(walk, entry, 'unknown-decision-field', `Unknown decision field '${entry.key.value}'.`);
    }
  });
}
