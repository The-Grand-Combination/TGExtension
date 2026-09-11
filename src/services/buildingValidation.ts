import { BUILDING_FIELDS } from '../data/commonStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import {
  checkKeyedNumberMap,
  checkModifierValueField,
  checkTableField,
  eachAssignment,
  modifierKeyNames,
  report,
  reportStrayEntry,
  reportUnknownKey,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

/** common/buildings.txt — one block per building (NCE building_definition). */
export function validateBuildingsFile(walk: Walk, document: Document): void {
  for (const building of blockKeysOf(document)) {
    walkBlockValue(walk, building, (block) => { validateBuildingBody(walk, block); });
  }
}

function validateBuildingBody(walk: Walk, block: Block): void {
  const modifiers: Assignment[] = [];
  eachAssignment(walk, block.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'goods_cost') {
      walkBlockValue(walk, entry, (body) => { checkKeyedNumberMap(walk, body, 'good'); });
      return;
    }
    if (keyLower === 'colonial_points') {
      walkBlockValue(walk, entry, (body) => { checkNumberList(walk, body); });
      return;
    }
    if (checkTableField(walk, entry, BUILDING_FIELDS)) {
      return;
    }
    if (checkModifierValueField(walk, entry)) {
      modifiers.push(entry);
      return;
    }
    reportUnknownKey(walk, entry, 'unknown-building-field', 'building field', [
      ...Object.keys(BUILDING_FIELDS),
      ...modifierKeyNames(walk),
    ]);
  });
  reportOverriddenModifiers(walk, modifiers);
}

/**
 * The engine keeps one modifier per building: a later one replaces the earlier,
 * so every modifier but the last is dead code.
 */
function reportOverriddenModifiers(walk: Walk, modifiers: readonly Assignment[]): void {
  const last = modifiers[modifiers.length - 1];
  if (last === undefined || modifiers.length < 2) {
    return;
  }
  for (const overridden of modifiers.slice(0, -1)) {
    report(
      walk,
      overridden,
      'multiple-building-modifiers',
      `A building takes only one modifier: '${overridden.key.value}' has no effect because '${last.key.value}' is the last one and the only one that applies.`,
    );
  }
}

function checkNumberList(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'scalar' || entry.type !== 'number') {
      reportStrayEntry(walk, entry);
    }
  }
}
