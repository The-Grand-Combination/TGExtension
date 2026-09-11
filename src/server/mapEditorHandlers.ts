import * as path from 'node:path';
import {
  type FileRef,
  type HistorySection,
  type LocSection,
  type MapEditorMapResult,
  type MapEditorTargetParams,
  type PopEntry,
  type PopsSection,
  type ProvinceDetails,
  type ProvinceHistory,
  type ProvinceRequestParams,
  type ProvinceResult,
  type SaveParams,
  type SaveResult,
  type TerrainPictureParams,
  type TerrainPictureResult,
  type TerrainSection,
} from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import { decodeBmp, indicesOf, type BmpImage } from '../services/bmpDecoder.js';
import { vocabularyOf } from '../services/mapEditorVocabulary.js';
import {
  listLayeredFiles,
  listLayeredFilesRecursive,
  resolveLayeredFile,
  type LayerFileSystem,
  type ModLayers,
} from '../services/modLayers.js';
import { isInsideRoot, type FileLocation } from '../services/modLayout.js';
import {
  findHistoryFile,
  historyFoldersOf,
  parseProvinceHistory,
  planHistoryEdit,
  renderProvinceHistory,
} from '../services/provinceHistoryEdit.js';
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
} from '../services/provinceLocEdit.js';
import {
  findPopsBlock,
  parsePops,
  planPopsEdit,
  popDatesOf,
  popFilesOf,
  provinceIdsInPopsFile,
  renderPopsFile,
} from '../services/provincePopsEdit.js';
import { parseProvinceDefinitions, parseProvinceRows } from '../services/provinceTable.js';
import { parseDocument } from '../services/syntaxValidation.js';
import {
  dominantTerrainByProvince,
  terrainPictureDataUri,
  terrainSpriteTextures,
  terrainTypeByIndex,
  textureCandidates,
} from '../services/terrainPictures.js';
import { applyPatches } from '../services/textPatch.js';

/** What the Map Editor needs from the server: the mod stack, its index, and file access. */
export interface MapEditorHost {
  /** The picked mods in load order, as the reports resolve them. */
  readonly targets: (params: MapEditorTargetParams) => readonly FileLocation[];
  readonly modNameOf: (root: string) => string;
  readonly ensureIndex: (layers: ModLayers) => Promise<ModIndex | undefined>;
  readonly fileSystem: LayerFileSystem;
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
  readonly readBytes: (absolutePath: string) => Promise<Uint8Array | undefined>;
  readonly writeText: (absolutePath: string, text: string) => Promise<boolean>;
  readonly rename: (fromPath: string, toPath: string) => Promise<boolean>;
}

const PROVINCES_FOLDER = 'history/provinces';
const POPS_FOLDER = 'history/pops';
/** Width the terrain picture is scaled to before it is sent to the page. */
const TERRAIN_PICTURE_MAX_WIDTH = 440;

/** What a stack knows about terrain pictures; built once per stack, on the first map request. */
interface TerrainInfo {
  /** Terrain name (lowercase) → texture path, from `GFX_terrainimg_<terrain>` sprites. */
  readonly textures: ReadonlyMap<string, string>;
  /** Province id → the terrain category most of its terrain.bmp pixels carry. */
  readonly dominant: ReadonlyMap<number, string>;
}

/** A resolved target: the mod that receives edits, the stack it is read with, and the stack's index. */
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

  constructor(private readonly host: MapEditorHost) {}

  /** Mod files changed on disk: pops files, terrain sprites and pictures may all have changed. */
  invalidate(): void {
    this.popsFilesByDate.clear();
    this.terrainByLayers.clear();
    this.pictureByPath.clear();
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
      definitions,
      seaProvinces: [...target.index.seaProvinces].map(Number).filter((id) => Number.isInteger(id)),
      popDates,
      historyFolders: historyFoldersOf(this.listRecursive(target.layers, PROVINCES_FOLDER)),
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
    }
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

  // --- Reading ------------------------------------------------------------------

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
    return {
      id: provinceId,
      definitionName: definitions.find((definition) => definition.id === provinceId)?.name ?? '',
      isSea: target.index.seaProvinces.has(String(provinceId)),
      localisation: this.readLocalisation(target, provinceId),
      history,
      pops: await this.readPops(target, provinceId, popDate),
      terrain: await this.readTerrain(target, provinceId, history),
      vocabulary: vocabularyOf(target.index),
    };
  }

  // --- Terrain ------------------------------------------------------------------

  /** The history's `terrain`, else the dominant terrain.bmp category; the picture of whichever has one. */
  private async readTerrain(target: Target, provinceId: number, history: HistorySection): Promise<TerrainSection> {
    const info = await this.terrainInfo(target.layers);
    const fromHistory = history.data?.terrain;
    const dominant = info.dominant.get(provinceId);
    const name = fromHistory ?? dominant;
    for (const candidate of new Set([name, dominant])) {
      const picture = candidate === undefined ? undefined : await this.terrainPicture(target.layers, info, candidate);
      if (picture !== undefined) {
        return { name, fromHistory: fromHistory !== undefined, dominant, pictureDataUri: picture };
      }
    }
    return { name, fromHistory: fromHistory !== undefined, dominant, pictureDataUri: undefined };
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
    const relativePath = findHistoryFile(this.listRecursive(target.layers, PROVINCES_FOLDER), provinceId);
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

  // --- Writing ------------------------------------------------------------------

  private async saveLocalisation(
    target: Target,
    params: ProvinceRequestParams,
    text: string,
    renameHistoryFile: boolean,
  ): Promise<SaveResult> {
    const key = provinceLocKey(params.provinceId);
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
    const relativePath = findHistoryFile(this.listRecursive(target.layers, PROVINCES_FOLDER), params.provinceId);
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

  // --- File access --------------------------------------------------------------

  private resolve(layers: ModLayers, relativePath: string): string | undefined {
    return resolveLayeredFile(layers, this.host.fileSystem, relativePath);
  }

  private listRecursive(layers: ModLayers, relativeFolder: string): string[] {
    return listLayeredFilesRecursive(layers, this.host.fileSystem, relativeFolder);
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
