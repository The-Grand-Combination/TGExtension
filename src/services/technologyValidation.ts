import {
  INVENTION_EFFECT_SCALAR_FIELDS,
  TECH_GOODS_MAP_FIELDS,
  TECH_SCALAR_FIELDS,
  UNIT_MODIFIER_FIELDS,
  UNIT_MODIFIER_TARGETS,
} from '../data/technologyStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { asBlock, blockKeysOf } from '../model/astQuery.js';
import { hasIdentifier } from './modIndex.js';
import { didYouMean } from './suggestions.js';
import {
  checkKeyedNumberMap,
  checkTableField,
  isModifierKey,
  modifierKeyNames,
  reportBrokenModifier,
  report,
  reportStrayEntry,
  requireNumericValue,
  walkBlockValue,
  walkTriggerEntries,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/** technologies/<folder>.txt — one block per technology (NCE technology_contents). */
export function validateTechnologyFile(walk: Walk, document: Document): void {
  for (const technology of blockKeysOf(document)) {
    const block = asBlock(technology.value);
    if (!block) {
      continue;
    }
    for (const entry of block.entries) {
      if (entry.kind !== 'assignment') {
        reportStrayEntry(walk, entry);
        continue;
      }
      if (!handleTechnologyField(walk, entry)) {
        report(
          walk,
          entry,
          'unknown-tech-field',
          `Unknown technology field '${entry.key.value}'.${didYouMean(entry.key.value.toLowerCase(), [...Object.keys(TECH_SCALAR_FIELDS), ...modifierKeyNames(walk)])}`,
        );
      }
    }
  }
}

/** inventions/<folder>.txt — one block per invention (NCE invention_contents). */
export function validateInventionFile(walk: Walk, document: Document): void {
  for (const invention of blockKeysOf(document)) {
    const block = asBlock(invention.value);
    if (!block) {
      continue;
    }
    for (const entry of block.entries) {
      if (entry.kind !== 'assignment') {
        reportStrayEntry(walk, entry);
        continue;
      }
      if (!handleInventionField(walk, entry)) {
        report(
          walk,
          entry,
          'unknown-invention-field',
          `Unknown invention field '${entry.key.value}'.${didYouMean(entry.key.value.toLowerCase(), ['limit', 'chance', 'news', 'effect', ...modifierKeyNames(walk)])}`,
        );
      }
    }
  }
}

function handleInventionField(walk: Walk, entry: Assignment): boolean {
  const keyLower = entry.key.value.toLowerCase();
  if (keyLower === 'limit') {
    walkBlockValue(walk, entry, (block) => { walkTriggerEntries(walk, block.entries, 'country'); });
    return true;
  }
  if (keyLower === 'chance') {
    walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, 'country'); });
    return true;
  }
  if (keyLower === 'news') {
    return true;
  }
  if (keyLower === 'effect') {
    walkBlockValue(walk, entry, (block) => { validateInventionEffect(walk, block); });
    return true;
  }
  return handleTechnologyField(walk, entry);
}

function validateInventionEffect(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    if (handleInventionEffectField(walk, entry)) {
      continue;
    }
    report(
      walk,
      entry,
      'unknown-invention-effect',
      `Unknown invention effect field '${entry.key.value}'.${didYouMean(entry.key.value.toLowerCase(), [...Object.keys(INVENTION_EFFECT_SCALAR_FIELDS), ...modifierKeyNames(walk)])}`,
    );
  }
}

function handleInventionEffectField(walk: Walk, entry: Assignment): boolean {
  const keyLower = entry.key.value.toLowerCase();
  if (checkTableField(walk, entry, INVENTION_EFFECT_SCALAR_FIELDS)) {
    return true;
  }
  if (keyLower === 'rebel_org_gain') {
    checkRebelOrgGain(walk, entry);
    return true;
  }
  if (TECH_GOODS_MAP_FIELDS.has(keyLower)) {
    walkBlockValue(walk, entry, (block) => { checkKeyedNumberMap(walk, block, 'good'); });
    return true;
  }
  return handleModifierOrUnitField(walk, entry, keyLower);
}

function checkRebelOrgGain(walk: Walk, entry: Assignment): void {
  walkBlockValue(walk, entry, (block) => {
    for (const field of block.entries) {
      if (field.kind !== 'assignment') {
        continue;
      }
      const fieldLower = field.key.value.toLowerCase();
      if (fieldLower === 'value') {
        requireNumericValue(walk, field);
      } else if (fieldLower !== 'faction') {
        report(walk, field, 'unknown-field', `Unknown field '${field.key.value}' in 'rebel_org_gain'.`);
      }
    }
  });
}

function handleTechnologyField(walk: Walk, entry: Assignment): boolean {
  const keyLower = entry.key.value.toLowerCase();
  if (checkTableField(walk, entry, TECH_SCALAR_FIELDS)) {
    return true;
  }
  if (keyLower === 'ai_chance') {
    walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, 'country'); });
    return true;
  }
  if (TECH_GOODS_MAP_FIELDS.has(keyLower)) {
    walkBlockValue(walk, entry, (block) => { checkKeyedNumberMap(walk, block, 'good'); });
    return true;
  }
  return handleModifierOrUnitField(walk, entry, keyLower);
}

function handleModifierOrUnitField(walk: Walk, entry: Assignment, keyLower: string): boolean {
  if (isModifierKey(walk, keyLower)) {
    reportBrokenModifier(walk, entry, keyLower);
    requireNumericValue(walk, entry);
    return true;
  }
  // `max_<province building> = 1` raises the building cap (NCE tech any_value).
  if (keyLower.startsWith('max_') && hasIdentifier(walk.index, 'building', keyLower.slice(4))) {
    requireNumericValue(walk, entry);
    return true;
  }
  if (UNIT_MODIFIER_TARGETS.has(keyLower) || hasIdentifier(walk.index, 'unit', keyLower)) {
    walkBlockValue(walk, entry, (block) => { checkUnitModifierBlock(walk, block); });
    return true;
  }
  return false;
}

function checkUnitModifierBlock(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (!UNIT_MODIFIER_FIELDS.has(keyLower)) {
      report(
        walk,
        entry,
        'unknown-unit-modifier',
        `Unknown unit stat '${entry.key.value}'.${didYouMean(keyLower, UNIT_MODIFIER_FIELDS)}`,
      );
      continue;
    }
    requireNumericValue(walk, entry);
  }
}
