import {
  DEFAULT_MAP_LIST_FIELDS,
  DEFAULT_MAP_SCALAR_FIELDS,
  POSITION_BLOCK_FIELDS,
  POSITION_SCALAR_FIELDS,
  POSITION_XY_FIELDS,
  TERRAIN_CATEGORY_FIELDS,
  TERRAIN_PALETTE_FIELDS,
} from '../data/mapStructure.js';
import type { Assignment, Block, Document, Scalar } from '../model/ast.js';
import { asBlock, blockKeysOf, firstByKey, scalarValueOf } from '../model/astQuery.js';
import { diagnostic, type DiagnosticSeverity } from '../model/diagnostic.js';
import type { FileType } from '../model/fileType.js';
import type { Range } from '../model/range.js';
import { checkModifierField } from './modifierFileValidation.js';
import { hasIdentifier } from './modIndex.js';
import { didYouMean } from './suggestions.js';
import {
  checkColorBlock,
  checkTableField,
  isEmptyCategory,
  report,
  reportStrayEntry,
  requireBlockValue,
  requireNumericValue,
  walkBlockValue,
  type Walk,
} from './validationWalker.js';

/**
 * Validators for the Paradox-script files under map/. Grammars follow the NCE
 * parser (parser_defs.txt: default_map_file, region_file, continent_file,
 * climate_file, terrain_file, positions_file).
 */
export function validateMapFile(walk: Walk, document: Document, fileType: FileType): void {
  switch (fileType) {
    case 'mapDefault':
      validateDefaultMap(walk, document);
      break;
    case 'mapRegion':
      validateRegionFile(walk, document);
      break;
    case 'mapContinent':
      validateContinentFile(walk, document);
      break;
    case 'mapClimate':
      validateClimateFile(walk, document);
      break;
    case 'mapTerrain':
      validateTerrainFile(walk, document);
      break;
    case 'mapPositions':
      validatePositionsFile(walk, document);
      break;
    default:
      break;
  }
}

const WHOLE_NUMBER = /^\d+$/;

function push(walk: Walk, severity: DiagnosticSeverity, code: string, message: string, range: Range): void {
  walk.diagnostics.push(diagnostic(severity, code, message, range));
}

/**
 * Range and existence checks for a province id (NCE: ids at or above
 * max_provinces are errors; unknown ids are dead references).
 */
function checkKnownProvince(
  walk: Walk,
  scalar: Scalar,
  maxProvinces: number | undefined = walk.index.maxProvinces,
): boolean {
  if (!WHOLE_NUMBER.test(scalar.value)) {
    push(walk, 'error', 'invalid-value', `'${scalar.value}' is not a province id.`, scalar.range);
    return false;
  }
  if (maxProvinces !== undefined && Number(scalar.value) >= maxProvinces) {
    push(
      walk,
      'error',
      'province-id-too-large',
      `Province id ${scalar.value} is too large: default.map sets max_provinces = ${String(maxProvinces)}, so ids must be below that.`,
      scalar.range,
    );
    return false;
  }
  if (!isEmptyCategory(walk, 'province') && !hasIdentifier(walk.index, 'province', scalar.value)) {
    push(
      walk,
      'error',
      'unknown-province',
      `Province ${scalar.value} is not defined in map/definition.csv.`,
      scalar.range,
    );
    return false;
  }
  return true;
}

function reportListEntry(walk: Walk, entry: Assignment | Block, listName: string): void {
  if (entry.kind === 'assignment') {
    report(walk, entry, 'unknown-field', `'${entry.key.value}' is not allowed here: ${listName} lists province ids only.`);
  } else {
    reportStrayEntry(walk, entry);
  }
}

// --- default.map -----------------------------------------------------------------

