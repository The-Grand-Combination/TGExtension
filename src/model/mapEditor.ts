import { requestDescriptor } from './request.js';
import type { ReferenceLayer } from '../services/referenceLayers.js';
/**
 * The Map Editor: a province map the user clicks on to edit one province's
 * localisation, history file, pops and map positions. Custom LSP requests carry
 * the map, the map's position markers, one province's details, and one
 * section's save.
 */

export const MAP_EDITOR_MAP_REQUEST = requestDescriptor<MapEditorTargetParams, MapEditorMapResult>('victorianTools/mapEditor/map');
export const MAP_EDITOR_PROVINCE_REQUEST = requestDescriptor<ProvinceRequestParams, ProvinceResult>('victorianTools/mapEditor/province');
export const MAP_EDITOR_SAVE_REQUEST = requestDescriptor<SaveParams, SaveResult>('victorianTools/mapEditor/save');
export const MAP_EDITOR_TERRAIN_PICTURE_REQUEST = requestDescriptor<TerrainPictureParams, TerrainPictureResult>('victorianTools/mapEditor/terrainPicture');
export const MAP_EDITOR_POSITIONS_REQUEST = requestDescriptor<MapEditorTargetParams, MapPositionsResult>('victorianTools/mapEditor/positions');
export const MAP_EDITOR_COUNTRY_COLORS_REQUEST = requestDescriptor<MapEditorTargetParams, MapCountryColorsResult>('victorianTools/mapEditor/countryColors');
export const MAP_EDITOR_PAINT_REQUEST = requestDescriptor<PaintParams, PaintResult>('victorianTools/mapEditor/paint');
export const MAP_EDITOR_NEW_PROVINCE_REQUEST = requestDescriptor<NewProvinceParams, ProvinceResult>('victorianTools/mapEditor/newProvince');
export const MAP_EDITOR_THUMBNAILS_REQUEST = requestDescriptor<MapEditorTargetParams, MapThumbnails>('victorianTools/mapEditor/thumbnails');
export const MAP_EDITOR_STATE_COLORS_REQUEST = requestDescriptor<MapEditorTargetParams, MapStateColorsResult>('victorianTools/mapEditor/stateColors');

/** `victorianTools.mapEditor.countryColorsTint`: percent of the owner's colour in the Country Colors layer. */
export const DEFAULT_COUNTRY_COLORS_TINT = 82;

/** `victorianTools.mapEditor.paintUndoSteps`: how many brush strokes the page can take back. */
export const DEFAULT_PAINT_UNDO_STEPS = 20;

/** `victorianTools.mapEditor.provinceFolderPattern`: empty, so every subfolder counts. */
export const DEFAULT_PROVINCE_FOLDER_PATTERN = '';

/**
 * Vanilla's `max_provinces`. A province id at or below it is one the base game
 * already names, so the Map Editor leaves the rename of its history file unticked:
 * those file names are what every other tool expects to find. A higher id is a
 * province the mod added itself, and there the file follows the name being saved.
 */
export const VANILLA_MAX_PROVINCES = 3249;

/** Folder names are case-insensitive on Windows, so the pattern is matched that way. */
export const PROVINCE_FOLDER_FLAGS = 'i';

/**
 * The three map bitmaps, which the page both shows and paints: `provinces.bmp`
 * holds a colour a pixel, `rivers.bmp` and `terrain.bmp` a palette index.
 */
export type PaintLayer = 'provinces' | 'rivers' | 'terrain';
export const PAINT_LAYERS: readonly PaintLayer[] = ['provinces', 'rivers', 'terrain'];

export function isPaintLayer(value: unknown): value is PaintLayer {
  return value === 'provinces' || value === 'rivers' || value === 'terrain';
}

export interface MapEditorTargetParams {
  readonly workspaceFolders: readonly string[];
  /** `name`s of the picked mods, in any order; the top one in load order receives the edits. */
  readonly mods: readonly string[];
}

/** One row of `map/definition.csv` with an id. */
export interface ProvinceDefinition {
  readonly id: number;
  /** Packed `red << 16 | green << 8 | blue`. */
  readonly color: number;
  readonly name: string;
}

