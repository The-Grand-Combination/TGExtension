import { PARTY_FIELDS } from '../data/commonStructure.js';
import type { Assignment, Block, Document } from '../model/ast.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import {
  checkArg,
  checkColorBlock,
  checkReformOption,
  checkTableField,
  eachAssignment,
  isEmptyCategory,
  report,
  reportUnknownKey,
  requireBlockValue,
  walkBlockValue,
  walkTriggerEntries,
  type Walk,
} from './validationWalker.js';

/** common/countries/<name>.txt — color, graphical culture, parties, unit names. */
export function validateCountryDefinitionFile(walk: Walk, document: Document): void {
  for (const entry of document.entries) {
    if (entry.kind === 'assignment') {
      handleCountryDefinitionField(walk, entry);
    }
  }
}

function handleCountryDefinitionField(walk: Walk, entry: Assignment): void {
  const keyLower = entry.key.value.toLowerCase();
  if (keyLower === 'color') {
    checkColorBlock(walk, entry);
    return;
  }
  if (keyLower === 'graphical_culture') {
    if (!isEmptyCategory(walk, 'graphicalCulture')) {
      checkArg(walk, entry, { kind: 'scalar', accepts: ['graphicalCulture'] });
    }
    return;
  }
  if (keyLower === 'template') {
    return;
  }
  if (keyLower === 'party') {
    walkBlockValue(walk, entry, (block) => { validatePartyBody(walk, block); });
    return;
  }
  if (keyLower === 'unit_names') {
    walkBlockValue(walk, entry, (block) => { validateUnitNames(walk, block); });
    return;
  }
  if (entry.value.kind === 'block') {
    // Any other block-valued key is a government-specific color override.
    checkColorBlock(walk, entry);
    return;
  }
  report(walk, entry, 'unknown-country-def-field', `Unknown country definition field '${entry.key.value}'.`);
}

function validatePartyBody(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (field) => {
    const fieldLower = field.key.value.toLowerCase();
    if (fieldLower === 'trigger') {
      walkBlockValue(walk, field, (body) => { walkTriggerEntries(walk, body.entries, 'country'); });
      return;
    }
    if (checkTableField(walk, field, PARTY_FIELDS)) {
      return;
    }
    if (hasIdentifier(walk.index, 'reformClass', fieldLower)) {
      checkReformOption(walk, field, fieldLower);
      return;
    }
    reportUnknownKey(walk, field, 'unknown-party-field', 'party field', [
      ...Object.keys(PARTY_FIELDS),
      ...namesOf(walk.index, 'reformClass'),
    ]);
  });
}

function validateUnitNames(walk: Walk, block: Block): void {
  eachAssignment(walk, block.entries, (unit) => {
    const unitLower = unit.key.value.toLowerCase();
    if (!isEmptyCategory(walk, 'unit') && !hasIdentifier(walk.index, 'unit', unitLower)) {
      reportUnknownKey(walk, unit, 'unknown-unit', 'unit type', namesOf(walk.index, 'unit'));
    }
    requireBlockValue(walk, unit);
  });
}
