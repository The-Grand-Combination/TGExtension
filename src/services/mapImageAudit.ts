import {
  RIVER_LAND,
  RIVER_SEA,
  RIVERS_BMP_PALETTE,
  TERRAIN_BMP_PALETTE,
  TERRAIN_INDEX_LIMIT,
  TERRAIN_OCEAN,
  type Palette,
} from '../data/mapPalettes.js';
import type { DiagnosticSeverity } from '../model/diagnostic.js';
import { PROVINCES_BMP, RIVERS_BMP, TERRAIN_BMP, type MapFinding, type MapImageFile, type Pixel } from '../model/mapAudit.js';
import type { ModIndex } from '../model/modIndex.js';
import { csvRows } from '../parser/csv.js';
import { decodeBmp, formatRgb, indicesOf, type BmpImage } from './bmpDecoder.js';
import { paletteEquals, paletteOf } from './bmpPalette.js';
import { terrainPaletteIndices } from './mapValidation.js';
import { analyzeRivers } from './riverAnalysis.js';
import { yieldToEventLoop } from './scheduling.js';
import { parseDocument } from './syntaxValidation.js';

/** Reads the map files through the mod stack; injected so the audit stays testable. */
export interface MapImageSource {
  readText(relativePath: string): Promise<string | undefined>;
  readBytes(relativePath: string): Promise<Uint8Array | undefined>;
}

/** Rows scanned between two turns of the event loop. */
const ROWS_PER_CHUNK = 128;
/** Province id given to pixels whose color is a lake row of definition.csv (empty id). */
const LAKE = 0xffff;
const NO_PROVINCE = 0;

/**
 * Check provinces.bmp, terrain.bmp and rivers.bmp against each other and
 * against definition.csv, default.map and terrain.txt. The engine repairs or
 * ignores every one of these defects silently, so this is the only place a
 * modder sees them. Findings are ordered by file, then errors first, then by
 * position.
 */
export async function auditMapImages(source: MapImageSource, index: ModIndex): Promise<MapFinding[]> {
  const out = new Findings();
  const table = provinceTable((await source.readText('map/definition.csv')) ?? '', index);
  const provinces = await loadImage(source, PROVINCES_BMP, out);
  const terrain = await loadImage(source, TERRAIN_BMP, out);
  const rivers = await loadImage(source, RIVERS_BMP, out);
  checkIndexedImage(TERRAIN_BMP, terrain, provinces, TERRAIN_BMP_PALETTE, out);
  checkIndexedImage(RIVERS_BMP, rivers, provinces, RIVERS_BMP_PALETTE, out);
  if (provinces) {
    checkSizeMultiple(provinces, out);
  }
  if (provinces === undefined || provinces.bitsPerPixel === 8) {
    if (provinces?.bitsPerPixel === 8) {
      out.add(PROVINCES_BMP, 'error', 'bmp-unsupported', `${PROVINCES_BMP} is 8-bit; province colors need a 24-bit or 32-bit BMP.`);
    }
    return out.sorted();
  }
  const map = await provinceMapOf(provinces, table, out);
  if (terrain && sameSize(terrain, provinces) && terrain.bitsPerPixel === 8) {
    const mapped = terrainPaletteIndices(parseDocument((await source.readText('map/terrain.txt')) ?? '').document);
    await checkTerrain(indicesOf(terrain), map, table, mapped, out);
  }
  if (rivers && sameSize(rivers, provinces) && rivers.bitsPerPixel === 8) {
    await checkRivers(indicesOf(rivers), map, table, out);
  }
  return out.sorted();
}

/** Province id per pixel, top-down. */
interface ProvinceMap {
  readonly ids: Uint16Array;
  readonly width: number;
  readonly height: number;
}

// --- definition.csv -----------------------------------------------------------------

interface ProvinceTable {
  /** Packed `r<<16|g<<8|b` → province id; 0 when unknown, LAKE for lake rows. */
  readonly idByColor: Uint16Array;
  readonly names: ReadonlyMap<number, string>;
  readonly isSea: Uint8Array;
}

function provinceTable(definitionText: string, index: ModIndex): ProvinceTable {
  const idByColor = new Uint16Array(1 << 24);
  const names = new Map<number, string>();
  for (const row of csvRows(definitionText, { skipHeader: true })) {
    const [id, red, green, blue, name] = row.fields;
    const color = packColor(red?.text, green?.text, blue?.text);
    if (id === undefined || color === undefined) {
      continue;
    }
    if (id.text === '') {
      idByColor[color] = LAKE;
    } else if (/^\d+$/.test(id.text) && Number(id.text) > 0 && Number(id.text) < LAKE) {
      idByColor[color] = Number(id.text);
      names.set(Number(id.text), name?.text ?? '');
    }
  }
  const isSea = new Uint8Array(LAKE + 1);
  for (const sea of index.seaProvinces) {
    isSea[Number(sea)] = 1;
  }
  return { idByColor, names, isSea };
}

