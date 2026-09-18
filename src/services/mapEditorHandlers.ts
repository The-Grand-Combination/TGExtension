import * as path from 'node:path';
import type { Document } from '../model/ast.js';
import {
  type ClimateSection,
  type FileRef,
  type HistorySection,
  type LocSection,
  type MapCountryColorsResult,
  type MapEditorMapResult,
  type MapEditorTargetParams,
  type MapPositionsResult,
  type MapStateColorsResult,
  type MapThumbnails,
  type NewProvince,
  type NewProvinceParams,
  type PaintParams,
  type PaintResult,
  type PopEntry,
  type PopsSection,
  type PositionsSection,
  type ProvinceDefinition,
  type ProvinceDetails,
  type ProvinceHistory,
  type ProvincePositions,
  type ProvinceRequestParams,
  type ProvinceResult,
  type Rgb,
  type SaveParams,
  type SaveResult,
  type StateSection,
  type TerrainPictureParams,
  type TerrainPictureResult,
  type TerrainSection,
} from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import { decodeBmp, indicesOf, type BmpImage } from './bmpDecoder.js';
import { countryColorOf, countryFilesOf, provinceOwnerOf } from './countryColors.js';
import { namedIdentifiersOf, vocabularyOf } from './mapEditorVocabulary.js';
import { riversThumbnail, sampledThumbnail, THUMBNAIL_SIZE, thumbnailDataUri } from './mapThumbnails.js';
import { firstGroupByProvince, groupNames, groupOffsetOf, groupsOfProvince, planGroupEdit } from './provinceGroupEdit.js';
import {
  listLayeredFiles,
  listLayeredFilesRecursive,
  resolveLayeredFile,
  type LayerFileSystem,
  type ModLayers,
} from './modLayers.js';
import { isInsideRoot, type FileLocation } from './modLayout.js';
import {
  filterHistoryFolders,
  findHistoryFile,
  historyFolderOf,
  historyFoldersOf,
  parseProvinceHistory,
  provinceIdOfHistoryFile,
  planHistoryEdit,
  renderProvinceHistory,
} from './provinceHistoryEdit.js';
import {
  appendProvinceLoc,
  countProvinceKeys,
  historyFileNameFor,
  unfoldableCharacter,
  locKeyLine,
  newProvinceLocFile,
  patchProvinceLoc,
  pickLocFileForNewKey,
  provinceLocKey,
  readProvinceLoc,
  type LocFileCandidate,
} from './provinceLocEdit.js';
import {
  findPopsBlock,
  parsePops,
  planPopsEdit,
  popDatesOf,
  popFilesOf,
  provinceIdsInPopsFile,
  renderPopsFile,
} from './provincePopsEdit.js';
import {
  findPositionsBlock,
  parseProvincePositions,
  planPositionsEdit,
  positionMarkersOf,
  provinceLabelsOf,
  renderPositionsFile,
} from './provincePositionsEdit.js';
import { planDefaultMapEdit, seaStartsOf } from './mapDefaultEdit.js';
import { appendDefinitionRow, nextProvinceId, rowOfColor } from './provinceDefinitionEdit.js';
import { applyRuns } from './provincePaint.js';
import { parseProvinceDefinitions, parseProvinceRows, type ProvinceRow } from './provinceTable.js';
import { parseDocument } from './syntaxValidation.js';
import {
  dominantTerrainByProvince,
  terrainPictureDataUri,
  terrainSpriteTextures,
  terrainTypeByIndex,
  textureCandidates,
  waterTerrainIndices,
} from './terrainPictures.js';
import { unrepresentableIn, type Codepage } from '../io/textCodec.js';
import { applyPatches } from './textPatch.js';

export interface MapEditorHost {
  /** The picked mods in load order, as the reports resolve them. */
  readonly targets: (params: MapEditorTargetParams) => readonly FileLocation[];
  readonly modNameOf: (root: string) => string;
  readonly ensureIndex: (layers: ModLayers) => Promise<ModIndex | undefined>;
  readonly fileSystem: LayerFileSystem;
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
  readonly readBytes: (absolutePath: string) => Promise<Uint8Array | undefined>;
  /** Folder of the files shipped with the extension, for a default a mod does not carry. */
  readonly assetsFolder: string;
  readonly writeText: (absolutePath: string, text: string) => Promise<boolean>;
  readonly writeBytes: (absolutePath: string, bytes: Uint8Array) => Promise<boolean>;
  readonly rename: (fromPath: string, toPath: string) => Promise<boolean>;
  /** The mod's code page, asked at save time so the setting can change meanwhile. */
  readonly codepage: () => Codepage;
  /** Narrows which `history/provinces` subfolders count; undefined is all of them. */
  readonly historyFolderPattern: () => RegExp | undefined;
}

const PROVINCES_FOLDER = 'history/provinces';
const PROVINCES_BMP = 'map/provinces.bmp';
const RIVERS_BMP = 'map/rivers.bmp';
const TERRAIN_BMP = 'map/terrain.bmp';
const TERRAIN_TXT = 'map/terrain.txt';
const DEFINITION_CSV = 'map/definition.csv';
const DEFAULT_MAP = 'map/default.map';
const COUNTRIES_FILE = 'common/countries.txt';
/** History files read at once while collecting owners. */
const OWNER_BATCH = 64;
const POPS_FOLDER = 'history/pops';
const POSITIONS_FILE = 'map/positions.txt';
const CLIMATE_FILE = 'map/climate.txt';
const REGION_FILE = 'map/region.txt';
/** The terrain a sea province shows, and the picture the game draws for it. */
const OCEAN_TERRAIN = 'ocean';
const OCEAN_TEXTURE = 'gfx/interface/terrain/terrain_ocean.tga';
const BUNDLED_OCEAN_PICTURE = 'terrain_ocean.dds';
const BUNDLED_NO_TERRAIN_PICTURE = 'no_terrain.dds';
const TERRAIN_PICTURE_MAX_WIDTH = 440;

/** What a stack knows about terrain pictures; built once per stack, on the first map request. */
interface TerrainInfo {
  /** Terrain name (lowercase) → texture path, from `GFX_terrainimg_<terrain>` sprites. */
  readonly textures: ReadonlyMap<string, string>;
  /** Province id → the terrain category most of its terrain.bmp pixels carry. */
  readonly dominant: ReadonlyMap<number, string>;
}

/** A map script file the editor reads whole and patches: positions, climates, regions. */
interface ScriptFile {
  readonly absolutePath: string;
  readonly text: string;
  readonly document: Document;
}

interface Target {
  readonly root: string;
  readonly layers: ModLayers;
  readonly index: ModIndex;
}

/** `map/definition.csv` read and parsed once per stack: every click and every save asks for it. */
interface DefinitionTable {
  /** Undefined when the stack has no file; a file that would not read is an empty table under its path. */
  readonly absolutePath: string | undefined;
  readonly text: string;
  readonly rows: ProvinceRow[];
  readonly definitions: ProvinceDefinition[];
}

/**
 * The server side of the Map Editor. Files are read through the mod stack and
 * written only inside the target mod: a file that lives in a layer below is
 * rewritten into the target at the same relative path.
 */
