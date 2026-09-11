import {
  COUNTRY_HISTORY_FIELDS,
  DIPLOMACY_RELATION_FIELDS,
  DIPLOMACY_RELATION_KEYS,
  OOB_LEADER_FIELDS,
  OOB_RELATIONSHIP_FIELDS,
  OOB_SHIP_FIELDS,
  POP_HISTORY_FIELDS,
  PROVINCE_HISTORY_FIELDS,
  REFORM_EFFECT_KEYS,
  WAR_BLOCK_FIELDS,
  WAR_GOAL_FIELDS,
} from '../data/historyStructure.js';
import type { Assignment, Block, Document, Entry } from '../model/ast.js';
import type { FileType } from '../model/fileType.js';
import type { FieldTable } from '../model/symbols.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import { didYouMean } from './suggestions.js';
import {
  checkArg,
  checkKeyedNumberMap,
  checkReformOption,
  checkTableField,
  DATE_PATTERN,
  isEmptyCategory,
  report,
  reportBrokenEffect,
  reportStrayEntry,
  requireNumericValue,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

/** Dispatch for the history/ subfolders (NCE *_history_file grammars). */
export function validateHistoryFile(walk: Walk, document: Document, fileType: FileType): void {
  switch (fileType) {
    case 'historyCountry':
      validateCountryHistoryEntries(walk, document.entries);
      break;
    case 'historyProvince':
      validateProvinceHistoryEntries(walk, document.entries);
      break;
    case 'historyPops':
      validatePopsHistory(walk, document);
      break;
    case 'historyDiplomacy':
      validateDiplomacyHistory(walk, document);
      break;
    case 'historyUnits':
      validateOobEntries(walk, document.entries, true);
      break;
    case 'historyWars':
      validateWarHistory(walk, document);
      break;
    default:
      break;
  }
}

// --- history/countries ---------------------------------------------------------

function validateCountryHistoryEntries(walk: Walk, entries: readonly Entry[]): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      handleCountryHistoryField(walk, entry);
    } else {
      reportStrayEntry(walk, entry);
    }
  }
}

function handleCountryHistoryField(walk: Walk, entry: Assignment): void {
  const keyLower = entry.key.value.toLowerCase();
  if (checkTableField(walk, entry, COUNTRY_HISTORY_FIELDS)) {
    return;
  }
  if (keyLower === 'upper_house') {
    walkBlockValue(walk, entry, (block) => { checkKeyedNumberMap(walk, block, 'ideology'); });
    return;
  }
  if (keyLower === 'foreign_investment') {
    walkBlockValue(walk, entry, (block) => { checkKeyedNumberMap(walk, block, 'country'); });
    return;
  }
  if (keyLower === 'govt_flag') {
    checkArg(walk, entry, {
      kind: 'block',
      fields: {
        government: { accepts: ['government'], required: true },
        flag: { accepts: ['identifier'], required: true },
      },
    });
    return;
  }
  if (keyLower === 'scripted_govt_flag') {
    return;
  }
  if (keyLower === 'decision') {
    checkDecisionReference(walk, entry);
    return;
  }
  if (DATE_PATTERN.test(keyLower)) {
    walkBlockValue(walk, entry, (block) => { validateCountryHistoryEntries(walk, block.entries); });
    return;
  }
  if (handleDynamicCountryHistoryKey(walk, entry, keyLower)) {
    return;
  }
  report(
    walk,
    entry,
    'unknown-country-history-key',
    `Unknown country history key '${entry.key.value}'.${didYouMean(keyLower, [...Object.keys(COUNTRY_HISTORY_FIELDS), ...REFORM_EFFECT_KEYS, ...namesOf(walk.index, 'reformClass'), ...namesOf(walk.index, 'technology')])}`,
  );
}

/** Dynamic keys: `<tech|invention> = 1`, `<reform/issue class> = <option>`, `<kind>_reform = <option>`. */
function handleDynamicCountryHistoryKey(walk: Walk, entry: Assignment, keyLower: string): boolean {
  if (hasIdentifier(walk.index, 'technology', keyLower) || hasIdentifier(walk.index, 'invention', keyLower)) {
    checkArg(walk, entry, { kind: 'scalar', accepts: ['number', 'yesno'] });
    return true;
  }
  if (REFORM_EFFECT_KEYS.has(keyLower)) {
    checkArg(walk, entry, { kind: 'scalar', accepts: ['reformOption'] });
    return true;
  }
  if (hasIdentifier(walk.index, 'reformClass', keyLower)) {
    checkReformOption(walk, entry, keyLower);
    return true;
  }
  return false;
}

