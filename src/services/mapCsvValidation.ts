import { ADJACENCY_TYPES } from '../data/mapStructure.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import type { FileType } from '../model/fileType.js';
import type { Range } from '../model/range.js';
import type { ModIndex } from '../model/modIndex.js';
import { csvRows, type CsvField, type CsvRow } from '../parser/csv.js';
import { hasIdentifier } from './modIndex.js';
import { didYouMean } from './suggestions.js';

/**
 * Validators for map/definition.csv and map/adjacencies.csv, following NCE
 * read_map_colors / read_map_adjacency. CSV files never go through the script
 * parser, so this works on the raw text and reports document offsets.
 */
export function validateMapCsv(text: string, fileType: FileType, index: ModIndex): Diagnostic[] {
  switch (fileType) {
    case 'mapDefinition':
      return validateDefinitionCsv(text, index);
    case 'mapAdjacencies':
      return validateAdjacenciesCsv(text, index);
    default:
      return [];
  }
}

const WHOLE_NUMBER = /^\d+$/;
const INTEGER = /^-?\d+$/;

function spanning(first: CsvField, last: CsvField): Range {
  return { start: first.range.start, end: last.range.end };
}

class CsvDiagnostics {
  readonly items: Diagnostic[] = [];

  constructor(private readonly index: ModIndex) {}

  error(code: string, message: string, range: Range): void {
    this.items.push(diagnostic('error', code, message, range));
  }

  warning(code: string, message: string, range: Range): void {
    this.items.push(diagnostic('warning', code, message, range));
  }

  /** Range and existence checks for a province id field already known to be a whole number. */
  checkKnownProvince(field: CsvField): boolean {
    const max = this.index.maxProvinces;
    if (max !== undefined && Number(field.text) >= max) {
      this.error(
        'province-id-too-large',
        `Province id ${field.text} is too large: default.map sets max_provinces = ${String(max)}, so ids must be below that.`,
        field.range,
      );
      return false;
    }
    const provinces = this.index.identifiers.get('province');
    if (provinces !== undefined && provinces.size > 0 && !hasIdentifier(this.index, 'province', field.text)) {
      this.error('unknown-province', `Province ${field.text} is not defined in map/definition.csv.`, field.range);
      return false;
    }
    return true;
  }
}

// --- definition.csv ---------------------------------------------------------------

/** `id;red;green;blue;name;x`. An empty id is a dead row (lakes); id 0 is skipped by the engine. */
function validateDefinitionCsv(text: string, index: ModIndex): Diagnostic[] {
  const out = new CsvDiagnostics(index);
  const colorOwners = new Map<string, string>();
  for (const row of csvRows(text, { skipHeader: true })) {
    const [id, red, green, blue] = row.fields;
    if (!id || !red || !green || !blue) {
      out.error('csv-too-few-fields', 'Expected at least four fields: id;red;green;blue;name;x.', row.range);
      continue;
    }
    if (id.text === '') {
      continue;
    }
    if (!WHOLE_NUMBER.test(id.text)) {
      out.error('invalid-value', `Province id '${id.text}' must be a whole number.`, id.range);
      continue;
    }
    if (Number(id.text) === 0) {
      continue;
    }
    const max = index.maxProvinces;
    const tooLarge = max !== undefined && Number(id.text) >= max;
    if (tooLarge) {
      out.error(
        'province-id-too-large',
        `Province id ${id.text} is too large: default.map sets max_provinces = ${String(max)}, so ids must be below that.`,
        id.range,
      );
    }
    checkDefinitionColor(out, id, [red, green, blue], colorOwners);
    if (!tooLarge) {
      checkProvincePlacement(out, id, index);
    }
  }
  return out.items;
}

/**
 * A land province belongs to one climate and to a state: without the first it
 * carries no climate modifier, and without the second the engine leaves it out
 * of every state, so it can never be owned, developed or traded with. Sea
 * provinces are in neither file. A stack that carries no climate.txt or no
 * region.txt at all says nothing here — that is a missing file, not 3000 broken
 * provinces.
 */
function checkProvincePlacement(out: CsvDiagnostics, id: CsvField, index: ModIndex): void {
  if (index.seaProvinces.has(id.text)) {
    return;
  }
  if (index.climateOfProvince.size > 0 && !index.climateOfProvince.has(id.text)) {
    out.error(
      'province-without-climate',
      `Province ${id.text} is in no climate: add it to a block of map/climate.txt.`,
      id.range,
    );
  }
  if (index.stateOfProvince.size > 0 && !index.stateOfProvince.has(id.text)) {
    out.error(
      'province-without-state',
      `Province ${id.text} is in no state: add it to a region of map/region.txt.`,
      id.range,
    );
  }
  if (index.continentOfProvince.size > 0 && !index.continentOfProvince.has(id.text)) {
    out.error(
      'province-without-continent',
      `Province ${id.text} is on no continent: add it to a block of map/continent.txt. ` +
        'On none of them it matches no `continent` trigger, and nothing scoped by continent reaches it.',
      id.range,
    );
  }
}