export class MapEditorHandlers {
  /** `<layers key>#<date>` → province id → relative path of the pops file holding its block. */
  private readonly popsFilesByDate = new Map<string, Map<number, string>>();
  private readonly terrainByLayers = new Map<string, Promise<TerrainInfo>>();
  /** Terrain pictures by normalised absolute path, as sent to the page; a miss is remembered too. */
  private readonly pictureByPath = new Map<string, string | undefined>();
  /** `<layers key>#<relative path>` → a parsed map file, or undefined when the stack has none. */
  private readonly scriptByLayers = new Map<string, Promise<ScriptFile | undefined>>();
  /** `<layers key>` → start-date owners and country colours, for the page's Country Colors layer. */
  private readonly countryColorsByLayers = new Map<string, Promise<MapCountryColorsResult>>();
  /** `<layers key>` → the `history/provinces` walk, which every click and every save would otherwise repeat. */
  private readonly historyFilesByLayers = new Map<string, HistoryFiles>();
  /** `<layers key>` → the Layers box thumbnails; dropped when a paint changes the province map. */
  private readonly thumbnailsByLayers = new Map<string, Promise<MapThumbnails>>();
  /** Decoded map bitmaps by normalised absolute path: terrain, thumbnails and paint share one read of a 60 MB file. */
  private readonly bitmapByPath = new Map<string, Promise<BmpImage | undefined>>();
  private readonly definitionsByLayers = new Map<string, Promise<DefinitionTable>>();

  constructor(private readonly host: MapEditorHost) {}

  /**
   * Mod files changed on disk. Given the paths, only what depends on them is
   * dropped; a path nothing here reads costs nothing. Without them, everything
   * goes: the layout itself changed.
   */
  invalidate(changed?: readonly string[]): void {
    if (changed === undefined) {
      this.popsFilesByDate.clear();
      this.terrainByLayers.clear();
      this.pictureByPath.clear();
      this.scriptByLayers.clear();
      this.countryColorsByLayers.clear();
      this.historyFilesByLayers.clear();
      this.thumbnailsByLayers.clear();
      this.bitmapByPath.clear();
      this.definitionsByLayers.clear();
      return;
    }
    for (const fsPath of changed) {
      this.invalidatePath(fsPath);
    }
  }

  private invalidatePath(fsPath: string): void {
    const key = pathKey(fsPath);
    if (key.includes('/map/') && key.endsWith('.bmp')) {
      this.bitmapByPath.delete(key);
      this.thumbnailsByLayers.clear();
      this.terrainByLayers.clear();
    } else if (key.endsWith('/map/definition.csv')) {
      this.definitionsByLayers.clear();
      this.terrainByLayers.clear();
    } else if (key.includes('/map/') && (key.endsWith('.txt') || key.endsWith('/default.map'))) {
      this.scriptByLayers.clear();
      if (key.endsWith('/map/terrain.txt')) {
        this.terrainByLayers.clear();
      }
    } else if (key.includes('/history/provinces/')) {
      this.historyFilesByLayers.clear();
      this.countryColorsByLayers.clear();
    } else if (key.includes('/history/pops/')) {
      this.popsFilesByDate.clear();
    } else if (key.includes('/common/countries')) {
      this.countryColorsByLayers.clear();
    } else if (key.includes('/interface/') && key.endsWith('.gfx')) {
      this.terrainByLayers.clear();
    } else if (key.includes('/gfx/')) {
      this.pictureByPath.delete(key);
    }
  }