function validateDefaultMap(walk: Walk, document: Document): void {
  const maxText = scalarValueOf(document.entries, 'max_provinces');
  if (maxText === undefined) {
    push(walk, 'error', 'missing-field', "default.map has no 'max_provinces'.", document.range);
  }
  const maxProvinces = maxText !== undefined && WHOLE_NUMBER.test(maxText) ? Number(maxText) : undefined;
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'sea_starts') {
      walkBlockValue(walk, entry, (list) => { validateSeaStarts(walk, list, maxProvinces); });
    } else if (DEFAULT_MAP_LIST_FIELDS.has(keyLower)) {
      walkBlockValue(walk, entry, (list) => { requireNumberList(walk, list); });
    } else if (!checkTableField(walk, entry, DEFAULT_MAP_SCALAR_FIELDS)) {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in default.map.`);
    }
  }
}

function validateSeaStarts(walk: Walk, list: Block, maxProvinces: number | undefined): void {
  const seen = new Set<string>();
  for (const entry of list.entries) {
    if (entry.kind !== 'scalar') {
      reportListEntry(walk, entry, 'sea_starts');
      continue;
    }
    if (!checkKnownProvince(walk, entry, maxProvinces)) {
      continue;
    }
    if (seen.has(entry.value)) {
      push(walk, 'warning', 'duplicate-province', `Province ${entry.value} is listed twice in sea_starts.`, entry.range);
    }
    seen.add(entry.value);
  }
}

function requireNumberList(walk: Walk, list: Block): void {
  for (const entry of list.entries) {
    if (entry.kind !== 'scalar') {
      reportStrayEntry(walk, entry);
    } else if (entry.type !== 'number') {
      push(walk, 'error', 'invalid-value', `'${entry.value}' is not a number.`, entry.range);
    }
  }
}

// --- region.txt / region_sea.txt / super_region.txt ----------------------------------

function validateRegionFile(walk: Walk, document: Document): void {
  const seaFile = walk.currentFile?.toLowerCase().endsWith('region_sea.txt') ?? false;
  for (const state of blockKeysOf(document)) {
    walkBlockValue(walk, state, (block) => { validateStateBlock(walk, state, block, seaFile); });
  }
}

function validateStateBlock(walk: Walk, state: Assignment, block: Block, seaFile: boolean): void {
  const seen = new Set<string>();
  const provinces: Scalar[] = [];
  for (const entry of block.entries) {
    if (entry.kind !== 'scalar') {
      reportListEntry(walk, entry, `'${state.key.value}'`);
      continue;
    }
    if (!checkKnownProvince(walk, entry)) {
      continue;
    }
    if (seen.has(entry.value)) {
      push(walk, 'warning', 'duplicate-province', `Province ${entry.value} is listed twice in '${state.key.value}'.`, entry.range);
      continue;
    }
    seen.add(entry.value);
    provinces.push(entry);
    if (!seaFile && walk.index.seaProvinces.has(entry.value)) {
      push(walk, 'warning', 'sea-province-in-state', `Province ${entry.value} is a sea zone (default.map sea_starts) but is listed in state '${state.key.value}'.`, entry.range);
    }
  }
  checkMixedState(walk, state, provinces);
}

/**
 * NCE splits a block that mixes already-assigned and unassigned provinces: the
 * unassigned ones become a new state and the rest only join a meta-region.
 */
function checkMixedState(walk: Walk, state: Assignment, provinces: readonly Scalar[]): void {
  const stateLower = state.key.value.toLowerCase();
  const ownerOf = (scalar: Scalar): string | undefined => {
    const owner = walk.index.stateOfProvince.get(scalar.value);
    return owner !== undefined && owner !== stateLower ? owner : undefined;
  };
  const claimed = provinces.filter((scalar) => ownerOf(scalar) !== undefined);
  if (claimed.length === 0 || claimed.length === provinces.length) {
    return;
  }
  for (const scalar of claimed) {
    push(
      walk,
      'warning',
      'state-mixes-provinces',
      `Province ${scalar.value} already belongs to state '${ownerOf(scalar) ?? ''}'. '${state.key.value}' mixes assigned and unassigned provinces, so the engine splits it.`,
      scalar.range,
    );
  }
}

// --- continent.txt / climate.txt -------------------------------------------------------

type ProvinceOwners = Map<string, string>;

function validateContinentFile(walk: Walk, document: Document): void {
  const owners: ProvinceOwners = new Map();
  for (const continent of blockKeysOf(document)) {
    walkBlockValue(walk, continent, (block) => { validateContinentBody(walk, continent, block, owners); });
  }
}

function validateContinentBody(walk: Walk, continent: Assignment, block: Block, owners: ProvinceOwners): void {
  for (const entry of block.entries) {
    if (entry.kind === 'scalar') {
      claimProvince(walk, entry, continent, owners, 'continent');
    } else if (entry.kind === 'block') {
      reportStrayEntry(walk, entry);
    } else if (entry.key.value.toLowerCase() === 'provinces') {
      walkBlockValue(walk, entry, (list) => { validateProvinceList(walk, list, continent, owners, 'continent'); });
    } else {
      checkModifierField(walk, entry);
    }
  }
}

function validateProvinceList(
  walk: Walk,
  list: Block,
  owner: Assignment,
  owners: ProvinceOwners,
  kind: 'continent' | 'climate',
): void {
  for (const entry of list.entries) {
    if (entry.kind === 'scalar') {
      claimProvince(walk, entry, owner, owners, kind);
    } else {
      reportListEntry(walk, entry, "'provinces'");
    }
  }
}

/** Continents and climates are exclusive: NCE warns when a province is assigned twice. */
function claimProvince(
  walk: Walk,
  scalar: Scalar,
  owner: Assignment,
  owners: ProvinceOwners,
  kind: 'continent' | 'climate',
): void {
  if (!checkKnownProvince(walk, scalar)) {
    return;
  }
  const ownerLower = owner.key.value.toLowerCase();
  const previous = owners.get(scalar.value);
  if (previous === undefined) {
    owners.set(scalar.value, ownerLower);
  } else if (previous === ownerLower) {
    push(walk, 'warning', 'duplicate-province', `Province ${scalar.value} is listed twice in '${owner.key.value}'.`, scalar.range);
  } else {
    push(walk, 'warning', 'province-already-assigned', `Province ${scalar.value} is already in ${kind} '${previous}'; the engine keeps the last assignment.`, scalar.range);
  }
}

function validateClimateFile(walk: Walk, document: Document): void {
  const owners: ProvinceOwners = new Map();
  for (const climate of blockKeysOf(document)) {
    walkBlockValue(walk, climate, (block) => { validateClimateBody(walk, climate, block, owners); });
  }
}

/** A climate may be split in two blocks: one with modifier values, one with province ids. */
function validateClimateBody(walk: Walk, climate: Assignment, block: Block, owners: ProvinceOwners): void {
  for (const entry of block.entries) {
    if (entry.kind === 'scalar') {
      claimProvince(walk, entry, climate, owners, 'climate');
    } else if (entry.kind === 'block') {
      reportStrayEntry(walk, entry);
    } else {
      checkModifierField(walk, entry);
    }
  }
}

// --- terrain.txt ----------------------------------------------------------------------

function validateTerrainFile(walk: Walk, document: Document): void {
  const categories = terrainCategoryNames(document);
  const paletteOwners = new Map<string, string>();
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'terrain') {
      requireNumericValue(walk, entry);
    } else if (keyLower === 'categories') {
      walkBlockValue(walk, entry, (block) => { validateTerrainCategories(walk, block); });
    } else {
      walkBlockValue(walk, entry, (block) => { validatePaletteEntry(walk, entry, block, categories, paletteOwners); });
    }
  }
}

/** Every terrain.bmp index a palette entry maps (`name = { color = { N ... } }`), for the map audit. */
export function terrainPaletteIndices(document: Document): Set<number> {
  const indices = new Set<number>();
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment' || entry.value.kind !== 'block') {
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'categories') {
      continue;
    }
    const color = firstByKey(entry.value.entries, 'color');
    const list = color ? asBlock(color.value) : undefined;
    for (const item of list?.entries ?? []) {
      if (item.kind === 'scalar' && WHOLE_NUMBER.test(item.value)) {
        indices.add(Number(item.value));
      }
    }
  }
  return indices;
}

function terrainCategoryNames(document: Document): Set<string> {
  const categories = firstByKey(document.entries, 'categories');
  const block = categories ? asBlock(categories.value) : undefined;
  return new Set(block ? blockKeysOf(block).map((category) => category.key.value.toLowerCase()) : []);
}

function validateTerrainCategories(walk: Walk, block: Block): void {
  for (const category of block.entries) {
    if (category.kind !== 'assignment') {
      reportStrayEntry(walk, category);
      continue;
    }
    walkBlockValue(walk, category, (body) => { validateTerrainCategory(walk, body); });
  }
}

function validateTerrainCategory(walk: Walk, body: Block): void {
  for (const entry of body.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
    } else if (entry.key.value.toLowerCase() === 'color') {
      checkColorBlock(walk, entry);
    } else if (!checkTableField(walk, entry, TERRAIN_CATEGORY_FIELDS)) {
      checkModifierField(walk, entry);
    }
  }
}

/** `name = { type = <category> color = { <indices> } priority has_texture }` (NCE palette_definition). */
function validatePaletteEntry(
  walk: Walk,
  palette: Assignment,
  block: Block,
  categories: ReadonlySet<string>,
  paletteOwners: Map<string, string>,
): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (keyLower === 'type') {
      checkPaletteType(walk, entry, categories);
    } else if (keyLower === 'color') {
      walkBlockValue(walk, entry, (list) => { checkPaletteIndices(walk, palette, list, paletteOwners); });
    } else if (!checkTableField(walk, entry, TERRAIN_PALETTE_FIELDS)) {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in terrain palette entry '${palette.key.value}'.`);
    }
  }
}