function checkDefinitionColor(
  out: CsvDiagnostics,
  id: CsvField,
  components: readonly [CsvField, CsvField, CsvField],
  colorOwners: Map<string, string>,
): void {
  let valid = true;
  for (const component of components) {
    if (!WHOLE_NUMBER.test(component.text) || Number(component.text) > 255) {
      out.error('invalid-color', `Color component '${component.text}' must be a whole number 0-255.`, component.range);
      valid = false;
    }
  }
  if (!valid) {
    return;
  }
  const key = components.map((component) => String(Number(component.text))).join(',');
  const previous = colorOwners.get(key);
  if (previous !== undefined) {
    out.error(
      'duplicate-color',
      `Color ${key} is already used by province ${previous}; provinces.bmp pixels of this color map to one province only.`,
      spanning(components[0], components[2]),
    );
  } else {
    colorOwners.set(key, id.text);
  }
}

// --- adjacencies.csv ---------------------------------------------------------------

/** `From;To;Type;Through;Data;Comment`. */
function validateAdjacenciesCsv(text: string, index: ModIndex): Diagnostic[] {
  const out = new CsvDiagnostics(index);
  for (const row of csvRows(text, { skipHeader: true })) {
    const [from, to, type, through, data] = row.fields;
    if (!from || !to || !type || !through || !data) {
      out.error('csv-too-few-fields', 'Expected at least five fields: From;To;Type;Through;Data;Comment.', row.range);
      continue;
    }
    if (from.text === '') {
      continue;
    }
    const fromId = parseInteger(out, from, 'From');
    const toId = parseInteger(out, to, 'To');
    if (fromId === undefined || toId === undefined || fromId <= 0) {
      continue;
    }
    const typeLower = type.text.toLowerCase();
    if (toId <= 0) {
      checkImpassableRow(out, row, from, typeLower);
      continue;
    }
    out.checkKnownProvince(from);
    out.checkKnownProvince(to);
    if (!ADJACENCY_TYPES.has(typeLower)) {
      out.error(
        'unknown-adjacency-type',
        `Unknown adjacency type '${type.text}': expected sea, land, impassable, or canal.${didYouMean(typeLower, ADJACENCY_TYPES)}`,
        type.range,
      );
    } else if (typeLower === 'sea') {
      checkSeaThrough(out, through);
    } else if (typeLower === 'canal') {
      checkCanalRow(out, through, data);
    }
  }
  return out.items;
}

function parseInteger(out: CsvDiagnostics, field: CsvField, column: string): number | undefined {
  if (!INTEGER.test(field.text)) {
    out.error('invalid-value', `'${column}' must be a province id, got '${field.text}'.`, field.range);
    return undefined;
  }
  return Number(field.text);
}

/** With no `To` province, only `impassable` means something (it marks `From` impassable). */
function checkImpassableRow(out: CsvDiagnostics, row: CsvRow, from: CsvField, typeLower: string): void {
  if (typeLower === 'impassable') {
    out.checkKnownProvince(from);
  } else {
    out.warning(
      'ignored-adjacency',
      "This row is ignored by the engine: 'To' must be a province id unless Type is impassable.",
      row.range,
    );
  }
}

/**
 * A strait crossing is controlled by the province in `Through`. Whether that
 * province is in `sea_starts` is not checked: mods route straits through land
 * deliberately.
 */
function checkSeaThrough(out: CsvDiagnostics, through: CsvField): void {
  if (!WHOLE_NUMBER.test(through.text) || Number(through.text) === 0) {
    return;
  }
  out.checkKnownProvince(through);
}

/** Canals need the canal province in `Through` and a canal id (1-based) in `Data`. */
function checkCanalRow(out: CsvDiagnostics, through: CsvField, data: CsvField): void {
  if (!WHOLE_NUMBER.test(through.text) || Number(through.text) === 0) {
    out.error('invalid-canal', "Canal rows need the canal's province id in the 'Through' column.", through.range);
  } else {
    out.checkKnownProvince(through);
  }
  if (!WHOLE_NUMBER.test(data.text) || Number(data.text) === 0) {
    out.error('invalid-canal', "Canal rows need a canal id above 0 in the 'Data' column.", data.range);
  }
}