export interface MapEditorMap {
  readonly kind: 'ready';
  readonly targetName: string;
  /** The mod folder that receives every edit. */
  readonly targetRoot: string;
  /** `map/provinces.bmp` as the game would load it for the target. */
  readonly provincesBmpPath: string;
  /** `map/rivers.bmp` and `map/terrain.bmp` as the game would load them, for the Layers box; undefined when the stack has none. */
  readonly riversBmpPath: string | undefined;
  readonly terrainBmpPath: string | undefined;
  /** The terrain.bmp palette indices `map/terrain.txt` types as water; the Terrain Lock paints over none of them. */
  readonly waterTerrainIndices: readonly number[];
  /** terrain.bmp palette index (as a JSON key) -> the `map/terrain.txt` type it draws, for the Terrain layer's colour list. */
  readonly terrainNames: Readonly<Record<string, string>>;
  /** What Multi Draw gives land the terrain had as water; undefined when terrain.txt names no land type. */
  readonly plainsTerrainIndex: number | undefined;
  readonly definitions: readonly ProvinceDefinition[];
  readonly seaProvinces: readonly number[];
  /** Start dates found under `history/pops`, earliest first. */
  readonly popDates: readonly string[];
  /** Colours of the lake rows of `definition.csv` (the ones with no id). */
  readonly lakeColors: readonly number[];
  /** Subfolders of `history/provinces`; `''` when files sit directly in it. */
  readonly historyFolders: readonly string[];
  /** File names under `history/pops/<date>`, per date. */
  readonly popFiles: Readonly<Record<string, readonly string[]>>;
  /** The pick lists of every form, sent once with the map rather than with every province. */
  readonly vocabulary: Vocabulary;
}

export type MapEditorMapResult = MapEditorMap | { readonly kind: 'unavailable'; readonly reason: string };

/** A place on the map to show once it is loaded, as a map report finding names it. */
export interface MapEditorReveal {
  /** The bitmap the finding is about, mod-root-relative. */
  readonly file: string;
  /** 0-based, origin at the top-left corner of the image. */
  readonly x: number;
  readonly y: number;
}

export interface ProvinceRequestParams extends MapEditorTargetParams {
  readonly provinceId: number;
  /** One of `MapEditorMap.popDates`. */
  readonly popDate: string;
}

export interface FileRef {
  readonly absolutePath: string;
  /** 0-based. */
  readonly line: number;
}

export interface LocSection {
  /** `PROV<id>`. */
  readonly key: string;
  /** The ENGLISH column; empty when the key is not defined. */
  readonly text: string;
  readonly file: FileRef | undefined;
  /** False when the definition sits in a layer below the target mod (a save adds the key to the target instead). */
  readonly inTarget: boolean;
}

export interface KeyValue {
  readonly key: string;
  readonly value: string;
}

export interface PartyLoyalty {
  readonly ideology: string;
  readonly loyaltyValue: string;
}

export interface StateBuilding {
  readonly building: string;
  readonly level: string;
  readonly upgrade: string;
}

/** Every value is kept as written; the form decides how to present it. */
export interface ProvinceHistory {
  readonly owner: string | undefined;
  readonly controller: string | undefined;
  readonly cores: readonly string[];
  readonly removeCores: readonly string[];
  readonly tradeGoods: string | undefined;
  readonly lifeRating: string | undefined;
  readonly terrain: string | undefined;
  readonly colonial: string | undefined;
  readonly colony: string | undefined;
  readonly isSlave: string | undefined;
  /** `fort = 1`, `railroad = 2`, ...: any other top-level `key = number`. */
  readonly buildings: readonly KeyValue[];
  readonly partyLoyalty: readonly PartyLoyalty[];
  readonly stateBuildings: readonly StateBuilding[];
  readonly setFlags: readonly string[];
  readonly clrFlags: readonly string[];
  /** `1861.1.1 = { ... }` blocks; their content never nests further. */
  readonly dated: readonly DatedHistory[];
}

