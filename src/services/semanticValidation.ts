import type { Document } from '../model/ast.js';
import { asBlock, blockKeysOf, firstByKey } from '../model/astQuery.js';
import type { Diagnostic } from '../model/diagnostic.js';
import type { FileType } from '../model/fileType.js';
import type { FlagSets, ModIndex } from '../model/modIndex.js';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationOptions } from '../model/validationOptions.js';
import { validateBookmarksFile } from './bookmarkValidation.js';
import { validateBuildingsFile } from './buildingValidation.js';
import { validateCbTypeFile } from './cbTypeValidation.js';
import { validateCommonOtherFile } from './commonOtherValidation.js';
import { validateCountryColorsFile } from './countryColorsValidation.js';
import { validateCountryDefinitionFile } from './countryDefinitionValidation.js';
import { validateCountryListFile } from './countryListValidation.js';
import { validateCulturesFile } from './cultureValidation.js';
import { validateDecisionFile } from './decisionValidation.js';
import { validateEventFile } from './eventValidation.js';
import { validateGovernmentsFile } from './governmentValidation.js';
import { validateGoodsFile, validateIdeologiesFile, validateReligionsFile } from './groupedItemValidation.js';
import { validateHistoryFile } from './historyValidation.js';
import { validateIssuesFile } from './issuesValidation.js';
import { validateMapFile } from './mapValidation.js';
import { collectSetFlags } from './modIndex.js';
import {
  validateCrimesFile,
  validateEventModifiersFile,
  validateNationalValuesFile,
  validateStaticModifiersFile,
  validateTriggeredModifiersFile,
} from './modifierFileValidation.js';
import { validateNationalFocusFile } from './nationalFocusValidation.js';
import { validateNewsFile } from './newsValidation.js';
import { validateOnActionsFile } from './onActionsValidation.js';
import { validatePopChancesFile } from './popChanceValidation.js';
import { validatePopTypeFile } from './popTypeValidation.js';
import { validateProductionTypesFile } from './productionTypeValidation.js';
import { validateRebelTypeFile } from './rebelTypeValidation.js';
import { validateTechFoldersFile } from './techFolderValidation.js';
import { validateInventionFile, validateTechnologyFile } from './technologyValidation.js';
import { validateTraitsFile } from './traitValidation.js';
import { reportStrayEntry, type Walk } from './validationWalker.js';

/**
 * Scope- and mode-aware semantic validation of a Victoria 2 script file.
 * Requires the mod index; callers must skip this pass when no index exists.
 */
export function validateSemantics(
  document: Document,
  fileType: FileType,
  index: ModIndex,
  currentFile?: string,
  options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS,
): Diagnostic[] {
  const localFlags: FlagSets = { country: new Set(), global: new Set() };
  collectSetFlags(document.entries, localFlags);
  const walk: Walk = {
    index,
    diagnostics: [],
    localEventIdCounts: collectLocalEventIds(document),
    localFlags,
    currentFile,
    options,
  };
  FILE_VALIDATORS[fileType]?.(walk, document, fileType);
  checkTopLevelStrays(walk, document, fileType);
  return walk.diagnostics;
}

type FileValidator = (walk: Walk, document: Document, fileType: FileType) => void;

const FILE_VALIDATORS: Readonly<Partial<Record<FileType, FileValidator>>> = {
  event: validateEventFile,
  decision: validateDecisionFile,
  crime: validateCrimesFile,
  triggeredModifier: validateTriggeredModifiersFile,
  cbType: validateCbTypeFile,
  nationalFocus: validateNationalFocusFile,
  rebelType: validateRebelTypeFile,
  onActions: validateOnActionsFile,
  issues: validateIssuesFile,
  popType: validatePopTypeFile,
  technology: validateTechnologyFile,
  invention: validateInventionFile,
  newsScript: validateNewsFile,
  countryColors: validateCountryColorsFile,
  countryList: validateCountryListFile,
  cultures: validateCulturesFile,
  religions: validateReligionsFile,
  goods: validateGoodsFile,
  ideologies: validateIdeologiesFile,
  governments: validateGovernmentsFile,
  buildings: validateBuildingsFile,
  nationalValues: validateNationalValuesFile,
  eventModifiers: validateEventModifiersFile,
  staticModifiers: validateStaticModifiersFile,
  traits: validateTraitsFile,
  productionTypes: validateProductionTypesFile,
  bookmarks: validateBookmarksFile,
  popChances: validatePopChancesFile,
  techFolders: validateTechFoldersFile,
  countryDefinition: validateCountryDefinitionFile,
  commonOther: validateCommonOtherFile,
  historyCountry: validateHistoryFile,
  historyProvince: validateHistoryFile,
  historyPops: validateHistoryFile,
  historyDiplomacy: validateHistoryFile,
  historyUnits: validateHistoryFile,
  historyWars: validateHistoryFile,
  mapDefault: validateMapFile,
  mapRegion: validateMapFile,
  mapContinent: validateMapFile,
  mapClimate: validateMapFile,
  mapTerrain: validateMapFile,
  mapPositions: validateMapFile,
};

/** File types whose validators (or structure rules) already flag top-level
 *  non-assignments; everything else gets the generic check here. */
const TOP_LEVEL_STRAY_EXEMPT: ReadonlySet<FileType> = new Set([
  'event',
  'decision',
  'graphicalCulture',
  'popType',
  'historyCountry',
  'historyProvince',
  'historyPops',
  'historyDiplomacy',
  'historyUnits',
  'historyWars',
  'mapOther',
  'unknown',
]);

function checkTopLevelStrays(walk: Walk, document: Document, fileType: FileType): void {
  if (TOP_LEVEL_STRAY_EXEMPT.has(fileType)) {
    return;
  }
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
    }
  }
}

function collectLocalEventIds(document: Document): Map<string, number> {
  const counts = new Map<string, number>();
  for (const eventAssignment of blockKeysOf(document)) {
    const block = asBlock(eventAssignment.value);
    const id = block ? firstByKey(block.entries, 'id') : undefined;
    if (id?.value.kind === 'scalar') {
      counts.set(id.value.value, (counts.get(id.value.value) ?? 0) + 1);
    }
  }
  return counts;
}