function checkPaletteType(walk: Walk, entry: Assignment, categories: ReadonlySet<string>): void {
  if (entry.value.kind !== 'scalar') {
    report(walk, entry, 'expected-value', "'type' expects a terrain category name.");
    return;
  }
  const typeLower = entry.value.value.toLowerCase();
  if (!categories.has(typeLower)) {
    push(
      walk,
      'error',
      'unknown-terrain',
      `Unknown terrain '${entry.value.value}': not defined in this file's categories.${didYouMean(typeLower, categories)}`,
      entry.value.range,
    );
  }
}

/** terrain.bmp palette indices are 0-255; each index maps to one terrain type. */
function checkPaletteIndices(walk: Walk, palette: Assignment, list: Block, paletteOwners: Map<string, string>): void {
  for (const entry of list.entries) {
    if (entry.kind !== 'scalar') {
      reportStrayEntry(walk, entry);
      continue;
    }
    if (!WHOLE_NUMBER.test(entry.value) || Number(entry.value) > 255) {
      push(walk, 'error', 'invalid-value', `'${entry.value}' is not a palette index (whole number 0-255).`, entry.range);
      continue;
    }
    const previous = paletteOwners.get(entry.value);
    if (previous !== undefined) {
      push(walk, 'warning', 'duplicate-palette-index', `Palette index ${entry.value} is already mapped by '${previous}'.`, entry.range);
    } else {
      paletteOwners.set(entry.value, palette.key.value);
    }
  }
}

