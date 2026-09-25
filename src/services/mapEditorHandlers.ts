import {
  POPS_FOLDER,
  POSITIONS_FILE,
  PROVINCES_BMP,
  REGION_FILE,
  RIVERS_BMP,
  TERRAIN_BMP,
  TERRAIN_FILE,
} from '../model/gamePaths.js';
import type {
  MapCountryColorsResult,
  MapEditorMapResult,
  MapEditorTargetParams,
  MapPositionsResult,
  MapStateColorsResult,
  MapThumbnails,
  NewProvinceParams,
  PaintLayer,
  PaintParams,
  PaintResult,
  ProvinceRequestParams,
  ProvinceResult,
  SaveParams,
  SaveResult,
  TerrainPictureParams,
  TerrainPictureResult,
} from '../model/mapEditor.js';
import type { ModIndex } from '../model/modIndex.js';
import type { Codepage } from '../io/textCodec.js';
import { decodeBmp } from './bmpDecoder.js';
import { MapEditorCountryColors } from './mapEditorCountryColors.js';
import { MapEditorDetails } from './mapEditorDetails.js';
import { MapEditorProvinceFiles } from './mapEditorProvinceFiles.js';
import { MapEditorSave } from './mapEditorSave.js';
import { MapEditorStack, pathKey, type Target } from './mapEditorStack.js';
import { MapEditorTerrain } from './mapEditorTerrain.js';
import { MapEditorThumbnails } from './mapEditorThumbnails.js';
import { vocabularyOf } from './mapEditorVocabulary.js';
import { MapEditorWriter } from './mapEditorWriter.js';
import type { LayerFileSystem, ModLayers } from './modLayers.js';
import type { FileLocation } from './modLayout.js';
import { nextProvinceId, rowOfColor } from './provinceDefinitionEdit.js';
import { firstGroupByProvince } from './provinceGroupEdit.js';
import { historyFoldersOf } from './provinceHistoryEdit.js';
import { readProvinceLoc } from './provinceLocEdit.js';
import { applyIndexRuns, applyRuns } from './provincePaint.js';
import { popDatesOf, popFilesOf } from './provincePopsEdit.js';
import { positionMarkersOf, provinceLabelsOf } from './provincePositionsEdit.js';
import { plainsTerrainIndex, terrainNamesOf, terrainTypeByIndex, waterTerrainIndices } from './terrainPictures.js';

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

const LAYER_FILES: Record<PaintLayer, string> = { provinces: PROVINCES_BMP, rivers: RIVERS_BMP, terrain: TERRAIN_BMP };

/**
 * The server side of the Map Editor: the requests, each routed to the
 * collaborator that owns the files and the cache it needs. Files are read
 * through the mod stack and written only inside the target mod.
 */
export class MapEditorHandlers {
  private readonly stack: MapEditorStack;
  private readonly terrain: MapEditorTerrain;
  private readonly thumbnailBuilder: MapEditorThumbnails;
  private readonly provinceFiles: MapEditorProvinceFiles;
  private readonly writer: MapEditorWriter;
  private readonly details: MapEditorDetails;
  private readonly colors: MapEditorCountryColors;
  private readonly saver: MapEditorSave;

  constructor(private readonly host: MapEditorHost) {
    this.stack = new MapEditorStack(host);
    this.terrain = new MapEditorTerrain(host, this.stack);
    this.thumbnailBuilder = new MapEditorThumbnails(this.stack);
    this.provinceFiles = new MapEditorProvinceFiles(host, this.stack);
    this.writer = new MapEditorWriter(host);
    this.details = new MapEditorDetails(host, this.stack, this.terrain, this.provinceFiles);
    this.colors = new MapEditorCountryColors(host, this.stack, this.provinceFiles);
    this.saver = new MapEditorSave(host, this.stack, this.provinceFiles, this.writer, this.details, this.colors);
  }