function checkDecisionReference(walk: Walk, entry: Assignment): void {
  if (entry.value.kind !== 'scalar' || walk.index.decisionOccurrences.size === 0) {
    return;
  }
  const nameLower = entry.value.value.toLowerCase();
  if (!walk.index.decisionOccurrences.has(nameLower)) {
    report(
      walk,
      entry,
      'unknown-decision',
      `Unknown decision '${entry.value.value}'.${didYouMean(nameLower, [...walk.index.decisionOccurrences.keys()])}`,
    );
  }
}

// --- history/provinces -----------------------------------------------------------

function validateProvinceHistoryEntries(walk: Walk, entries: readonly Entry[]): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      handleProvinceHistoryField(walk, entry);
    } else {
      reportStrayEntry(walk, entry);
    }
  }
}

/** `owner = ---` / `= null`: the province starts uncolonized, so no tag is looked up. */
const NO_OWNER_VALUES: ReadonlySet<string> = new Set(['---', 'null']);
const OWNERSHIP_FIELDS: ReadonlySet<string> = new Set(['owner', 'controller']);

function handleProvinceHistoryField(walk: Walk, entry: Assignment): void {
  const keyLower = entry.key.value.toLowerCase();
  if (
    OWNERSHIP_FIELDS.has(keyLower) &&
    entry.value.kind === 'scalar' &&
    NO_OWNER_VALUES.has(entry.value.value.toLowerCase())
  ) {
    return;
  }
  if (reportBrokenEffect(walk, entry, keyLower)) {
    return;
  }
  if (checkTableField(walk, entry, PROVINCE_HISTORY_FIELDS)) {
    return;
  }
  if (keyLower === 'party_loyalty') {
    checkArg(walk, entry, {
      kind: 'block',
      fields: {
        ideology: { accepts: ['ideology'], required: true },
        loyalty_value: { accepts: ['number'], required: true },
      },
    });
    return;
  }
  if (keyLower === 'state_building') {
    checkArg(walk, entry, {
      kind: 'block',
      fields: {
        level: { accepts: ['number'], required: false },
        building: { accepts: ['building'], required: true },
        upgrade: { accepts: ['yesno'], required: false },
      },
    });
    return;
  }
  if (keyLower === 'revolt' || keyLower === 'rgo_distribution') {
    return;
  }
  if (DATE_PATTERN.test(keyLower)) {
    walkBlockValue(walk, entry, (block) => { validateProvinceHistoryEntries(walk, block.entries); });
    return;
  }
  if (hasIdentifier(walk.index, 'building', keyLower)) {
    requireNumericValue(walk, entry);
    return;
  }
  report(
    walk,
    entry,
    'unknown-province-history-key',
    `Unknown province history key '${entry.key.value}'.${didYouMean(keyLower, [...Object.keys(PROVINCE_HISTORY_FIELDS), ...namesOf(walk.index, 'building')])}`,
  );
}

// --- history/pops ----------------------------------------------------------------

function validatePopsHistory(walk: Walk, document: Document): void {
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const key = entry.key.value;
    if (!/^\d+$/.test(key) || !hasIdentifier(walk.index, 'province', key)) {
      report(walk, entry, 'unknown-province', `Unknown province id '${key}'.`);
    }
    walkBlockValue(walk, entry, (block) => { validateProvincePops(walk, block); });
  }
}

function validateProvincePops(walk: Walk, block: Block): void {
  for (const pop of block.entries) {
    if (pop.kind !== 'assignment') {
      continue;
    }
    const typeLower = pop.key.value.toLowerCase();
    if (!isEmptyCategory(walk, 'popType') && !hasIdentifier(walk.index, 'popType', typeLower)) {
      report(
        walk,
        pop,
        'unknown-poptype',
        `Unknown pop type '${pop.key.value}'.${didYouMean(typeLower, namesOf(walk.index, 'popType'))}`,
      );
    }
    walkBlockValue(walk, pop, (body) => {
      for (const field of body.entries) {
        if (field.kind !== 'assignment') {
          continue;
        }
        if (!checkTableField(walk, field, POP_HISTORY_FIELDS)) {
          report(walk, field, 'unknown-field', `Unknown pop field '${field.key.value}'.`);
        }
      }
    });
  }
}

