import { PRODUCTION_EMPLOYEE_FIELDS, PRODUCTION_TYPE_FIELDS } from '../data/commonStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { blockKeysOf } from '../model/astQuery.js';
import {
  checkKeyedNumberMap,
  checkTableField,
  eachAssignment,
  report,
  reportStrayEntry,
  reportUnknownKey,
  requireNumericValue,
  walkBlockValue,
  walkTriggerEntries,
  type Walk,
} from './validationWalker.js';

/** common/production_types.txt — one block per production type (NCE production_type). */
export function validateProductionTypesFile(walk: Walk, document: Document): void {
  for (const productionType of blockKeysOf(document)) {
    walkBlockValue(walk, productionType, (block) => {
      eachAssignment(walk, block.entries, (entry) => {
        if (!handleProductionTypeField(walk, entry)) {
          reportUnknownKey(
            walk,
            entry,
            'unknown-production-field',
            'production type field',
            Object.keys(PRODUCTION_TYPE_FIELDS),
          );
        }
      });
    });
  }
}

function handleProductionTypeField(walk: Walk, entry: Assignment): boolean {
  const keyLower = entry.key.value.toLowerCase();
  if (keyLower === 'owner') {
    walkBlockValue(walk, entry, (body) => { validateProductionEmployee(walk, body); });
    return true;
  }
  if (keyLower === 'employees') {
    walkBlockValue(walk, entry, (body) => { validateEmployeeSet(walk, body); });
    return true;
  }
  if (keyLower === 'efficiency' || keyLower === 'input_goods') {
    walkBlockValue(walk, entry, (body) => { checkKeyedNumberMap(walk, body, 'good'); });
    return true;
  }
  if (keyLower === 'bonus' || keyLower === 'input_bonus') {
    walkBlockValue(walk, entry, (body) => { validateProductionBonus(walk, body); });
    return true;
  }
  return checkTableField(walk, entry, PRODUCTION_TYPE_FIELDS);
}

/** `employees = { { poptype = ... } { ... } }` — a list of bare blocks. */
function validateEmployeeSet(walk: Walk, block: Block): void {
  for (const employee of block.entries) {
    if (employee.kind === 'block') {
      validateProductionEmployee(walk, employee);
    } else if (employee.kind === 'scalar') {
      reportStrayEntry(walk, employee);
    } else {
      report(walk, employee, 'unknown-field', `'employees' holds bare { ... } blocks, not assignments.`);
    }
  }
}

function validateProductionEmployee(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (field) => {
    if (!checkTableField(walk, field, PRODUCTION_EMPLOYEE_FIELDS)) {
      report(walk, field, 'unknown-field', `Unknown employee field '${field.key.value}'.`);
    }
  });
}

function validateProductionBonus(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (field) => {
    const fieldLower = field.key.value.toLowerCase();
    if (fieldLower === 'trigger') {
      // Production bonuses are evaluated per state (NCE make_production_bonus_trigger).
      walkBlockValue(walk, field, (body) => { walkTriggerEntries(walk, body.entries, 'state'); });
    } else if (fieldLower === 'value') {
      requireNumericValue(walk, field);
    } else {
      report(walk, field, 'unknown-field', `Unknown field '${field.key.value}' in a production bonus.`);
    }
  });
}