function packColor(red: string | undefined, green: string | undefined, blue: string | undefined): number | undefined {
  const parts = [red, green, blue].map((text) => (text !== undefined && /^\d+$/.test(text) ? Number(text) : -1));
  if (parts.some((part) => part < 0 || part > 255)) {
    return undefined;
  }
  return ((parts[0] ?? 0) << 16) | ((parts[1] ?? 0) << 8) | (parts[2] ?? 0);
}

function describeProvince(table: ProvinceTable, id: number): string {
  const name = table.names.get(id);
  return name ? `${String(id)} (${name})` : String(id);
}

// --- files and formats --------------------------------------------------------------

async function loadImage(source: MapImageSource, file: MapImageFile, out: Findings): Promise<BmpImage | undefined> {
  const bytes = await source.readBytes(file);
  if (bytes === undefined) {
    out.add(file, 'error', 'map-file-missing', `${file} is missing; the game needs all three map bitmaps.`);
    return undefined;
  }
  const decoded = decodeBmp(bytes);
  if (decoded.kind === 'error') {
    out.add(file, 'error', 'bmp-unsupported', `${file} cannot be read: ${decoded.reason}.`);
    return undefined;
  }
  return decoded.image;
}

function checkIndexedImage(
  file: MapImageFile,
  image: BmpImage | undefined,
  provinces: BmpImage | undefined,
  standard: Palette,
  out: Findings,
): void {
  if (image === undefined) {
    return;
  }
  if (image.bitsPerPixel !== 8) {
    out.add(file, 'error', 'bmp-unsupported', `${file} is ${String(image.bitsPerPixel)}-bit; the engine reads one palette index per pixel, so it must be an 8-bit BMP.`);
    return;
  }
  if (!paletteEquals(paletteOf(image), standard)) {
    out.add(file, 'error', 'nonstandard-palette', `${file} does not carry the standard palette; run Enforce Colormaps to rewrite it.`);
  }
  if (provinces && !sameSize(image, provinces)) {
    out.add(file, 'error', 'map-size-mismatch', `${file} is ${sizeOf(image)} but ${PROVINCES_BMP} is ${sizeOf(provinces)}; the three bitmaps must have the same size.`);
  }
}

/** The game only loads maps whose height is a multiple of this; the width is free. */
const HEIGHT_MULTIPLE = 144;

function checkSizeMultiple(provinces: BmpImage, out: Findings): void {
  const { height } = provinces;
  if (height % HEIGHT_MULTIPLE === 0) {
    return;
  }
  const below = height - (height % HEIGHT_MULTIPLE);
  out.add(PROVINCES_BMP, 'error', 'map-size-not-multiple', `${PROVINCES_BMP} is ${sizeOf(provinces)}; the game needs the height to be a multiple of ${String(HEIGHT_MULTIPLE)} (${String(height)} is not: ${String(below)} or ${String(below + HEIGHT_MULTIPLE)} would be).`);
}

function sameSize(left: BmpImage, right: BmpImage): boolean {
  return left.width === right.width && left.height === right.height;
}

function sizeOf(image: BmpImage): string {
  return `${String(image.width)}x${String(image.height)}`;
}

// --- provinces.bmp ------------------------------------------------------------------

/** Province id per pixel (top-down); reports unknown colors and provinces without pixels. */
async function provinceMapOf(image: BmpImage, table: ProvinceTable, out: Findings): Promise<ProvinceMap> {
  const { width, height } = image;
  const ids = new Uint16Array(width * height);
  const pixelCounts = new Uint32Array(LAKE + 1);
  const unknown = new Tallies();
  await forEachRowChunk(height, (y) => {
    for (let x = 0; x < width; x++) {
      const color = image.rgbAt(x, y);
      const id = table.idByColor[color] ?? NO_PROVINCE;
      ids[y * width + x] = id;
      pixelCounts[id] = (pixelCounts[id] ?? 0) + 1;
      if (id === NO_PROVINCE) {
        unknown.count(color, x, y);
      }
    }
  });
  for (const [color, tally] of unknown.entries()) {
    out.add(PROVINCES_BMP, 'error', 'unknown-color', `Color ${formatRgb(color)} covers ${pixels(tally.count)} (first at ${at(tally.first)}) and is not in map/definition.csv; the engine treats them as no province.`);
  }
  for (const [id] of table.names) {
    if (pixelCounts[id] === 0) {
      out.add(PROVINCES_BMP, 'warning', 'province-without-pixels', `Province ${describeProvince(table, id)} has no pixel in ${PROVINCES_BMP}; the engine places it at (0, 0) and gives it no terrain.`);
    }
  }
  return { ids, width, height };
}