export interface DatedHistory {
  readonly date: string;
  readonly entries: ProvinceHistory;
}

export interface HistorySection {
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
  /** Undefined when no layer has a history file for the province. */
  readonly data: ProvinceHistory | undefined;
  /** The subfolder of `history/provinces` holding the file; `''` for one directly in it. */
  readonly folder: string | undefined;
}

export interface PopEntry {
  readonly type: string;
  readonly culture: string;
  readonly religion: string;
  readonly size: string;
  readonly militancy: string | undefined;
  readonly rebelType: string | undefined;
}

export interface PopsSection {
  readonly date: string;
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
  /** Undefined when no file of the date has a block for the province. */
  readonly pops: readonly PopEntry[] | undefined;
}

/**
 * The `map/positions.txt` points the editor moves: the four top-level
 * `<kind> = { x y }` blocks and the three inside `building_position`. The
 * order is the order of the file, of the panel's rows and of the map legend.
 */
export type PositionKind = 'text_position' | 'unit' | 'city' | 'factory' | 'fort' | 'railroad' | 'naval_base';
export const POSITION_KINDS: readonly PositionKind[] = ['text_position', 'unit', 'city', 'factory', 'fort', 'railroad', 'naval_base'];
/** The kinds that sit inside `building_position = { ... }` rather than at the top of the province block. */
export const BUILDING_POSITION_KINDS: readonly PositionKind[] = ['fort', 'railroad', 'naval_base'];

/** Coordinates as written in the file; `y` counts from the bottom of the map. */
export interface PositionPoint {
  readonly x: string;
  readonly y: string;
}

/** A province's editable positions; an undefined kind has no block. */
export interface ProvincePositions extends Readonly<Record<PositionKind, PositionPoint | undefined>> {
  /** `text_rotation`: the angle in radians the game turns the province name by, as written. */
  readonly text_rotation: string | undefined;
  /** `text_scale`: the multiplier on the name's size, as written. */
  readonly text_scale: string | undefined;
}

export interface PositionsSection {
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
  /** Undefined when `positions.txt` has no block for the province. */
  readonly data: ProvincePositions | undefined;
}

export interface PositionMarker {
  readonly id: number;
  readonly kind: PositionKind;
  readonly x: number;
  readonly y: number;
}

/** Where the game draws one province's name, for the map to draw it too. */
export interface ProvinceLabel {
  readonly id: number;
  /** The localisation's `PROV<id>`, which is the name the game draws; empty when the key has none. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** `text_rotation` in radians counter-clockwise; 0 when the block has none. */
  readonly rotation: number;
  /** `text_scale`; 1 when the block has none, the game's own floor. */
  readonly scale: number;
}

export type MapPositionsResult =
  | { readonly kind: 'ready'; readonly markers: readonly PositionMarker[]; readonly labels: readonly ProvinceLabel[] }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** An identifier with the name the localisation gives it (the identifier itself when it has none). */
export interface NamedIdentifier {
  readonly id: string;
  readonly label: string;
  /** The localised part of the label, when the label is `id - name`: the pick list shows it apart. */
  readonly name?: string;
  /** A CSS colour the row shows as a square, for a list of palette indices. */
  readonly swatch?: string;
}

/** Identifier lists the form offers: pick lists with localised labels, plain suggestions for the rest. */
export interface Vocabulary {
  readonly countries: readonly NamedIdentifier[];
  readonly goods: readonly NamedIdentifier[];
  readonly terrains: readonly NamedIdentifier[];
  readonly cultures: readonly NamedIdentifier[];
  readonly religions: readonly NamedIdentifier[];
  readonly popTypes: readonly NamedIdentifier[];
  readonly ideologies: readonly NamedIdentifier[];
  /** What a province builds: every building that is not a factory. */
  readonly buildings: readonly NamedIdentifier[];
  /** What a state builds: the `type = factory` ones. */
  readonly factories: readonly NamedIdentifier[];
}

