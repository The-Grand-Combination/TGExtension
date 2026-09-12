import * as path from 'node:path';
import type { Document } from '../model/ast.js';
import {
  type FileRef,
  type HistorySection,
  type LocSection,
  type MapCountryColors,
  type MapCountryColorsResult,
  type MapEditorMapResult,
  type MapEditorTargetParams,
  type MapPositionsResult,
  type PopEntry,
  type PopsSection,
  type PositionsSection,
  type ProvinceDetails,
  type ProvinceHistory,
  type ProvincePositions,
  type ProvinceRequestParams,
  type ProvinceResult,
  type Rgb,
  type SaveParams,
  type SaveResult,
  type TerrainPictureParams,
  type TerrainPictureResult,
  type TerrainSection,
} from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import { decodeBmp, indicesOf, type BmpImage } from './bmpDecoder.js';
import { countryColorOf, countryFilesOf, provinceOwnerOf } from './countryColors.js';
import { vocabularyOf } from './mapEditorVocabulary.js';
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
  renderPositionsFile,
} from './provincePositionsEdit.js';
import { parseProvinceDefinitions, parseProvinceRows } from './provinceTable.js';
import { parseDocument } from './syntaxValidation.js';
import {
  dominantTerrainByProvince,
  terrainPictureDataUri,
  terrainSpriteTextures,
  terrainTypeByIndex,
  textureCandidates,
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
  readonly rename: (fromPath: string, toPath: string) => Promise<boolean>;
  /** The mod's code page, asked at save time so the setting can change meanwhile. */
  readonly codepage: () => Codepage;
  /** Narrows which `history/provinces` subfolders count; undefined is all of them. */
  readonly historyFolderPattern: () => RegExp | undefined;
}

const PROVINCES_FOLDER = 'history/provinces';
const COUNTRIES_FILE = 'common/countries.txt';
/** History files read at once while collecting owners. */
const OWNER_BATCH = 64;
const POPS_FOLDER = 'history/pops';
const POSITIONS_FILE = 'map/positions.txt';
/** The terrain a sea province shows, and the picture the game draws for it. */
const OCEAN_TERRAIN = 'ocean';
const OCEAN_TEXTURE = 'gfx/interface/terrain/terrain_ocean.tga';
const BUNDLED_OCEAN_PICTURE = 'terrain_ocean.dds';
const TERRAIN_PICTURE_MAX_WIDTH = 440;

/** What a stack knows about terrain pictures; built once per stack, on the first map request. */
interface TerrainInfo {
  /** Terrain name (lowercase) → texture path, from `GFX_terrainimg_<terrain>` sprites. */
  readonly textures: ReadonlyMap<string, string>;
  /** Province id → the terrain category most of its terrain.bmp pixels carry. */
  readonly dominant: ReadonlyMap<number, string>;
}

/** `map/positions.txt` as the stack resolves it, parsed once: the file has a block per province and is asked for often. */
interface PositionsFile {
  readonly absolutePath: string;
  readonly text: string;
  readonly document: Document;
}

interface Target {
  readonly root: string;
  readonly layers: ModLayers;
  readonly index: ModIndex;
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
  /** Terrain pictures by absolute path, as sent to the page; a miss is remembered too. */
  private readonly pictureByPath = new Map<string, string | undefined>();
  /** `<layers key>` → the parsed positions file, or undefined when the stack has none. */
  private readonly positionsByLayers = new Map<string, Promise<PositionsFile | undefined>>();
  /** `<layers key>` → start-date owners and country colours, for the page's Country Colors layer. */
  private readonly countryColorsByLayers = new Map<string, Promise<MapCountryColorsResult>>();

  constructor(private readonly host: MapEditorHost) {}

  /** Mod files changed on disk: pops files, positions, terrain sprites and pictures may all have changed. */
  invalidate(): void {
    this.popsFilesByDate.clear();
    this.terrainByLayers.clear();
    this.pictureByPath.clear();
    this.positionsByLayers.clear();
    this.countryColorsByLayers.clear();
  }