// --- terrain.bmp --------------------------------------------------------------------

async function checkTerrain(
  terrain: Uint8Array,
  map: ProvinceMap,
  table: ProvinceTable,
  mapped: ReadonlySet<number>,
  out: Findings,
): Promise<void> {
  const { width } = map;
  const landOverOcean = new Tallies();
  const terrainOverSea = new Tallies();
  const unmapped = new Tallies();
  const noProvince = new Tallies();
  await forEachRowChunk(map.height, (y) => {
    for (let x = 0; x < width; x++) {
      const offset = y * width + x;
      const id = map.ids[offset] ?? NO_PROVINCE;
      const value = terrain[offset] ?? TERRAIN_OCEAN;
      if (id === LAKE) {
        continue;
      }
      if (id === NO_PROVINCE) {
        if (value < TERRAIN_INDEX_LIMIT) {
          noProvince.count(0, x, y);
        }
      } else if (table.isSea[id] === 1) {
        if (value < TERRAIN_INDEX_LIMIT) {
          terrainOverSea.count(id, x, y);
        }
      } else if (value === TERRAIN_OCEAN) {
        landOverOcean.count(id, x, y);
      } else if (value >= TERRAIN_INDEX_LIMIT || !mapped.has(value)) {
        unmapped.count(value, x, y);
      }
    }
  });
  reportTerrain(table, { landOverOcean, terrainOverSea, unmapped, noProvince }, out);
}

interface TerrainTallies {
  readonly landOverOcean: Tallies;
  readonly terrainOverSea: Tallies;
  readonly unmapped: Tallies;
  readonly noProvince: Tallies;
}

function reportTerrain(table: ProvinceTable, tallies: TerrainTallies, out: Findings): void {
  for (const [id, tally] of tallies.landOverOcean.entries()) {
    out.add(TERRAIN_BMP, 'warning', 'land-over-ocean-terrain', `Province ${describeProvince(table, id)} has ${pixels(tally.count)} over ocean terrain (index ${String(TERRAIN_OCEAN)}), first at ${at(tally.first)}.`, tally.first);
  }
  for (const [id, tally] of tallies.terrainOverSea.entries()) {
    out.add(TERRAIN_BMP, 'warning', 'terrain-over-sea', `Sea province ${describeProvince(table, id)} has ${pixels(tally.count)} of land terrain (index below ${String(TERRAIN_INDEX_LIMIT)}), first at ${at(tally.first)}.`, tally.first);
  }
  for (const [value, tally] of tallies.unmapped.entries()) {
    const reason =
      value >= TERRAIN_INDEX_LIMIT
        ? `indices ${String(TERRAIN_INDEX_LIMIT)}-253 are not terrains and the engine paints them as plains`
        : `map/terrain.txt has no entry with color = { ${String(value)} }, so those provinces get no terrain from the bitmap`;
    out.add(TERRAIN_BMP, 'error', 'terrain-index-unmapped', `Index ${String(value)} covers ${pixels(tally.count)} of land (first at ${at(tally.first)}) but ${reason}.`, tally.first);
  }
  for (const tally of tallies.noProvince.values()) {
    out.add(TERRAIN_BMP, 'warning', 'terrain-without-province', `${pixels(tally.count)} of land terrain (first at ${at(tally.first)}) have no province in ${PROVINCES_BMP}.`, tally.first);
  }
}

// --- rivers.bmp ---------------------------------------------------------------------

async function checkRivers(rivers: Uint8Array, map: ProvinceMap, table: ProvinceTable, out: Findings): Promise<void> {
  const { width } = map;
  const overSea = new Tallies();
  const seaOverLand = new Tallies();
  const landOverSea = new Tallies();
  await forEachRowChunk(map.height, (y) => {
    for (let x = 0; x < width; x++) {
      const offset = y * width + x;
      const value = rivers[offset] ?? RIVER_LAND;
      const id = map.ids[offset] ?? NO_PROVINCE;
      if (id === NO_PROVINCE || id === LAKE) {
        continue;
      }
      const sea = table.isSea[id] === 1;
      if (sea && value < RIVER_SEA) {
        overSea.count(id, x, y);
      } else if (sea && value === RIVER_LAND) {
        landOverSea.count(0, x, y);
      } else if (!sea && value === RIVER_SEA) {
        seaOverLand.count(0, x, y);
      }
    }
  });
  const overSeaTallies = overSea.values();
  const overSeaFirst = overSeaTallies[0];
  if (overSeaFirst) {
    const total = overSeaTallies.reduce((sum, tally) => sum + tally.count, 0);
    out.add(RIVERS_BMP, 'warning', 'river-over-sea', `${pixels(total)} of river lie on ${String(overSeaTallies.length)} sea province(s) of ${PROVINCES_BMP} (river mouths drawn into the sea), first at ${at(overSeaFirst.first)}.`, overSeaFirst.first);
  }
  for (const tally of seaOverLand.values()) {
    out.add(RIVERS_BMP, 'warning', 'river-sea-over-land', `${pixels(tally.count)} are sea in ${RIVERS_BMP} (index ${String(RIVER_SEA)}) but land in ${PROVINCES_BMP}, first at ${at(tally.first)}.`, tally.first);
  }
  for (const tally of landOverSea.values()) {
    out.add(RIVERS_BMP, 'warning', 'river-land-over-sea', `${pixels(tally.count)} are land in ${RIVERS_BMP} (index ${String(RIVER_LAND)}) but a sea province in ${PROVINCES_BMP}, first at ${at(tally.first)}.`, tally.first);
  }
  reportRiverShapes(rivers, map, table, out);
}