export interface TerrainSection {
  /** `terrain = x` from the history file; undefined when the file names none. */
  readonly name: string | undefined;
  /** The category most terrain.bmp pixels of the province carry, shown as a note beside the name. */
  readonly dominant: string | undefined;
  /** PNG data URI of the `GFX_terrainimg_<terrain>` picture, when the stack has one. */
  readonly pictureDataUri: string | undefined;
}

/**
 * `map/climate.txt`: the one climate whose id list holds the province. Every
 * land province has exactly one, and a sea province has none.
 */
export interface ClimateSection {
  readonly name: string | undefined;
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
  /** Every climate the file declares, with its localised name. */
  readonly options: readonly NamedIdentifier[];
}

/**
 * `map/continent.txt`: the one continent whose province list holds the
 * province. Every land province has exactly one, and a sea province has none.
 */
export interface ContinentSection {
  readonly name: string | undefined;
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
  /** Every continent the file declares, with its localised name. */
  readonly options: readonly NamedIdentifier[];
}

/** `map/region.txt`: the states holding the province. A land province needs at least one. */
export interface StateSection {
  readonly names: readonly string[];
  readonly file: FileRef | undefined;
  readonly inTarget: boolean;
  readonly options: readonly NamedIdentifier[];
}

export interface ProvinceDetails {
  readonly id: number;
  readonly definitionName: string;
  readonly isSea: boolean;
  /** True while `definition.csv` has no row for the id: a province painted and not created yet. */
  readonly isNew: boolean;
  readonly localisation: LocSection;
  readonly history: HistorySection;
  readonly pops: PopsSection;
  readonly positions: PositionsSection;
  readonly terrain: TerrainSection;
  readonly climate: ClimateSection;
  readonly continent: ContinentSection;
  readonly state: StateSection;
}

export interface TerrainPictureParams extends MapEditorTargetParams {
  readonly terrain: string;
}

export interface TerrainPictureResult {
  readonly terrain: string;
  readonly pictureDataUri: string | undefined;
}

export type ProvinceResult =
  | { readonly kind: 'details'; readonly details: ProvinceDetails }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The `PROV<id>` line, written by the Save of the tab that shows it. */
export interface LocalisationEdit {
  readonly text: string;
  readonly renameHistoryFile: boolean;
}

/**
 * The history file, and with it everything the Definition tab shows: the
 * localisation and the states ride along, so the name, the climate, the states
 * and the history are written together.
 */
export interface HistoryEdit {
  readonly data: ProvinceHistory;
  readonly climate: string;
  readonly continent: string;
  readonly createInFolder: string | undefined;
  readonly localisation?: LocalisationEdit;
  readonly states?: readonly string[];
}

export interface PopsEdit {
  readonly pops: readonly PopEntry[];
  readonly createInFile: string | undefined;
}

export interface PositionsEdit {
  readonly data: ProvincePositions;
}

export type SaveSection =
  | ({ readonly section: 'history' } & HistoryEdit)
  | ({ readonly section: 'pops' } & PopsEdit)
  | ({ readonly section: 'positions' } & PositionsEdit)
  /**
   * Every tab at once: the panel has one Save, so one message carries the whole
   * province. The parts are written in this order, and `pops` is left out when
   * the province has none and no file to put them in.
   */
  | {
      readonly section: 'all';
      readonly history: HistoryEdit;
      readonly pops?: PopsEdit;
      readonly positions: PositionsEdit;
    };

/** What a province painted in a colour of its own needs before any section can be written. */
export interface NewProvince {
  /** Packed `red << 16 | green << 8 | blue`, as the bitmap holds it. */
  readonly color: number;
  readonly isSea: boolean;
  /** The name the `definition.csv` row carries. */
  readonly name: string;
  /** A land province cannot be created without one, nor without a continent or a state. */
  readonly climate: string;
  readonly continent: string;
  readonly states: readonly string[];
}

export interface NewProvinceParams extends MapEditorTargetParams {
  readonly color: number;
  readonly popDate: string;
}

export interface SaveOptions {
  /** Set while the province is new: the save creates it before writing its own section. */
  readonly create?: NewProvince;
  /** Answer with the files the save would write, and write none of them. */
  readonly dryRun?: boolean;
}

