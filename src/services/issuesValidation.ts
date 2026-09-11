import { ISSUE_OPTION_FIELDS, OPTION_RULES_KEYS } from '../data/commonStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import {
  checkArg,
  checkModifierValueField,
  checkTableField,
  eachAssignment,
  modifierKeyNames,
  report,
  reportUnknownKey,
  walkBlockValue,
  walkEffectEntries,
  walkTriggerEntries,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/** common/issues.txt — `<category> = { <class> = { <option> = { ... } } }`. */
export function validateIssuesFile(walk: Walk, document: Document): void {
  for (const category of blockKeysOf(document)) {
    const categoryBlock = asBlock(category.value);
    if (!categoryBlock) {
      continue;
    }
    for (const issueClass of blockKeysOf(categoryBlock)) {
      const classBlock = asBlock(issueClass.value);
      if (!classBlock) {
        continue;
      }
      for (const option of blockKeysOf(classBlock)) {
        const optionBlock = asBlock(option.value);
        if (optionBlock) {
          eachAssignment(walk, optionBlock.entries, (entry) => { handleIssueOptionField(walk, entry); });
        }
      }
    }
  }
}

/** Option fields are mostly modifier values; `allow` and `on_execute` carry
 *  country-scope triggers/effects. */
function handleIssueOptionField(walk: Walk, entry: Assignment): void {
  const keyLower = entry.key.value.toLowerCase();
  if (keyLower === 'allow') {
    walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, 'country'); });
    return;
  }
  if (keyLower === 'on_execute') {
    walkBlockValue(walk, entry, (block) => { walkOnExecuteBlock(walk, block); });
    return;
  }
  if (keyLower === 'rules') {
    walkBlockValue(walk, entry, (block) => { checkOptionRules(walk, block); });
    return;
  }
  if (keyLower === 'vote_modifiers') {
    walkBlockValue(walk, entry, (block) => { walkVoteModifiers(walk, block); });
    return;
  }
  if (checkTableField(walk, entry, ISSUE_OPTION_FIELDS) || checkModifierValueField(walk, entry)) {
    return;
  }
  reportUnknownKey(walk, entry, 'unknown-issue-option-field', 'issue option field', [
    ...Object.keys(ISSUE_OPTION_FIELDS),
    ...modifierKeyNames(walk),
  ]);
}

/** Per-option voting weights: country-scope value modifiers. */
function walkVoteModifiers(walk: Walk, block: Block): void {
  for (const modifier of block.entries) {
    if (modifier.kind === 'assignment') {
      walkBlockValue(walk, modifier, (weight) => { walkWeightBlock(walk, weight, 'country'); });
    }
  }
}

function checkOptionRules(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (rule) => {
    if (!OPTION_RULES_KEYS.has(rule.key.value.toLowerCase())) {
      reportUnknownKey(walk, rule, 'unknown-rule', 'rule', OPTION_RULES_KEYS);
      return;
    }
    checkArg(walk, rule, { kind: 'scalar', accepts: ['yesno'] });
  });
}

function walkOnExecuteBlock(walk: Walk, body: Block): void {
  eachAssignment(walk, body.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'trigger') {
      walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, 'country'); });
    } else if (keyLower === 'effect') {
      walkBlockValue(walk, entry, (block) => { walkEffectEntries(walk, block.entries, 'country'); });
    } else {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in 'on_execute'.`);
    }
  });
}