  /** Mod files changed on disk; without paths, everything goes. */
  invalidate(changed?: readonly string[]): void {
    if (changed === undefined) {
      this.provinceFiles.clear();
      this.terrain.clear();
      this.stack.clear();
      this.colors.clear();
      this.thumbnailBuilder.clear();
      return;
    }
    for (const fsPath of changed) {
      this.invalidatePath(fsPath);
    }
  }

  private invalidatePath(fsPath: string): void {
    const key = pathKey(fsPath);
    if (key.includes('/map/') && key.endsWith('.bmp')) {
      this.thumbnailBuilder.clear();
      this.terrain.forgetTable();
    } else if (key.endsWith('/map/definition.csv')) {
      this.stack.forgetAllDefinitions();
      this.terrain.forgetTable();
    } else if (key.includes('/map/') && (key.endsWith('.txt') || key.endsWith('/default.map'))) {
      this.stack.forgetAllScripts();
      if (key.endsWith('/map/terrain.txt')) {
        this.terrain.forgetTable();
      }
    } else if (key.includes('/history/provinces/')) {
      this.provinceFiles.forgetAllHistory();
      this.colors.clear();
    } else if (key.includes('/history/pops/')) {
      this.provinceFiles.forgetAllPops();
    } else if (key.includes('/common/countries')) {
      this.colors.clear();
    } else if (key.includes('/interface/') && key.endsWith('.gfx')) {
      this.terrain.forgetTable();
    } else if (key.includes('/gfx/')) {
      this.terrain.forgetPicture(key);
    }
  }