export type SaveParams = ProvinceRequestParams & SaveSection & SaveOptions;

/** A save as the page posts it: the extension adds the target, which the page never knows. */
export type PageSaveParams = Pick<ProvinceRequestParams, 'provinceId' | 'popDate'> & SaveSection & SaveOptions;

export type SaveResult =
  | { readonly ok: true; readonly written: readonly string[]; readonly details: ProvinceDetails }
  /** `written`: what a save that failed half-way had already put on disk — a province created with no section. */
  | { readonly ok: false; readonly reason: string; readonly written?: readonly string[] };

/** A colour as `common/countries/<file>.txt` writes it: three 0-255 components. */
export type Rgb = readonly [number, number, number];

/**
 * What the page needs to tint provinces by owner: the start-date `owner` of
 * every province with a history file (ids as strings, JSON keys) and the
 * `color` of every tag that owns something.
 */
export interface MapCountryColors {
  readonly kind: 'ready';
  readonly owners: Readonly<Record<string, string>>;
  readonly colors: Readonly<Record<string, Rgb>>;
}

export type MapCountryColorsResult = MapCountryColors | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * What the page needs to tint provinces by state: the first `map/region.txt`
 * block naming each province (ids as strings, JSON keys). The colours are the
 * page's, hashed from the names (`stateColors.ts`).
 */
export interface MapStateColors {
  readonly kind: 'ready';
  readonly states: Readonly<Record<string, string>>;
}

export type MapStateColorsResult = MapStateColors | { readonly kind: 'unavailable'; readonly reason: string };

export interface PaintParams extends MapEditorTargetParams {
  /** Which bitmap the runs belong to; their values are colours for `provinces`, palette indices otherwise. */
  readonly layer: PaintLayer;
  /** Painted pixels as `index, length, value` triples; see `provincePaint`. */
  readonly runs: readonly number[];
}

/** PNG data URIs of the three map bitmaps, small enough for the Layers box; a bitmap the stack lacks or cannot decode is absent. */
export interface MapThumbnails {
  readonly provinces?: string;
  readonly rivers?: string;
  readonly terrain?: string;
}

export type PaintResult =
  | { readonly ok: true; readonly layer: PaintLayer; readonly path: string; readonly pixels: number }
  | { readonly ok: false; readonly reason: string };

/**
 * What the extension posts to the Map Editor page. The page validates nothing:
 * both sides read this one declaration, so a payload that drifts fails to
 * compile. (The other direction is validated at runtime, in mapEditorMessages.)
 */
export type HostMessage =
  | { readonly type: 'map'; readonly map: MapEditorMap; readonly bmpUri: string; readonly riversUri: string | undefined; readonly terrainUri: string | undefined }
  | ({ readonly type: 'thumbnails' } & MapThumbnails)
  /** The reference pictures of the target mod; each file is fetched as `folderUri/file`. */
  | { readonly type: 'references'; readonly folderUri: string; readonly layers: readonly ReferenceLayer[] }
  | ({ readonly type: 'revealPixel' } & MapEditorReveal)
  | { readonly type: 'details'; readonly details: ProvinceDetails }
  | { readonly type: 'positions'; readonly markers: readonly PositionMarker[]; readonly labels: readonly ProvinceLabel[] }
  | { readonly type: 'settings'; readonly countryColorsTint: number; readonly paintUndoSteps: number }
  | { readonly type: 'countryColors'; readonly owners: Readonly<Record<string, string>>; readonly colors: Readonly<Record<string, Rgb>> }
  | { readonly type: 'stateColors'; readonly states: Readonly<Record<string, string>> }
  | { readonly type: 'saved'; readonly result: SaveResult }
  | { readonly type: 'painted'; readonly result: PaintResult }
  | { readonly type: 'savedAll'; readonly written: readonly number[]; readonly failed: readonly { readonly provinceId: number; readonly reason: string }[] }
  | { readonly type: 'error'; readonly message: string }
  | ({ readonly type: 'terrainPicture' } & TerrainPictureResult);