// --- positions.txt --------------------------------------------------------------------

function validatePositionsFile(walk: Walk, document: Document): void {
  const seen = new Set<string>();
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    if (!WHOLE_NUMBER.test(entry.key.value)) {
      report(walk, entry, 'unknown-field', `'${entry.key.value}' is not a province id: positions.txt holds one block per province id.`);
      continue;
    }
    if (!checkKnownProvince(walk, entry.key)) {
      continue;
    }
    if (seen.has(entry.key.value)) {
      push(walk, 'warning', 'duplicate-province', `Province ${entry.key.value} has two position blocks; the engine keeps the last.`, entry.key.range);
    }
    seen.add(entry.key.value);
    walkBlockValue(walk, entry, (block) => { validatePositionBody(walk, block); });
  }
}

function validatePositionBody(walk: Walk, block: Block): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (checkTableField(walk, entry, POSITION_SCALAR_FIELDS)) {
      continue;
    }
    if (keyLower === 'text_position') {
      walkBlockValue(walk, entry, (pair) => { validateXyPair(walk, pair); });
    } else if (POSITION_BLOCK_FIELDS.has(keyLower)) {
      requireBlockValue(walk, entry);
    } else {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in a province position.`);
    }
  }
}

function validateXyPair(walk: Walk, pair: Block): void {
  for (const entry of pair.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
    } else if (!checkTableField(walk, entry, POSITION_XY_FIELDS)) {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in 'text_position' (expected x and y).`);
    }
  }
}