  async map(params: MapEditorTargetParams): Promise<MapEditorMapResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const provincesBmpPath = this.resolve(target.layers, 'map/provinces.bmp');
    const definitionPath = this.resolve(target.layers, 'map/definition.csv');
    if (provincesBmpPath === undefined || definitionPath === undefined) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/provinces.bmp or map/definition.csv.' };
    }
    const definitions = parseProvinceDefinitions((await this.host.readText(definitionPath)) ?? '');
    // Reading both bitmaps takes a moment; start now so the first click finds it done.
    void this.terrainInfo(target.layers);
    const popPaths = this.listRecursive(target.layers, POPS_FOLDER);
    const popDates = popDatesOf(popPaths);
    return {
      kind: 'ready',
      targetName: this.host.modNameOf(target.root),
      targetRoot: target.root,
      provincesBmpPath,
      riversBmpPath: this.resolve(target.layers, 'map/rivers.bmp'),
      definitions,
      seaProvinces: [...target.index.seaProvinces].map(Number).filter((id) => Number.isInteger(id)),
      popDates,
      historyFolders: historyFoldersOf(this.provinceHistoryFiles(target.layers)),
      popFiles: Object.fromEntries(popDates.map((date) => [date, popFilesOf(popPaths, date)])),
    };
  }

  async province(params: ProvinceRequestParams): Promise<ProvinceResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    return { kind: 'details', details: await this.details(target, params.provinceId, params.popDate) };
  }

  async save(params: SaveParams): Promise<SaveResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { ok: false, reason: target };
    }
    switch (params.section) {
      case 'localisation':
        return this.saveLocalisation(target, params, params.text, params.renameHistoryFile);
      case 'history':
        return this.saveHistory(target, params, params.data, params.createInFolder);
      case 'pops':
        return this.savePops(target, params, params.pops, params.createInFile);
      case 'positions':
        return this.savePositions(target, params, params.data);
    }
  }

  /** Every editable point of `map/positions.txt`, for the page to draw over the map. */
  async positions(params: MapEditorTargetParams): Promise<MapPositionsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const file = await this.positionsFile(target.layers);
    if (!file) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/positions.txt.' };
    }
    return { kind: 'ready', markers: positionMarkersOf(file.document) };
  }

  /** Who owns each province at the start date and the colour of each owner, for the page to tint the map. */
  async countryColors(params: MapEditorTargetParams): Promise<MapCountryColorsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const cached = this.countryColorsByLayers.get(target.layers.key);
    if (cached) {
      return cached;
    }
    const loading = this.readCountryColors(target.layers);
    this.countryColorsByLayers.set(target.layers.key, loading);
    return loading;
  }

  /** The picture of one terrain, for the page to preview a terrain the user picked but has not saved. */
  async terrainPictureFor(params: TerrainPictureParams): Promise<TerrainPictureResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { terrain: params.terrain, pictureDataUri: undefined };
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
    const definitionPath = this.resolve(target.layers, 'map/definition.csv');
    const definitions = parseProvinceDefinitions(
      definitionPath === undefined ? '' : ((await this.host.readText(definitionPath)) ?? ''),
    );
    const history = await this.readHistory(target, provinceId);
    const isSea = target.index.seaProvinces.has(String(provinceId));
    return {
      id: provinceId,
      definitionName: definitions.find((definition) => definition.id === provinceId)?.name ?? '',
      isSea,
      localisation: this.readLocalisation(target, provinceId),
      history,
      pops: await this.readPops(target, provinceId, popDate),
      positions: await this.readPositions(target, provinceId),
      terrain: await this.readTerrain(target, provinceId, history, isSea),
      vocabulary: vocabularyOf(target.index),
    };
  }

  /** The history's `terrain`, else the dominant terrain.bmp category, with that terrain's own picture. */
  private async readTerrain(
    target: Target,
    provinceId: number,
    history: HistorySection,
    isSea: boolean,
  ): Promise<TerrainSection> {
    if (isSea) {
      return { name: OCEAN_TERRAIN, fromHistory: false, dominant: undefined, pictureDataUri: await this.oceanPicture(target.layers) };
    }
    const info = await this.terrainInfo(target.layers);
    const fromHistory = history.data?.terrain;
    const dominant = info.dominant.get(provinceId);
    const name = fromHistory ?? dominant;
    // Only the named terrain's own sprite. A province with no terrain, or one
    // whose terrain has no sprite, shows no picture: another terrain's would
    // read as this province's.
    const pictureDataUri = name === undefined ? undefined : await this.terrainPicture(target.layers, info, name);
    return { name, fromHistory: fromHistory !== undefined, dominant, pictureDataUri };
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
    if (!this.pictureByPath.has(absolutePath)) {
      const bytes = await this.host.readBytes(absolutePath);
      this.pictureByPath.set(
        absolutePath,
        bytes === undefined ? undefined : terrainPictureDataUri(bytes, path.basename(absolutePath), TERRAIN_PICTURE_MAX_WIDTH),
      );
    }
    return this.pictureByPath.get(absolutePath);
  }

  private terrainInfo(layers: ModLayers): Promise<TerrainInfo> {
    const cached = this.terrainByLayers.get(layers.key);
    if (cached) {
      return cached;
    }
    const building = this.buildTerrainInfo(layers).catch((): TerrainInfo => ({ textures: new Map(), dominant: new Map() }));
    this.terrainByLayers.set(layers.key, building);
    return building;
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
    const provinces = await this.readBitmap(layers, 'map/provinces.bmp');
    const terrain = await this.readBitmap(layers, 'map/terrain.bmp');
    const terrainTextPath = this.resolve(layers, 'map/terrain.txt');
    const definitionPath = this.resolve(layers, 'map/definition.csv');
    if (!provinces || !terrain || terrainTextPath === undefined || definitionPath === undefined) {
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
    const rows = parseProvinceRows((await this.host.readText(definitionPath)) ?? '');
    return dominantTerrainByProvince(provinces, indicesOf(terrain), rows, typeByIndex);
  }

  private async readBitmap(layers: ModLayers, relativePath: string): Promise<BmpImage | undefined> {
    const absolutePath = this.resolve(layers, relativePath);
    const bytes = absolutePath === undefined ? undefined : await this.host.readBytes(absolutePath);
    const decoded = bytes === undefined ? undefined : decodeBmp(bytes);
    return decoded?.kind === 'image' ? decoded.image : undefined;
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
    if (absolutePath === undefined || text === undefined) {
      return { file: undefined, inTarget: false, data: undefined };
    }
    return {
      file: { absolutePath, line: 0 },
      inTarget: isInsideRoot(target.root, absolutePath),
      data: parseProvinceHistory(parseDocument(text).document),
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
    const file = await this.positionsFile(target.layers);
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
    const result: MapCountryColors = { kind: 'ready', owners, colors };
    return result;
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

  private positionsFile(layers: ModLayers): Promise<PositionsFile | undefined> {
    const cached = this.positionsByLayers.get(layers.key);
    if (cached) {
      return cached;
    }
    const loading = (async (): Promise<PositionsFile | undefined> => {
      const absolutePath = this.resolve(layers, POSITIONS_FILE);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      return absolutePath === undefined || text === undefined
        ? undefined
        : { absolutePath, text, document: parseDocument(text).document };
    })();
    this.positionsByLayers.set(layers.key, loading);
    return loading;
  }

  // --- Writing ------------------------------------------------------------------

  private async saveLocalisation(
    target: Target,
    params: ProvinceRequestParams,
    text: string,
    renameHistoryFile: boolean,
  ): Promise<SaveResult> {
    const key = provinceLocKey(params.provinceId);
    // The only free text a save carries. Asking first turns what would be a
    // silent mangling into a reason the page can show.
    const codepage = this.host.codepage();
    const stray = unrepresentableIn(text, codepage);
    if (stray !== undefined) {
      return { ok: false, reason: `'${stray}' cannot be stored in ${codepage}; the game reads this mod one byte per character.` };
    }
    const written = await this.writeLocalisation(target, key, text);
    if (written === undefined) {
      return { ok: false, reason: 'The localisation file could not be written.' };
    }
    const files = [written.absolutePath];
    if (renameHistoryFile) {
      const renamed = await this.renameHistoryFile(target, params.provinceId, text);
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
  private async writeLocalisation(target: Target, key: string, text: string): Promise<FileRef | undefined> {
    const current = this.readLocalisation(target, Number(key.slice('PROV'.length)));
    const absolutePath =
      current.file !== undefined && current.inTarget
        ? current.file.absolutePath
        : path.join(target.root, 'localisation', await this.locFileForNewKey(target.root));
    const existing = await this.host.readText(absolutePath);
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
  private async renameHistoryFile(target: Target, provinceId: number, name: string): Promise<string | undefined> {
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
    return (await this.host.rename(current, destination)) ? destination : undefined;
  }

  private async saveHistory(
    target: Target,
    params: ProvinceRequestParams,
    data: ProvinceHistory,
    createInFolder: string | undefined,
  ): Promise<SaveResult> {
    const relativePath = findHistoryFile(this.provinceHistoryFiles(target.layers), params.provinceId);
    const source = relativePath === undefined ? undefined : this.resolve(target.layers, relativePath);
    const text = source === undefined ? undefined : await this.host.readText(source);
    let destination: string;
    let updated: string;
    if (relativePath !== undefined && source !== undefined && text !== undefined) {
      const patches = planHistoryEdit(text, parseDocument(text).document, data);
      if (patches.length === 0) {
        return { ok: true, written: [], details: await this.details(target, params.provinceId, params.popDate) };
      }
      destination = isInsideRoot(target.root, source) ? source : path.join(target.root, relativePath);
      updated = applyPatches(text, patches);
    } else {
      const details = await this.details(target, params.provinceId, params.popDate);
      const name = details.localisation.text !== '' ? details.localisation.text : details.definitionName;
      destination = path.join(target.root, PROVINCES_FOLDER, createInFolder ?? '', historyFileNameFor(params.provinceId, name));
      updated = renderProvinceHistory(data);
    }
    if (!(await this.host.writeText(destination, updated))) {
      return { ok: false, reason: 'The history file could not be written.' };
    }
    // The owner may have changed, so the Country Colors layer is read again.
    this.countryColorsByLayers.delete(target.layers.key);
    return { ok: true, written: [destination], details: await this.details(target, params.provinceId, params.popDate) };
  }

  private async savePops(
    target: Target,
    params: ProvinceRequestParams,
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
    if (!(await this.host.writeText(destination, updated))) {
      return { ok: false, reason: 'The pops file could not be written.' };
    }
    this.popsFilesByDate.delete(`${target.layers.key}#${popDate}`);
    return { ok: true, written: [destination], details: await this.details(target, provinceId, popDate) };
  }

  private async savePositions(target: Target, params: ProvinceRequestParams, data: ProvincePositions): Promise<SaveResult> {
    const { provinceId, popDate } = params;
    const file = await this.positionsFile(target.layers);
    const updated = file
      ? applyPatches(file.text, planPositionsEdit(file.text, file.document, provinceId, data))
      : renderPositionsFile(provinceId, data);
    if (updated === file?.text) {
      return { ok: true, written: [], details: await this.details(target, provinceId, popDate) };
    }
    const destination = file && isInsideRoot(target.root, file.absolutePath) ? file.absolutePath : path.join(target.root, POSITIONS_FILE);
    if (!(await this.host.writeText(destination, updated))) {
      return { ok: false, reason: 'map/positions.txt could not be written.' };
    }
    this.positionsByLayers.delete(target.layers.key);
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
   * to the setting takes effect without a restart.
   */
  private provinceHistoryFiles(layers: ModLayers): string[] {
    return filterHistoryFolders(this.listRecursive(layers, PROVINCES_FOLDER), this.host.historyFolderPattern());
  }
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