// --- history/diplomacy -----------------------------------------------------------

function validateDiplomacyHistory(walk: Walk, document: Document): void {
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (!DIPLOMACY_RELATION_KEYS.has(keyLower)) {
      report(
        walk,
        entry,
        'unknown-diplomacy-key',
        `Unknown diplomacy relation '${entry.key.value}'.${didYouMean(keyLower, DIPLOMACY_RELATION_KEYS)}`,
      );
      continue;
    }
    walkBlockValue(walk, entry, (block) => {
      for (const field of block.entries) {
        if (field.kind !== 'assignment') {
          continue;
        }
        if (!checkTableField(walk, field, DIPLOMACY_RELATION_FIELDS)) {
          report(walk, field, 'unknown-field', `Unknown field '${field.key.value}' in '${entry.key.value}'.`);
        }
      }
    });
  }
}

// --- history/units (orders of battle) ---------------------------------------------

function validateOobEntries(walk: Walk, entries: readonly Entry[], topLevel: boolean): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      handleOobField(walk, entry, topLevel);
    } else {
      reportStrayEntry(walk, entry);
    }
  }
}

function handleOobField(walk: Walk, entry: Assignment, topLevel: boolean): void {
  const keyLower = entry.key.value.toLowerCase();
  if (keyLower === 'leader') {
    checkFieldBlock(walk, entry, OOB_LEADER_FIELDS);
    return;
  }
  if (keyLower === 'army' || keyLower === 'navy') {
    walkBlockValue(walk, entry, (block) => { validateOobForce(walk, block); });
    return;
  }
  if (topLevel && (keyLower === 'ai' || hasIdentifier(walk.index, 'country', keyLower))) {
    if (keyLower !== 'ai') {
      checkFieldBlock(walk, entry, OOB_RELATIONSHIP_FIELDS);
    }
    return;
  }
  report(walk, entry, 'unknown-oob-key', `Unknown order-of-battle key '${entry.key.value}'.`);
}

function validateOobForce(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'name') {
      continue;
    }
    if (keyLower === 'location') {
      checkArg(walk, entry, { kind: 'scalar', accepts: ['province'] });
    } else if (keyLower === 'regiment' || keyLower === 'ship') {
      checkFieldBlock(walk, entry, OOB_SHIP_FIELDS);
    } else if (keyLower === 'leader') {
      checkFieldBlock(walk, entry, OOB_LEADER_FIELDS);
    } else if (keyLower === 'army' || keyLower === 'navy') {
      walkBlockValue(walk, entry, (inner) => { validateOobForce(walk, inner); });
    } else {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in army/navy.`);
    }
  }
}

// --- history/wars ------------------------------------------------------------------

function validateWarHistory(walk: Walk, document: Document): void {
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'name') {
      continue;
    }
    if (DATE_PATTERN.test(keyLower)) {
      walkBlockValue(walk, entry, (block) => { validateWarBlock(walk, block); });
      continue;
    }
    report(walk, entry, 'unknown-war-key', `Unknown war history key '${entry.key.value}' (expected a date block or 'name').`);
  }
}

function validateWarBlock(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'war_goal') {
      checkFieldBlock(walk, entry, WAR_GOAL_FIELDS);
      continue;
    }
    if (!checkTableField(walk, entry, WAR_BLOCK_FIELDS)) {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in a war block.`);
    }
  }
}

// --- shared -------------------------------------------------------------------------

function checkFieldBlock(walk: Walk, entry: Assignment, table: FieldTable): void {
  walkBlockValue(walk, entry, (block) => {
    for (const field of block.entries) {
      if (field.kind !== 'assignment') {
        continue;
      }
      if (!checkTableField(walk, field, table)) {
        report(walk, field, 'unknown-field', `Unknown field '${field.key.value}' in '${entry.key.value}'.`);
      }
    }
  });
}