const RIVER_ISSUE_MESSAGES = {
  'river-isolated-pixel': 'Lone river pixel with no river neighbour.',
  'river-merge-detached': 'Merge pixel (index 1) touches fewer than 2 river pixels; a merge joins a tributary to another river.',
  'river-thick': 'River is 2 pixels wide here: the 2x2 block from this pixel is all river.',
} as const;

function reportRiverShapes(rivers: Uint8Array, map: ProvinceMap, table: ProvinceTable, out: Findings): void {
  const isSea = (offset: number): boolean => {
    const id = map.ids[offset] ?? NO_PROVINCE;
    return rivers[offset] === RIVER_SEA || (id !== NO_PROVINCE && id !== LAKE && table.isSea[id] === 1);
  };
  const analysis = analyzeRivers(rivers, map.width, map.height, isSea);
  for (const issue of analysis.issues) {
    const severity: DiagnosticSeverity = issue.code === 'river-merge-detached' ? 'error' : 'warning';
    out.add(RIVERS_BMP, severity, issue.code, RIVER_ISSUE_MESSAGES[issue.code], issue);
  }
  for (const river of analysis.sourceless) {
    out.add(RIVERS_BMP, 'warning', 'river-without-source', `River of ${pixels(river.size)} starting at ${at(river)} has no source pixel (index 0); the engine never draws it.`, river);
  }
  for (const river of analysis.landlocked) {
    out.add(RIVERS_BMP, 'warning', 'river-not-reaching-sea', `River of ${pixels(river.size)} starting at ${at(river)} never touches a sea pixel (a closed basin, or a coast drawn one pixel short).`, river);
  }
}

// --- helpers ------------------------------------------------------------------------

interface Tally {
  count: number;
  readonly first: Pixel;
}

/** Pixel counts and first position per key (a color, a province id, a palette index). */
class Tallies {
  private readonly byKey = new Map<number, Tally>();

  count(key: number, x: number, y: number): void {
    const tally = this.byKey.get(key);
    if (tally) {
      tally.count++;
    } else {
      this.byKey.set(key, { count: 1, first: { x, y } });
    }
  }

  entries(): [number, Tally][] {
    return [...this.byKey.entries()].sort((a, b) => a[0] - b[0]);
  }

  values(): Tally[] {
    return this.entries().map(([, tally]) => tally);
  }
}

const FILE_ORDER: readonly MapImageFile[] = [PROVINCES_BMP, TERRAIN_BMP, RIVERS_BMP];

class Findings {
  private readonly items: MapFinding[] = [];

  add(file: MapImageFile, severity: DiagnosticSeverity, code: string, message: string, pixel?: Pixel): void {
    this.items.push(pixel ? { file, severity, code, message, pixel } : { file, severity, code, message });
  }

  sorted(): MapFinding[] {
    return [...this.items].sort(
      (a, b) =>
        FILE_ORDER.indexOf(a.file) - FILE_ORDER.indexOf(b.file) ||
        severityRank(a.severity) - severityRank(b.severity) ||
        (a.pixel?.y ?? -1) - (b.pixel?.y ?? -1) ||
        (a.pixel?.x ?? -1) - (b.pixel?.x ?? -1),
    );
  }
}

function severityRank(severity: DiagnosticSeverity): number {
  return severity === 'error' ? 0 : 1;
}

async function forEachRowChunk(height: number, visitRow: (y: number) => void): Promise<void> {
  for (let start = 0; start < height; start += ROWS_PER_CHUNK) {
    const end = Math.min(height, start + ROWS_PER_CHUNK);
    for (let y = start; y < end; y++) {
      visitRow(y);
    }
    await yieldToEventLoop();
  }
}

function pixels(count: number): string {
  return `${String(count)} pixel${count === 1 ? '' : 's'}`;
}

function at(pixel: Pixel): string {
  return `${String(pixel.x)}, ${String(pixel.y)}`;
}
