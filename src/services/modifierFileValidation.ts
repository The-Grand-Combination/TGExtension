import { STATIC_MODIFIER_NAMES } from '../data/commonStructure.js';
import { MODIFIER_KEYS } from '../data/modifierKeys.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import { didYouMean } from './suggestions.js';
import {
  checkArg,
  checkModifierValueField,
  eachAssignment,
  report,
  requireNumericValue,
  walkBlockValue,
  walkTriggerEntries,
  type Walk,
} from './validationWalker.js';

/**
 * The common/ files whose entries are modifier bodies: nationalvalues,
 * event_modifiers, static_modifiers, crime, and triggered_modifiers.
 */

/** A body whose fields are all modifier values (plus `icon`). */
export function checkModifierBody(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (entry) => { checkModifierField(walk, entry); });
}

/** One `modifier = number` field (NCE modifier_base, plus `icon`). */
export function checkModifierField(walk: Walk, entry: Assignment): void {
  if (entry.key.value.toLowerCase() === 'icon') {
    requireNumericValue(walk, entry);
    return;
  }
  if (!checkModifierValueField(walk, entry)) {
    report(
      walk,
      entry,
      'unknown-modifier-key',
      `Unknown modifier '${entry.key.value}'.${didYouMean(entry.key.value.toLowerCase(), MODIFIER_KEYS)}`,
    );
  }
}

export function validateNationalValuesFile(walk: Walk, document: Document): void {
  validateModifierBodies(walk, document);
}

export function validateEventModifiersFile(walk: Walk, document: Document): void {
  validateModifierBodies(walk, document);
}

function validateModifierBodies(walk: Walk, document: Document): void {
  for (const modifier of blockKeysOf(document)) {
    walkBlockValue(walk, modifier, (block) => { checkModifierBody(walk, block); });
  }
}

/** static_modifiers.txt: the engine reads a fixed set of names and nothing else. */
export function validateStaticModifiersFile(walk: Walk, document: Document): void {
  for (const modifier of blockKeysOf(document)) {
    const keyLower = modifier.key.value.toLowerCase();
    if (!STATIC_MODIFIER_NAMES.has(keyLower)) {
      report(
        walk,
        modifier,
        'unknown-static-modifier',
        `Unknown static modifier '${modifier.key.value}' — the engine only reads its fixed set.${didYouMean(keyLower, STATIC_MODIFIER_NAMES)}`,
      );
    }
    walkBlockValue(walk, modifier, (block) => { checkModifierBody(walk, block); });
  }
}

/** crime.txt: crime → modifier values + `active` + province-scope `trigger`. */
export function validateCrimesFile(walk: Walk, document: Document): void {
  for (const crime of blockKeysOf(document)) {
    walkBlockValue(walk, crime, (block) => { validateModifierWithTrigger(walk, block, 'province', true); });
  }
}

/** triggered_modifiers.txt: modifier values + country-scope `trigger`. */
export function validateTriggeredModifiersFile(walk: Walk, document: Document): void {
  for (const modifier of blockKeysOf(document)) {
    walkBlockValue(walk, modifier, (block) => { validateModifierWithTrigger(walk, block, 'country', false); });
  }
}

function validateModifierWithTrigger(
  walk: Walk,
  block: Block,
  triggerScope: 'province' | 'country',
  allowActive: boolean,
): void {
  eachAssignment(walk, block.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'trigger') {
      walkBlockValue(walk, entry, (body) => { walkTriggerEntries(walk, body.entries, triggerScope); });
    } else if (allowActive && keyLower === 'active') {
      checkArg(walk, entry, { kind: 'scalar', accepts: ['yesno'] });
    } else {
      checkModifierField(walk, entry);
    }
  });
}