  async map(params: MapEditorTargetParams): Promise<MapEditorMapResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const provincesBmpPath = this.stack.resolve(target.layers, PROVINCES_BMP);
    const table = await this.stack.definitions(target.layers);
    if (provincesBmpPath === undefined || table.absolutePath === undefined) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/provinces.bmp or map/definition.csv.' };
    }
    void this.terrain.info(target.layers);
    const popPaths = this.stack.listRecursive(target.layers, POPS_FOLDER);
    const popDates = popDatesOf(popPaths);
    const terrainText = await this.stack.scriptFile(target.layers, TERRAIN_FILE);
    const typeByIndex = terrainText ? terrainTypeByIndex(terrainText.document) : new Map<number, string>();
    const water = terrainText ? waterTerrainIndices(terrainText.document) : new Set<number>();
    return {
      kind: 'ready',
      targetName: this.host.modNameOf(target.root),
      targetRoot: target.root,
      provincesBmpPath,
      riversBmpPath: this.stack.resolve(target.layers, RIVERS_BMP),
      terrainBmpPath: this.stack.resolve(target.layers, TERRAIN_BMP),
      waterTerrainIndices: [...water].sort((a, b) => a - b),
      terrainNames: terrainNamesOf(typeByIndex),
      plainsTerrainIndex: plainsTerrainIndex(typeByIndex, water),
      definitions: table.definitions,
      lakeColors: table.rows.flatMap((row) => (row.id === undefined ? [row.color] : [])),
      seaProvinces: [...await this.details.seaProvinces(target)].map(Number).filter((id) => Number.isInteger(id)),
      popDates,
      historyFolders: historyFoldersOf(this.provinceFiles.historyFiles(target.layers)),
      popFiles: Object.fromEntries(popDates.map((date) => [date, popFilesOf(popPaths, date)])),
      vocabulary: vocabularyOf(target.index),
    };
  }

  async province(params: ProvinceRequestParams): Promise<ProvinceResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    return { kind: 'details', details: await this.details.of(target, params.provinceId, params.popDate) };
  }

  /** A colour no row of `definition.csv` names: the next free id, with every section empty. */
  async newProvince(params: NewProvinceParams): Promise<ProvinceResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const rows = (await this.stack.definitions(target.layers)).rows;
    const taken = rowOfColor(rows, params.color);
    if (taken) {
      const what = taken.id === undefined ? `the lake ${taken.name}` : `province ${String(taken.id)}`;
      return { kind: 'unavailable', reason: `That colour is already ${what} in map/definition.csv.` };
    }
    return { kind: 'details', details: await this.details.of(target, nextProvinceId(rows), params.popDate) };
  }

  /** One section of one province, creating the province first when it only exists as paint. */
  async save(params: SaveParams): Promise<SaveResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { ok: false, reason: target };
    }
    return this.writer.serialized(target.root, () => this.saver.save(target, params));
  }

  /** The painted pixels into one of the three map bitmaps, written into the target as its own copy. */
  async paint(params: PaintParams): Promise<PaintResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { ok: false, reason: target };
    }
    return this.writer.serialized(target.root, () => this.paintInto(target, params));
  }

  private async paintInto(target: Target, params: PaintParams): Promise<PaintResult> {
    const relative = LAYER_FILES[params.layer];
    const source = this.stack.resolve(target.layers, relative);
    const bytes = source === undefined ? undefined : await this.host.readBytes(source);
    if (bytes === undefined) {
      return { ok: false, reason: `The picked mods have no ${relative}.` };
    }
    const decoded = decodeBmp(bytes);
    if (decoded.kind === 'error') {
      return { ok: false, reason: `${relative} could not be read: ${decoded.reason}.` };
    }
    const outcome = params.layer === 'provinces' ? applyRuns(decoded.image, params.runs) : applyIndexRuns(decoded.image, params.runs);
    if (!outcome.ok) {
      return { ok: false, reason: `${relative} ${outcome.reason}.` };
    }
    const destination = this.writer.destinationFor(target.root, source, relative);
    if (!(await this.writer.writeBytes(destination, bytes))) {
      return { ok: false, reason: `${relative} could not be written.` };
    }
    this.thumbnailBuilder.forget(target.layers.key);
    this.terrain.forgetTable();
    return { ok: true, layer: params.layer, path: destination, pixels: outcome.pixels };
  }

  async thumbnails(params: MapEditorTargetParams): Promise<MapThumbnails> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return {};
    }
    return this.thumbnailBuilder.of(target.layers);
  }

  /** Every editable point of `map/positions.txt`, for the page to draw over the map. */
  async positions(params: MapEditorTargetParams): Promise<MapPositionsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const file = await this.stack.scriptFile(target.layers, POSITIONS_FILE);
    if (!file) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/positions.txt.' };
    }
    const labels = provinceLabelsOf(file.document, (id) => readProvinceLoc(target.index, id).text);
    return { kind: 'ready', markers: positionMarkersOf(file.document), labels };
  }

  async countryColors(params: MapEditorTargetParams): Promise<MapCountryColorsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    return this.colors.of(target.layers);
  }

  /** The first state of `map/region.txt` naming each province. */
  async stateColors(params: MapEditorTargetParams): Promise<MapStateColorsResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { kind: 'unavailable', reason: target };
    }
    const file = await this.stack.scriptFile(target.layers, REGION_FILE);
    if (!file) {
      return { kind: 'unavailable', reason: 'The picked mods have no map/region.txt.' };
    }
    const states: Record<string, string> = {};
    for (const [id, name] of firstGroupByProvince(file.document)) {
      states[String(id)] = name;
    }
    return { kind: 'ready', states };
  }

  /** The picture of one terrain, for a terrain the user picked but has not saved; '' is "no terrain". */
  async terrainPictureFor(params: TerrainPictureParams): Promise<TerrainPictureResult> {
    const target = await this.resolveTarget(params);
    if (typeof target === 'string') {
      return { terrain: params.terrain, pictureDataUri: undefined };
    }
    if (params.terrain === '') {
      return { terrain: params.terrain, pictureDataUri: await this.terrain.noTerrainPicture() };
    }
    const info = await this.terrain.info(target.layers);
    return { terrain: params.terrain, pictureDataUri: await this.terrain.pictureOf(target.layers, info, params.terrain) };
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
}
