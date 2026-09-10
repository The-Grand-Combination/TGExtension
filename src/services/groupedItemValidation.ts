import {
  GOOD_FIELDS,
  IDEOLOGY_FIELDS,
  IDEOLOGY_WEIGHT_FIELDS,
  RELIGION_FIELDS,
} from '../data/commonStructure.js';
import type { Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import type { FieldTable } from '../model/symbols.js';
import {
  checkColorBlock,
  checkTableField,
  eachAssignment,
  report,
  walkBlockValue,
  walkWeightBlock,
  type Walk,
} from './validationWalker.js';

/**
 * The group → item files under common/: religion.txt, goods.txt, and
 * ideologies.txt (NCE religion_def / good / ideology).
 */

export function validateReligionsFile(walk: Walk, document: Document): void {
  validateGroupedItems(walk, document, (item) => {
    validateColorAndTable(walk, item, RELIGION_FIELDS, 'unknown-religion-field');
  });
}

export function validateGoodsFile(walk: Walk, document: Document): void {
  validateGroupedItems(walk, document, (item) => {
    validateColorAndTable(walk, item, GOOD_FIELDS, 'unknown-good-field');
  });
}

export function validateIdeologiesFile(walk: Walk, document: Document): void {
  validateGroupedItems(walk, document, (item) => { validateIdeologyBody(walk, item); });
}

function validateGroupedItems(walk: Walk, document: Document, visitItem: (item: Block) => void): void {
  for (const group of blockKeysOf(document)) {
    walkBlockValue(walk, group, (groupBlock) => {
      eachAssignment(walk, groupBlock.entries, (item) => { walkBlockValue(walk, item, visitItem); });
    });
  }
}

function validateColorAndTable(walk: Walk, block: Block, table: FieldTable, code: string): void {
  eachAssignment(walk, block.entries, (entry) => {
    if (entry.key.value.toLowerCase() === 'color') {
      checkColorBlock(walk, entry);
    } else if (!checkTableField(walk, entry, table)) {
      report(walk, entry, code, `Unknown field '${entry.key.value}'.`);
    }
  });
}

function validateIdeologyBody(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (entry) => {
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'color') {
      checkColorBlock(walk, entry);
    } else if (IDEOLOGY_WEIGHT_FIELDS.has(keyLower)) {
      // Reform desires are country-scope value modifiers (NCE ideology_condition).
      walkBlockValue(walk, entry, (body) => { walkWeightBlock(walk, body, 'country'); });
    } else if (!checkTableField(walk, entry, IDEOLOGY_FIELDS)) {
      report(walk, entry, 'unknown-ideology-field', `Unknown ideology field '${entry.key.value}'.`);
    }
  });
}
