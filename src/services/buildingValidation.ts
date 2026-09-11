import { BUILDING_FIELDS } from '../data/commonStructure.js';
import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import {
  checkKeyedNumberMap,
  checkModifierValueField,
  checkTableField,
  eachAssignment,
  modifierKeyNames,
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
    if (checkTableField(walk, entry, BUILDING_FIELDS) || checkModifierValueField(walk, entry)) {
      return;
    }
    reportUnknownKey(walk, entry, 'unknown-building-field', 'building field', [
      ...Object.keys(BUILDING_FIELDS),
      ...modifierKeyNames(walk),
    ]);
  });
}

function checkNumberList(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'scalar' || entry.type !== 'number') {
      reportStrayEntry(walk, entry);
    }
  }
}