  async map(params: MapEditorTargetParams): Promise<MapEditorMapResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const provincesBmpPath = this.resolve(target.layers, PROVINCES_BMP);
    const table = await this.definitions(target.layers);
    if (provincesBmpPath === undefined || table.absolutePath === undefined) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/provinces.bmp or map/definition.csv.' };
    }
    // Reading both bitmaps takes a moment; start now so the first click finds it done.
    void this.terrainInfo(target.layers);
    const popPaths = this.listRecursive(target.layers, POPS_FOLDER);
    const popDates = popDatesOf(popPaths);
    const terrainText = await this.scriptFile(target.layers, TERRAIN_TXT);
    return {
      kind: 'ready',
      targetName: this.host.modNameOf(target.root),
      targetRoot: target.root,
      provincesBmpPath,
      riversBmpPath: this.resolve(target.layers, RIVERS_BMP),
      terrainBmpPath: this.resolve(target.layers, TERRAIN_BMP),
      waterTerrainIndices: terrainText ? [...waterTerrainIndices(terrainText.document)].sort((a, b) => a - b) : [],
      definitions: table.definitions,
      lakeColors: table.rows.flatMap((row) => (row.id === undefined ? [row.color] : [])),
      seaProvinces: [...await this.seaProvinces(target)].map(Number).filter((id) => Number.isInteger(id)),
      popDates,
      historyFolders: historyFoldersOf(this.provinceHistoryFiles(target.layers)),
      popFiles: Object.fromEntries(popDates.map((date) => [date, popFilesOf(popPaths, date)])),
      vocabulary: vocabularyOf(target.index),
    };
  }

  async province(params: ProvinceRequestParams): Promise<ProvinceResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    return { kind: 'details', details: await this.details(target, params.provinceId, params.popDate) };
  }

  /** A colour no row of `definition.csv` names: the next free id, with every section empty. */
  async newProvince(params: NewProvinceParams): Promise<ProvinceResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const rows = (await this.definitions(target.layers)).rows;
    const taken = rowOfColor(rows, params.color);
    if (taken) {
      const what = taken.id === undefined ? `the lake ${taken.name}` : `province ${String(taken.id)}`;
      return { kind: 'unavailable', reason: `That colour is already ${what} in map/definition.csv.` };
    }
    return { kind: 'details', details: await this.details(target, nextProvinceId(rows), params.popDate) };
  }

  /**
   * A save writes one section — and, for a province that only exists as paint,
   * creates it first: the `definition.csv` row, and the room `default.map` has
   * to make for its id. With `dryRun` nothing is written and the answer is the
   * list of files the save would have touched.
   */
  async save(params: SaveParams): Promise<SaveResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { ok: false, reason: target };
    }
    const parts = sectionsOf(params);
    // The history part carries the name, the climate and the states, so it is
    // the one the checks below and the placement read.
    const lead = parts[0] ?? params;
    const missing = await this.placementReason(target, lead);
    if (missing !== undefined) {
      return { ok: false, reason: missing };
    }
    // Before createProvince, which writes the definition.csv row: a name the file
    // system would take but the game would not must stop the whole save.
    const unwritable = fileNameReason(lead);
    if (unwritable !== undefined) {
      return { ok: false, reason: unwritable };
    }
    const created = params.create ? await this.createProvince(target, lead, params.create) : { ok: true as const, written: [] };
    if (!created.ok) {
      return created;
    }
    const placed = await this.savePlacement(target, lead);
    if (typeof placed === 'string') {
      return withWritten({ ok: false, reason: placed }, created.written, params);
    }
    let written = [...created.written, ...placed];
    let last: (SaveResult & { ok: true }) | undefined;
    for (const part of parts) {
      const result = await this.saveSection(target, part);
      if (!result.ok) {
        return withWritten(result, written, params);
      }
      written = [...written, ...result.written];
      last = result;
    }
    return last
      ? { ...last, written }
      : { ok: true, written, details: await this.details(target, params.provinceId, params.popDate) };
  }

  /**
   * A land province belongs to one climate and to at least one state: without
   * them the engine carries it with no climate modifier and inside no state, so
   * nothing can own or develop it. The save carrying the missing value is the
   * one that fixes it, so what counts is where the province ends up once this
   * save is written. A sea province is in neither file.
   */
  private async placementReason(target: Target, params: SaveParams): Promise<string | undefined> {
    if (await this.isSeaProvince(target, params)) {
      return undefined;
    }
    const id = String(params.provinceId);
    // A province being created is land only because the Sea province box is
    // unticked, and that is the other way out of both of these.
    const orSea = params.create ? ', or tick Sea province' : '';
    const climate = climateIn(params);
    const inClimate = await this.placedIn(target, params, CLIMATE_FILE, climate === undefined ? undefined : [climate]);
    if (inClimate?.length === 0) {
      return `Province ${id} has no climate: pick one in the History section${orSea}.`;
    }
    const inState = await this.placedIn(target, params, REGION_FILE, statesIn(params));
    if (inState?.length === 0) {
      return `Province ${id} is in no state: add one under States${orSea}.`;
    }
    return undefined;
  }

  /** A province being created is sea because its box is ticked, not because the file says so yet. */
  private async isSeaProvince(target: Target, params: SaveParams): Promise<boolean> {
    return params.create ? params.create.isSea : (await this.seaProvinces(target)).has(String(params.provinceId));
  }

  /**
   * `sea_starts` as the disk has it — a save may have just added an id there,
   * and the index only catches up once the watcher has run. The index stands in
   * when the stack has no default.map at all.
   */
  private async seaProvinces(target: Target): Promise<ReadonlySet<string>> {
    const file = await this.scriptFile(target.layers, DEFAULT_MAP);
    return file ? seaStartsOf(file.document) : target.index.seaProvinces;
  }

  /**
   * The groups the province is in once this save is written, or undefined when
   * the stack has no such file — a mod with no climate.txt has nothing this
   * save could have put right, and the reason for that belongs to the map
   * report, not to every Save.
   */
  private async placedIn(
    target: Target,
    params: SaveParams,
    relativePath: string,
    carried: readonly string[] | undefined,
  ): Promise<string[] | undefined> {
    const file = await this.scriptFile(target.layers, relativePath);
    if (!file) {
      return undefined;
    }
    const after = carried ?? groupsOfProvince(file.document, params.provinceId);
    return after.filter((name) => name.trim() !== '');
  }

  /** The climate and the states this save carries, written into their own files. */
  private async savePlacement(target: Target, params: SaveParams): Promise<string[] | string> {
    const climate = climateIn(params);
    const states = statesIn(params);
    const written: string[] = [];
    if (climate !== undefined) {
      const done = await this.writeGroups(target, params, CLIMATE_FILE, climate.trim() === '' ? [] : [climate]);
      if (typeof done === 'string') {
        return done;
      }
      written.push(...done);
    }
    if (states !== undefined) {
      const done = await this.writeGroups(target, params, REGION_FILE, states);
      if (typeof done === 'string') {
        return done;
      }
      written.push(...done);
    }
    return written;
  }

  /** The province in exactly these blocks of a map file, or the reason it could not be put there. */
  private async writeGroups(
    target: Target,
    params: SaveParams,
    relativePath: string,
    groups: readonly string[],
  ): Promise<string[] | string> {
    const file = await this.scriptFile(target.layers, relativePath);
    if (!file) {
      return groups.length === 0 ? [] : `The picked mods have no ${relativePath}.`;
    }
    const patches = planGroupEdit(file.text, file.document, params.provinceId, groups);
    if (patches.length === 0) {
      return [];
    }
    const destination = isInsideRoot(target.root, file.absolutePath) ? file.absolutePath : path.join(target.root, relativePath);
    const failed = await this.write(destination, applyPatches(file.text, patches), relativePath, params.dryRun === true);
    if (failed !== undefined) {
      return failed;
    }
    this.scriptByLayers.delete(`${target.layers.key}#${relativePath}`);
    return [destination];
  }

  private saveSection(target: Target, params: SaveParams): Promise<SaveResult> {
    switch (params.section) {
      case 'history':
        return this.saveDefinition(target, params);
      case 'pops':
        return this.savePops(target, params, params.pops, params.createInFile);
      case 'positions':
        return this.savePositions(target, params, params.data);
      case 'all':
        return Promise.resolve({ ok: false, reason: 'A save of every section is split into its parts before it is written.' });
    }
  }

  /**
   * The history file, and the localisation with it when the save carries one.
   * The history file is written first: renaming it to the new name has to find
   * the file the same save may have just created.
   */
  private async saveDefinition(target: Target, params: SaveParams & { section: 'history' }): Promise<SaveResult> {
    const localisation = params.localisation;
    // Asked before anything is written: half a save is worse than none.
    const stray = localisation === undefined ? undefined : this.codepageReason(localisation.text);
    if (stray !== undefined) {
      return { ok: false, reason: stray };
    }
    const history = await this.saveHistory(target, params, params.data, params.createInFolder);
    if (!history.ok || localisation === undefined) {
      return history;
    }
    const named = await this.saveLocalisation(target, params, localisation.text, localisation.renameHistoryFile);
    return named.ok ? { ...named, written: [...history.written, ...named.written] } : named;
  }

  private definitions(layers: ModLayers): Promise<DefinitionTable> {
    return cached(this.definitionsByLayers, layers.key, async () => {
      const absolutePath = this.resolve(layers, DEFINITION_CSV);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      const held = text ?? '';
      return { absolutePath, text: held, rows: parseProvinceRows(held), definitions: parseProvinceDefinitions(held) };
    });
  }

  /** The row the province needs to exist at all, and the `default.map` it has to fit in. */
  private async createProvince(
    target: Target,
    params: SaveParams,
    create: NewProvince,
  ): Promise<{ readonly ok: true; readonly written: string[] } | { readonly ok: false; readonly reason: string }> {
    const table = await this.definitions(target.layers);
    const source = table.absolutePath;
    if (source === undefined) {
      return { ok: false, reason: 'The picked mods have no map/definition.csv.' };
    }
    const { rows, text } = table;
    // A second save of the same province arrives here with the row already written.
    if (rowOfColor(rows, create.color) !== undefined) {
      return { ok: true, written: [] };
    }
    if (rows.some((row) => row.id === params.provinceId)) {
      return { ok: false, reason: `Province ${String(params.provinceId)} is already in map/definition.csv; click the colour again for a free id.` };
    }
    const name = create.name.trim() === '' ? `Province ${String(params.provinceId)}` : create.name.trim();
    const row = { id: params.provinceId, color: create.color, name };
    const destination = isInsideRoot(target.root, source) ? source : path.join(target.root, DEFINITION_CSV);
    const failed = await this.write(destination, appendDefinitionRow(text, row), 'map/definition.csv', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    if (params.dryRun !== true) {
      this.definitionsByLayers.delete(target.layers.key);
    }
    const written = [destination, ...(await this.makeRoom(target, params, create))];
    return { ok: true, written };
  }

  /** `max_provinces` over the new id, and the id in `sea_starts` when it is a sea province. */
  private async makeRoom(target: Target, params: SaveParams, create: NewProvince): Promise<string[]> {
    const source = this.resolve(target.layers, DEFAULT_MAP);
    const text = source === undefined ? undefined : await this.host.readText(source);
    if (source === undefined || text === undefined) {
      return [];
    }
    const patches = planDefaultMapEdit(parseDocument(text).document, { provinceId: params.provinceId, isSea: create.isSea });
    if (patches.length === 0) {
      return [];
    }
    const destination = isInsideRoot(target.root, source) ? source : path.join(target.root, DEFAULT_MAP);
    const failed = await this.write(destination, applyPatches(text, patches), 'map/default.map', params.dryRun === true);
    if (failed === undefined && params.dryRun !== true) {
      this.scriptByLayers.delete(`${target.layers.key}#${DEFAULT_MAP}`);
    }
    return failed === undefined ? [destination] : [];
  }

  /**
   * Write the painted pixels into `map/provinces.bmp`. A bitmap the stack
   * resolves to a layer below the target is patched and written into the target
   * as its own copy, the same rule every other save follows.
   */
  async paint(params: PaintParams): Promise<PaintResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { ok: false, reason: target };
    }
    const source = this.resolve(target.layers, PROVINCES_BMP);
    const bytes = source === undefined ? undefined : await this.host.readBytes(source);
    if (bytes === undefined) {
      return { ok: false, reason: 'The picked mods have no map/provinces.bmp.' };
    }
    const decoded = decodeBmp(bytes);
    if (decoded.kind === 'error') {
      return { ok: false, reason: `map/provinces.bmp could not be read: ${decoded.reason}.` };
    }
    const outcome = applyRuns(decoded.image, params.runs);
    if (!outcome.ok) {
      return outcome;
    }
    const destination = isInsideRoot(target.root, source ?? '') ? (source ?? '') : path.join(target.root, PROVINCES_BMP);
    if (!(await this.host.writeBytes(destination, bytes))) {
      return { ok: false, reason: 'map/provinces.bmp could not be written.' };
    }
    // The province map is another file now: whatever was read from it is stale.
    this.bitmapByPath.delete(pathKey(source ?? ''));
    this.bitmapByPath.delete(pathKey(destination));
    this.thumbnailsByLayers.delete(target.layers.key);
    this.terrainByLayers.delete(target.layers.key);
    return { ok: true, path: destination, pixels: outcome.pixels };
  }

  /** The three bitmaps as thumbnails for the Layers box, built once per stack; a missing or unreadable file is left out. */
  async thumbnails(params: MapEditorTargetParams): Promise<MapThumbnails> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return {};
    }
    return cached(this.thumbnailsByLayers, target.layers.key, () => this.buildThumbnails(target.layers));
  }

  private async buildThumbnails(layers: ModLayers): Promise<MapThumbnails> {
    const out: { provinces?: string; rivers?: string; terrain?: string } = {};
    const provinces = await this.readBitmap(layers, PROVINCES_BMP);
    if (provinces) {
      out.provinces = thumbnailDataUri(THUMBNAIL_SIZE, THUMBNAIL_SIZE, sampledThumbnail(provinces, THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
    const rivers = await this.readBitmap(layers, RIVERS_BMP);
    if (rivers?.bitsPerPixel === 8) {
      out.rivers = thumbnailDataUri(THUMBNAIL_SIZE, THUMBNAIL_SIZE, riversThumbnail(rivers, THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
    const terrain = await this.readBitmap(layers, TERRAIN_BMP);
    if (terrain) {
      out.terrain = thumbnailDataUri(THUMBNAIL_SIZE, THUMBNAIL_SIZE, sampledThumbnail(terrain, THUMBNAIL_SIZE, THUMBNAIL_SIZE));
    }
    return out;
  }

  /** Every editable point of `map/positions.txt`, for the page to draw over the map. */
  async positions(params: MapEditorTargetParams): Promise<MapPositionsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const file = await this.scriptFile(target.layers, POSITIONS_FILE);
    if (!file) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/positions.txt.' };
    }
    const labels = provinceLabelsOf(file.document, (id) => readProvinceLoc(target.index, id).text);
    return { kind: 'ready', markers: positionMarkersOf(file.document), labels };
  }

  /** Who owns each province at the start date and the colour of each owner, for the page to tint the map. */
  async countryColors(params: MapEditorTargetParams): Promise<MapCountryColorsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    return cached(this.countryColorsByLayers, target.layers.key, () => this.readCountryColors(target.layers));
  }

  /** The first state of `map/region.txt` naming each province, for the page to tint the map by state. */
  async stateColors(params: MapEditorTargetParams): Promise<MapStateColorsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const file = await this.scriptFile(target.layers, REGION_FILE);
    if (!file) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/region.txt.' };
    }
    const states: Record<string, string> = {};
    for (const [id, name] of firstGroupByProvince(file.document)) {
      states[String(id)] = name;
    }
    return { kind: 'ready', states };
  }

  /** The picture of one terrain, for the page to preview a terrain the user picked but has not saved. */
  async terrainPictureFor(params: TerrainPictureParams): Promise<TerrainPictureResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { terrain: params.terrain, pictureDataUri: undefined };
    }
    // The page asks for '' when the form leaves the province with no terrain.
    if (params.terrain === '') {
      return { terrain: params.terrain, pictureDataUri: await this.noTerrainPicture() };
    }
    const info = await this.terrainInfo(target.layers);
    return { terrain: params.terrain, pictureDataUri: await this.terrainPicture(target.layers, info, params.terrain) };
  }

  private async resolveTarget(params: MapEditorTargetParams): Promise<Target | string> {
    const targets = this.host.targets(params);
    const top = targets[targets.length - 1];
    if (!top) {
      return 'No mod to edit: pick a mod, or open a mod folder in the workspace.';
    }
    const index = await this.host.ensureIndex(top.layers);
    if (!index) {
      return 'The mod could not be indexed; see the Victorian Tools output.';
    }
    return { root: top.root, layers: top.layers, index };
  }

  private async details(target: Target, provinceId: number, popDate: string): Promise<ProvinceDetails> {
    const { definitions } = await this.definitions(target.layers);
    const history = await this.readHistory(target, provinceId);
    const isSea = (await this.seaProvinces(target)).has(String(provinceId));
    const declared = definitions.find((definition) => definition.id === provinceId);
    return {
      id: provinceId,
      definitionName: declared?.name ?? '',
      isSea,
      isNew: declared === undefined,
      localisation: this.readLocalisation(target, provinceId),
      history,
      pops: await this.readPops(target, provinceId, popDate),
      positions: await this.readPositions(target, provinceId),
      terrain: await this.readTerrain(target, provinceId, history, isSea),
      climate: await this.readClimate(target, provinceId),
      state: await this.readState(target, provinceId),
    };
  }

  private async readClimate(target: Target, provinceId: number): Promise<ClimateSection> {
    const file = await this.scriptFile(target.layers, CLIMATE_FILE);
    const name = file ? groupsOfProvince(file.document, provinceId)[0] : undefined;
    return {
      name,
      file: file ? { absolutePath: file.absolutePath, line: groupLine(file, name) } : undefined,
      inTarget: file !== undefined && isInsideRoot(target.root, file.absolutePath),
      options: namedIdentifiersOf(target.index, file ? groupNames(file.document) : []),
    };
  }

  private async readState(target: Target, provinceId: number): Promise<StateSection> {
    const file = await this.scriptFile(target.layers, REGION_FILE);
    const names = file ? groupsOfProvince(file.document, provinceId) : [];
    return {
      names,
      file: file ? { absolutePath: file.absolutePath, line: groupLine(file, names[0]) } : undefined,
      inTarget: file !== undefined && isInsideRoot(target.root, file.absolutePath),
      options: namedIdentifiersOf(target.index, file ? groupNames(file.document) : []),
    };
  }

  /** The history file's `terrain`, with that terrain's picture; terrain.bmp's category comes along as a note. */
  private async readTerrain(
    target: Target,
    provinceId: number,
    history: HistorySection,
    isSea: boolean,
  ): Promise<TerrainSection> {
    if (isSea) {
      return { name: OCEAN_TERRAIN, dominant: undefined, pictureDataUri: await this.oceanPicture(target.layers) };
    }
    const info = await this.terrainInfo(target.layers);
    const name = history.data?.terrain;
    // The province's terrain is the one its history file names, and the picture is
    // that terrain's own sprite: another terrain's would read as this province's.
    // A province the file leaves without one — a province being created is one —
    // shows the picture shipped for that, whatever terrain.bmp has under it.
    const pictureDataUri =
      name === undefined ? await this.noTerrainPicture() : await this.terrainPicture(target.layers, info, name);
    return { name, dominant: info.dominant.get(provinceId), pictureDataUri };
  }

  /**
   * What a sea province shows: the stack's own
   * `gfx/interface/terrain/terrain_ocean`, else the copy shipped with the
   * extension. The sprite is not asked for, because vanilla declares
   * `GFX_terrainimg_ocean` against the mountains texture.
   */
  private async oceanPicture(layers: ModLayers): Promise<string | undefined> {
    for (const relativePath of textureCandidates(OCEAN_TEXTURE)) {
      const absolutePath = this.resolve(layers, relativePath);
      const picture = absolutePath === undefined ? undefined : await this.pictureAt(absolutePath);
      if (picture !== undefined) {
        return picture;
      }
    }
    return this.pictureAt(path.join(this.host.assetsFolder, BUNDLED_OCEAN_PICTURE));
  }

  /** What a province with no terrain shows: the picture the extension ships for it. */
  private noTerrainPicture(): Promise<string | undefined> {
    return this.pictureAt(path.join(this.host.assetsFolder, BUNDLED_NO_TERRAIN_PICTURE));
  }

  private async terrainPicture(layers: ModLayers, info: TerrainInfo, terrain: string): Promise<string | undefined> {
    const texture = info.textures.get(terrain.toLowerCase());
    if (texture === undefined) {
      return undefined;
    }
    for (const relativePath of textureCandidates(texture)) {
      const absolutePath = this.resolve(layers, relativePath);
      if (absolutePath !== undefined) {
        return this.pictureAt(absolutePath);
      }
    }
    return undefined;
  }

  private async pictureAt(absolutePath: string): Promise<string | undefined> {
    const key = pathKey(absolutePath);
    if (!this.pictureByPath.has(key)) {
      const bytes = await this.host.readBytes(absolutePath);
      this.pictureByPath.set(
        key,
        bytes === undefined ? undefined : terrainPictureDataUri(bytes, path.basename(absolutePath), TERRAIN_PICTURE_MAX_WIDTH),
      );
    }
    return this.pictureByPath.get(key);
  }

  /** A stack whose sprites or bitmaps cannot be read has no terrain pictures, which is an answer, not an error. */
  private terrainInfo(layers: ModLayers): Promise<TerrainInfo> {
    return cached(this.terrainByLayers, layers.key, () =>
      this.buildTerrainInfo(layers).catch((): TerrainInfo => ({ textures: new Map(), dominant: new Map() })),
    );
  }

  private async buildTerrainInfo(layers: ModLayers): Promise<TerrainInfo> {
    const textures = new Map<string, string>();
    for (const name of listLayeredFiles(layers, this.host.fileSystem, 'interface', '.gfx')) {
      const absolutePath = this.resolve(layers, `interface/${name}`);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      if (text !== undefined) {
        for (const [terrain, texture] of terrainSpriteTextures(parseDocument(text).document)) {
          if (!textures.has(terrain)) {
            textures.set(terrain, texture);
          }
        }
      }
    }
    return { textures, dominant: await this.dominantTerrains(layers) };
  }

  private async dominantTerrains(layers: ModLayers): Promise<Map<number, string>> {
    const provinces = await this.readBitmap(layers, PROVINCES_BMP);
    const terrain = await this.readBitmap(layers, TERRAIN_BMP);
    const terrainTextPath = this.resolve(layers, TERRAIN_TXT);
    const table = await this.definitions(layers);
    if (!provinces || !terrain || terrainTextPath === undefined || table.absolutePath === undefined) {
      return new Map();
    }
    const comparable =
      terrain.bitsPerPixel === 8 &&
      provinces.bitsPerPixel !== 8 &&
      provinces.width === terrain.width &&
      provinces.height === terrain.height;
    if (!comparable) {
      return new Map();
    }
    const typeByIndex = terrainTypeByIndex(parseDocument((await this.host.readText(terrainTextPath)) ?? '').document);
    return dominantTerrainByProvince(provinces, indicesOf(terrain), table.rows, typeByIndex);
  }

  /** A map bitmap decoded once and shared; the paint writes the file behind it, and drops it. */
  private readBitmap(layers: ModLayers, relativePath: string): Promise<BmpImage | undefined> {
    const absolutePath = this.resolve(layers, relativePath);
    if (absolutePath === undefined) {
      return Promise.resolve(undefined);
    }
    return cached(this.bitmapByPath, pathKey(absolutePath), async () => {
      const bytes = await this.host.readBytes(absolutePath);
      const decoded = bytes === undefined ? undefined : decodeBmp(bytes);
      return decoded?.kind === 'image' ? decoded.image : undefined;
    });
  }

  private readLocalisation(target: Target, provinceId: number): LocSection {
    const loc = readProvinceLoc(target.index, provinceId);
    const absolutePath = loc.filePath === undefined ? undefined : this.resolve(target.layers, loc.filePath);
    return {
      key: loc.key,
      text: loc.text,
      file: absolutePath === undefined ? undefined : { absolutePath, line: loc.line },
      inTarget: absolutePath !== undefined && isInsideRoot(target.root, absolutePath),
    };
  }

  private async readHistory(target: Target, provinceId: number): Promise<HistorySection> {
    const relativePath = findHistoryFile(this.provinceHistoryFiles(target.layers), provinceId);
    const absolutePath = relativePath === undefined ? undefined : this.resolve(target.layers, relativePath);
    const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
    if (absolutePath === undefined || relativePath === undefined || text === undefined) {
      return { file: undefined, inTarget: false, data: undefined, folder: undefined };
    }
    return {
      file: { absolutePath, line: 0 },
      inTarget: isInsideRoot(target.root, absolutePath),
      data: parseProvinceHistory(parseDocument(text).document),
      folder: historyFolderOf(relativePath),
    };
  }

  private async readPops(target: Target, provinceId: number, date: string): Promise<PopsSection> {
    const relativePath = (await this.popsFiles(target.layers, date)).get(provinceId);
    const absolutePath = relativePath === undefined ? undefined : this.resolve(target.layers, relativePath);
    const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
    const block = text === undefined ? undefined : findPopsBlock(parseDocument(text).document, provinceId);
    if (absolutePath === undefined || text === undefined || block?.value.kind !== 'block') {
      return { date, file: undefined, inTarget: false, pops: undefined };
    }
    return {
      date,
      file: { absolutePath, line: lineOf(text, block.range.start) },
      inTarget: isInsideRoot(target.root, absolutePath),
      pops: parsePops(block.value),
    };
  }

  /** Which file of a date holds each province, scanned once per stack and date. */
  private async popsFiles(layers: ModLayers, date: string): Promise<Map<number, string>> {
    const key = `${layers.key}#${date}`;
    const cached = this.popsFilesByDate.get(key);
    if (cached) {
      return cached;
    }
    const byProvince = new Map<number, string>();
    for (const name of popFilesOf(this.listRecursive(layers, POPS_FOLDER), date)) {
      const relativePath = `${POPS_FOLDER}/${date}/${name}`;
      const absolutePath = this.resolve(layers, relativePath);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      for (const id of provinceIdsInPopsFile(text ?? '')) {
        if (!byProvince.has(id)) {
          byProvince.set(id, relativePath);
        }
      }
    }
    this.popsFilesByDate.set(key, byProvince);
    return byProvince;
  }

  private async readPositions(target: Target, provinceId: number): Promise<PositionsSection> {
    const file = await this.scriptFile(target.layers, POSITIONS_FILE);
    const block = file ? findPositionsBlock(file.document, provinceId) : undefined;
    if (!file) {
      return { file: undefined, inTarget: false, data: undefined };
    }
    return {
      file: { absolutePath: file.absolutePath, line: block ? lineOf(file.text, block.range.start) : 0 },
      inTarget: isInsideRoot(target.root, file.absolutePath),
      data: block?.value.kind === 'block' ? parseProvincePositions(block.value) : undefined,
    };
  }

  private async readCountryColors(layers: ModLayers): Promise<MapCountryColorsResult> {
    const countriesPath = this.resolve(layers, COUNTRIES_FILE);
    const countriesText = countriesPath === undefined ? undefined : await this.host.readText(countriesPath);
    if (countriesText === undefined) {
      return { kind: 'unavailable', reason: 'The picked mods have no common/countries.txt.' };
    }
    const owners = await this.readProvinceOwners(layers);
    const files = countryFilesOf(parseDocument(countriesText).document);
    const colors: Record<string, Rgb> = {};
    for (const tag of new Set(Object.values(owners))) {
      const relativePath = files.get(tag);
      const absolutePath = relativePath === undefined ? undefined : this.resolve(layers, relativePath);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      const color = text === undefined ? undefined : countryColorOf(parseDocument(text).document);
      if (color) {
        colors[tag] = color;
      }
    }
    return { kind: 'ready', owners, colors };
  }

  /** The start-date `owner` of every province history file, read a batch of files at a time. */
  private async readProvinceOwners(layers: ModLayers): Promise<Record<string, string>> {
    const owners: Record<string, string> = {};
    const relativePaths = this.provinceHistoryFiles(layers).filter((relativePath) =>
      relativePath.toLowerCase().endsWith('.txt'),
    );
    for (let start = 0; start < relativePaths.length; start += OWNER_BATCH) {
      const batch = relativePaths.slice(start, start + OWNER_BATCH).map(async (relativePath) => {
        const id = provinceIdOfHistoryFile(relativePath.slice(relativePath.lastIndexOf('/') + 1));
        const absolutePath = this.resolve(layers, relativePath);
        const text = id === undefined || absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
        const owner = text === undefined ? undefined : provinceOwnerOf(parseDocument(text).document);
        return owner === undefined || id === undefined ? undefined : ([String(id), owner] as const);
      });
      for (const entry of await Promise.all(batch)) {
        if (entry && !(entry[0] in owners)) {
          owners[entry[0]] = entry[1];
        }
      }
    }
    return owners;
  }

  private scriptFile(layers: ModLayers, relativePath: string): Promise<ScriptFile | undefined> {
    return cached(this.scriptByLayers, `${layers.key}#${relativePath}`, async () => {
      const absolutePath = this.resolve(layers, relativePath);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      return absolutePath === undefined || text === undefined
        ? undefined
        : { absolutePath, text, document: parseDocument(text).document };
    });
  }

  // --- Writing ------------------------------------------------------------------

  private async saveLocalisation(
    target: Target,
    params: SaveParams,
    text: string,
    renameHistoryFile: boolean,
  ): Promise<SaveResult> {
    const key = provinceLocKey(params.provinceId);
    // The only free text a save carries. Asking first turns what would be a
    // silent mangling into a reason the page can show.
    const stray = this.codepageReason(text);
    if (stray !== undefined) {
      return { ok: false, reason: stray };
    }
    const written = await this.writeLocalisation(target, key, text, params.dryRun === true);
    if (written === undefined) {
      return { ok: false, reason: 'The localisation file could not be written.' };
    }
    const files = [written.absolutePath];
    if (renameHistoryFile) {
      const renamed = await this.renameHistoryFile(target, params.provinceId, text, params.dryRun === true);
      if (renamed !== undefined) {
        files.push(renamed);
      }
    }
    // The index still holds the old text until the file watcher rebuilds it.
    const details = await this.details(target, params.provinceId, params.popDate);
    const localisation: LocSection = { key, text: text.trim(), file: written, inTarget: true };
    return { ok: true, written: files, details: { ...details, localisation } };
  }

  /** Patch the key where the target defines it, else add it to the target's province file. */
  /** The message for a character the mod's code page cannot store, or undefined when it can store them all. */
  private codepageReason(text: string): string | undefined {
    const codepage = this.host.codepage();
    const stray = unrepresentableIn(text, codepage);
    return stray === undefined
      ? undefined
      : `'${stray}' cannot be stored in ${codepage}; the game reads this mod one byte per character.`;
  }

  /**
   * Write, or the reason it could not. The code page is asked before the write
   * and not after: a character with no byte in it and a broken disk both come
   * back from `writeText` as false, and "could not be written" tells a mod
   * author nothing they can act on.
   */
  private async write(absolutePath: string, text: string, subject: string, dryRun = false): Promise<string | undefined> {
    const stray = this.codepageReason(text);
    if (stray !== undefined) {
      return stray;
    }
    if (dryRun) {
      return undefined;
    }
    return (await this.host.writeText(absolutePath, text)) ? undefined : `${subject} could not be written.`;
  }

  private async writeLocalisation(target: Target, key: string, text: string, dryRun = false): Promise<FileRef | undefined> {
    const current = this.readLocalisation(target, Number(key.slice('PROV'.length)));
    const absolutePath =
      current.file !== undefined && current.inTarget
        ? current.file.absolutePath
        : path.join(target.root, 'localisation', await this.locFileForNewKey(target.root));
    const existing = await this.host.readText(absolutePath);
    if (dryRun) {
      return { absolutePath, line: existing === undefined ? 1 : (locKeyLine(existing, key) ?? 0) };
    }
    if (existing === undefined) {
      return (await this.host.writeText(absolutePath, newProvinceLocFile(key, text))) ? { absolutePath, line: 1 } : undefined;
    }
    const line = locKeyLine(existing, key);
    const patch = line === undefined ? appendProvinceLoc(existing, key, text) : patchProvinceLoc(existing, line, text);
    if (patch === undefined) {
      return undefined;
    }
    const updated = applyPatches(existing, [patch]);
    const ok = await this.host.writeText(absolutePath, updated);
    return ok ? { absolutePath, line: locKeyLine(updated, key) ?? 0 } : undefined;
  }

  private async locFileForNewKey(root: string): Promise<string> {
    const folder = path.join(root, 'localisation');
    const candidates: LocFileCandidate[] = [];
    for (const name of this.host.fileSystem.listFiles(folder, '.csv')) {
      const text = await this.host.readText(path.join(folder, name));
      candidates.push({ name, provinceKeyCount: countProvinceKeys(text ?? '') });
    }
    return pickLocFileForNewKey(candidates);
  }

  /** Rename `<id> - <old>.txt` to match the new name; only a file inside the target moves. */
  private async renameHistoryFile(target: Target, provinceId: number, name: string, dryRun = false): Promise<string | undefined> {
    const history = await this.readHistory(target, provinceId);
    if (history.file === undefined || !history.inTarget) {
      return undefined;
    }
    const wanted = historyFileNameFor(provinceId, name);
    const current = history.file.absolutePath;
    if (path.basename(current) === wanted) {
      return undefined;
    }
    const destination = path.join(path.dirname(current), wanted);
    if (dryRun) {
      return destination;
    }
    if (!(await this.host.rename(current, destination))) {
      return undefined;
    }
    // The file the kept walk names is gone.
    this.forgetHistoryFiles(target.layers);
    return destination;
  }

  /**
   * The history file of the province that the folder pattern hides, if there is
   * one. A save must stop there: with no file in sight it would create a second
   * one for the same id, which the game loads as well as the first.
   */
  private hiddenHistoryFile(layers: ModLayers, provinceId: number): string | undefined {
    if (this.host.historyFolderPattern() === undefined) {
      return undefined;
    }
    const cached = this.historyFilesByLayers.get(layers.key);
    return findHistoryFile(cached?.all ?? this.listRecursive(layers, PROVINCES_FOLDER), provinceId);
  }

  private async saveHistory(
    target: Target,
    params: SaveParams,
    data: ProvinceHistory,
    createInFolder: string | undefined,
  ): Promise<SaveResult> {
    const relativePath = findHistoryFile(this.provinceHistoryFiles(target.layers), params.provinceId);
    const source = relativePath === undefined ? undefined : this.resolve(target.layers, relativePath);
    const text = source === undefined ? undefined : await this.host.readText(source);
    let destination: string;
    let updated: string;
    if (relativePath !== undefined && source !== undefined && text !== undefined) {
      const move = historyMove(target.root, relativePath, source, createInFolder);
      const patches = planHistoryEdit(text, parseDocument(text).document, data);
      if (patches.length === 0 && !move.changed) {
        return { ok: true, written: [], details: await this.details(target, params.provinceId, params.popDate) };
      }
      destination = move.destination;
      updated = applyPatches(text, patches);
      const moved = await this.moveHistoryFile(move, source, params.dryRun === true);
      if (moved !== undefined) {
        return { ok: false, reason: moved };
      }
    } else {
      // The game gives a sea province a name and a unit point and nothing else,
      // and the Definition tab is locked over the form: there is nothing to write.
      if (await this.isSeaProvince(target, params)) {
        return { ok: true, written: [], details: await this.details(target, params.provinceId, params.popDate) };
      }
      const hidden = this.hiddenHistoryFile(target.layers, params.provinceId);
      if (hidden !== undefined) {
        return { ok: false, reason: hiddenHistoryReason(hidden, params.provinceId) };
      }
      const details = await this.details(target, params.provinceId, params.popDate);
      // A province being created is named by the save itself: the table row it
      // writes is not there to be read yet on a dry run.
      const name = historyName(params.create?.name ?? '', details);
      destination = path.join(target.root, PROVINCES_FOLDER, createInFolder ?? '', historyFileNameFor(params.provinceId, name));
      updated = renderProvinceHistory(data);
    }
    const failed = await this.write(destination, updated, 'The history file', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    // The owner may have changed, so the Country Colors layer is read again.
    this.countryColorsByLayers.delete(target.layers.key);
    // A save may have created the file, which the kept walk does not have.
    this.forgetHistoryFiles(target.layers);
    return { ok: true, written: [destination], details: await this.details(target, params.provinceId, params.popDate) };
  }

  /** Put the target's own history file in the folder the form picked; a reason when it will not go. */
  private async moveHistoryFile(move: HistoryMove, source: string, dryRun: boolean): Promise<string | undefined> {
    if (!move.rename || dryRun) {
      return undefined;
    }
    return (await this.host.rename(source, move.destination)) ? undefined : movedHistoryReason(move.folder);
  }

  private async savePops(
    target: Target,
    params: SaveParams,
    pops: readonly PopEntry[],
    createInFile: string | undefined,
  ): Promise<SaveResult> {
    const { provinceId, popDate } = params;
    const known = (await this.popsFiles(target.layers, popDate)).get(provinceId);
    const chosen = createInFile === undefined || createInFile.trim() === '' ? undefined : withTxt(createInFile.trim());
    const relativePath = known ?? (chosen === undefined ? undefined : `${POPS_FOLDER}/${popDate}/${chosen}`);
    if (relativePath === undefined) {
      return { ok: false, reason: 'Pick the pops file the province should be added to.' };
    }
    const source = this.resolve(target.layers, relativePath);
    const text = source === undefined ? undefined : await this.host.readText(source);
    const destination = source !== undefined && isInsideRoot(target.root, source) ? source : path.join(target.root, relativePath);
    const updated =
      text === undefined
        ? renderPopsFile(provinceId, pops)
        : applyPatches(text, planPopsEdit(text, parseDocument(text).document, provinceId, pops));
    if (updated === text) {
      return { ok: true, written: [], details: await this.details(target, provinceId, popDate) };
    }
    const failed = await this.write(destination, updated, 'The pops file', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    this.popsFilesByDate.delete(`${target.layers.key}#${popDate}`);
    return { ok: true, written: [destination], details: await this.details(target, provinceId, popDate) };
  }

  private async savePositions(target: Target, params: SaveParams, data: ProvincePositions): Promise<SaveResult> {
    const { provinceId, popDate } = params;
    const file = await this.scriptFile(target.layers, POSITIONS_FILE);
    const updated = file
      ? applyPatches(file.text, planPositionsEdit(file.text, file.document, provinceId, data))
      : renderPositionsFile(provinceId, data);
    if (updated === file?.text) {
      return { ok: true, written: [], details: await this.details(target, provinceId, popDate) };
    }
    const destination = file && isInsideRoot(target.root, file.absolutePath) ? file.absolutePath : path.join(target.root, POSITIONS_FILE);
    const failed = await this.write(destination, updated, 'map/positions.txt', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    this.scriptByLayers.delete(`${target.layers.key}#${POSITIONS_FILE}`);
    return { ok: true, written: [destination], details: await this.details(target, provinceId, popDate) };
  }

  // --- File access --------------------------------------------------------------

  private resolve(layers: ModLayers, relativePath: string): string | undefined {
    return resolveLayeredFile(layers, this.host.fileSystem, relativePath);
  }

  private listRecursive(layers: ModLayers, relativeFolder: string): string[] {
    return listLayeredFilesRecursive(layers, this.host.fileSystem, relativeFolder);
  }

  /**
   * The province history files the editor works with: every one, unless the mod
   * narrows them to certain subfolders. The pattern is read per call, so a change
   * to the setting takes effect without a restart; the walk behind it is kept,
   * because a mod of this size has thousands of files there and every click asks
   * again. `invalidate` drops it when the files change on disk.
   */
  private provinceHistoryFiles(layers: ModLayers): readonly string[] {
    const pattern = this.host.historyFolderPattern();
    const cached = this.historyFilesByLayers.get(layers.key);
    if (cached && cached.source === pattern?.source) {
      return cached.narrowed;
    }
    const all = cached?.all ?? this.listRecursive(layers, PROVINCES_FOLDER);
    const narrowed = filterHistoryFolders(all, pattern);
    this.historyFilesByLayers.set(layers.key, { all, source: pattern?.source, narrowed });
    return narrowed;
  }

  /** A history file was written or renamed, so the kept walk no longer describes the folder. */
  private forgetHistoryFiles(layers: ModLayers): void {
    this.historyFilesByLayers.delete(layers.key);
  }
}

/**
 * The promise kept under `key`, built on the first ask. A rejection is not
 * kept: the next ask tries again, instead of answering the same error until
 * the caches are dropped.
 */
function cached<T>(store: Map<string, Promise<T>>, key: string, build: () => Promise<T>): Promise<T> {
  const kept = store.get(key);
  if (kept) {
    return kept;
  }
  const building: Promise<T> = build().catch((error: unknown) => {
    if (store.get(key) === building) {
      store.delete(key);
    }
    throw error;
  });
  store.set(key, building);
  return building;
}

/** One spelling for a path however it arrives: the watcher's, the resolver's, the target's. */
function pathKey(absolutePath: string): string {
  return absolutePath.replace(/\\/g, '/').toLowerCase();
}

/** A failure after files were written names them; a dry run wrote none. */
function withWritten(failure: SaveResult & { ok: false }, written: readonly string[], params: SaveParams): SaveResult {
  return written.length === 0 || params.dryRun === true ? failure : { ...failure, written };
}

/**
 * The sections one save writes, in the order they reach disk. Every save but the
 * panel's own writes a single section and is its own only part; `all` is split
 * here so the rest of the save path never has to know about it.
 */
function sectionsOf(params: SaveParams): SaveParams[] {
  if (params.section !== 'all') {
    return [params];
  }
  const base = {
    workspaceFolders: params.workspaceFolders,
    mods: params.mods,
    provinceId: params.provinceId,
    popDate: params.popDate,
    ...(params.create === undefined ? {} : { create: params.create }),
    ...(params.dryRun === undefined ? {} : { dryRun: params.dryRun }),
  };
  const pops = params.pops;
  return [
    { ...base, section: 'history' as const, ...params.history },
    ...(pops === undefined ? [] : [{ ...base, section: 'pops' as const, ...pops }]),
    { ...base, section: 'positions' as const, ...params.positions },
  ];
}

/** The climate this save writes, or undefined when it carries none. */
function climateIn(params: SaveParams): string | undefined {
  return params.section === 'history' ? params.climate : params.create?.climate;
}

function statesIn(params: SaveParams): readonly string[] | undefined {
  return (params.section === 'history' ? params.states : undefined) ?? params.create?.states;
}

function groupLine(file: ScriptFile, name: string | undefined): number {
  const offset = name === undefined ? undefined : groupOffsetOf(file.document, name);
  return offset === undefined ? 0 : lineOf(file.text, offset);
}

function historyName(created: string, details: ProvinceDetails): string {
  if (created.trim() !== '') {
    return created.trim();
  }
  return details.localisation.text !== '' ? details.localisation.text : details.definitionName;
}

/** A kept `history/provinces` walk and the view of it the current pattern gives. */
interface HistoryFiles {
  readonly all: readonly string[];
  /** Source of the pattern `narrowed` was filtered with; undefined when there was none. */
  readonly source: string | undefined;
  readonly narrowed: readonly string[];
}

/** Why a save stops when the only history file of a province sits outside the pattern. */
function hiddenHistoryReason(relativePath: string, provinceId: number): string {
  const folder = historyFolderOf(relativePath);
  const where = folder === '' ? 'directly in history/provinces' : `in '${folder}'`;
  return `Province ${String(provinceId)} already has a history file ${where}, which the province folder pattern hides. Widen victorianTools.mapEditor.provinceFolderPattern to edit that file.`;
}

/**
 * Where a save writes a history file that already exists. The form says which
 * subfolder it should sit in: left as it is, the save writes where it always
 * did; changed, the file moves — or, for a file another layer owns, the copy
 * this mod takes is written in the new folder, the old one being none of ours.
 */
function historyMove(
  root: string,
  relativePath: string,
  source: string,
  wantedFolder: string | undefined,
): HistoryMove {
  const inTarget = isInsideRoot(root, source);
  const folder = wantedFolder ?? historyFolderOf(relativePath);
  const changed = folder !== historyFolderOf(relativePath);
  return {
    destination: !changed && inTarget ? source : path.join(root, PROVINCES_FOLDER, folder, path.basename(relativePath)),
    folder,
    changed,
    rename: changed && inTarget,
  };
}

interface HistoryMove {
  readonly destination: string;
  /** The folder the file should end up in. */
  readonly folder: string;
  /** The form picked another folder than the one the file sits in. */
  readonly changed: boolean;
  /** The file is the target's own, so it is moved rather than copied. */
  readonly rename: boolean;
}

/**
 * The save names a history file when it creates a province or renames its file.
 * The game reads a file name as plain ASCII, so an accent is folded away
 * (`São` becomes `Sao`); a name with no ASCII shape at all is refused here
 * rather than written under a name the game would never find.
 */
function fileNameReason(params: SaveParams): string | undefined {
  const named = [
    ...(params.create === undefined ? [] : [params.create.name]),
    ...(params.section === 'history' && params.localisation?.renameHistoryFile === true ? [params.localisation.text] : []),
  ];
  for (const name of named) {
    const stray = unfoldableCharacter(name);
    if (stray !== undefined) {
      return `'${stray}' has no ASCII letter to stand for it, and the game reads a file name as plain ASCII. Name the province without it, or leave the history file its current name.`;
    }
  }
  return undefined;
}

/** A move the file system refused: the usual cause is a file of that name already there. */
function movedHistoryReason(folder: string): string {
  const where = folder === '' ? 'directly into history/provinces' : `into '${folder}'`;
  return `The history file could not be moved ${where}; check that no file of the same name is there already.`;
}

function withTxt(fileName: string): string {
  return fileName.toLowerCase().endsWith('.txt') ? fileName : `${fileName}.txt`;
}

/** 0-based line of an offset. */
function lineOf(text: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charCodeAt(index) === 10) {
      line++;
    }
  }
  return line;
}
