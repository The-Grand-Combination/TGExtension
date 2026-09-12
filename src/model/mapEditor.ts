import { requestDescriptor } from './request.js';
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

/** `victorianTools.mapEditor.countryColorsTint`: percent of the owner's colour in the Country Colors layer. */
export const DEFAULT_COUNTRY_COLORS_TINT = 82;

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
  /** `map/rivers.bmp` as the game would load it, for the Show Rivers layer; undefined when the stack has none. */
  readonly riversBmpPath: string | undefined;
  readonly definitions: readonly ProvinceDefinition[];
  readonly seaProvinces: readonly number[];
  /** Start dates found under `history/pops`, earliest first. */
  readonly popDates: readonly string[];
  /** Subfolders of `history/provinces`; `''` when files sit directly in it. */
  readonly historyFolders: readonly string[];
  /** File names under `history/pops/<date>`, per date. */
  readonly popFiles: Readonly<Record<string, readonly string[]>>;
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
 * The `map/positions.txt` points the editor moves: the three top-level
 * `<kind> = { x y }` blocks and the three inside `building_position`. The
 * order is the order of the panel's rows and of the map legend.
 */
export type PositionKind = 'unit' | 'city' | 'factory' | 'fort' | 'railroad' | 'naval_base';
export const POSITION_KINDS: readonly PositionKind[] = ['unit', 'city', 'factory', 'fort', 'railroad', 'naval_base'];
/** The kinds that sit inside `building_position = { ... }` rather than at the top of the province block. */
export const BUILDING_POSITION_KINDS: readonly PositionKind[] = ['fort', 'railroad', 'naval_base'];

/** Coordinates as written in the file; `y` counts from the bottom of the map. */
export interface PositionPoint {
  readonly x: string;
  readonly y: string;
}

/** A province's editable positions; an undefined kind has no block. */
export type ProvincePositions = Readonly<Record<PositionKind, PositionPoint | undefined>>;

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

export type MapPositionsResult =
  | { readonly kind: 'ready'; readonly markers: readonly PositionMarker[] }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** An identifier with the name the localisation gives it (the identifier itself when it has none). */
export interface NamedIdentifier {
  readonly id: string;
  readonly label: string;
}

/** Identifier lists the form offers: pick lists with localised labels, plain suggestions for the rest. */
export interface Vocabulary {
  readonly countries: readonly NamedIdentifier[];
  readonly goods: readonly NamedIdentifier[];
  readonly terrains: readonly NamedIdentifier[];
  readonly cultures: readonly NamedIdentifier[];
  readonly religions: readonly NamedIdentifier[];
  readonly popTypes: readonly NamedIdentifier[];
  readonly ideologies: readonly string[];
  readonly buildings: readonly string[];
  readonly rebelTypes: readonly string[];
}

export interface TerrainSection {
  /** `terrain = x` from the history file, else the category most terrain.bmp pixels of the province carry. */
  readonly name: string | undefined;
  readonly fromHistory: boolean;
  /** The category most terrain.bmp pixels carry: what the province falls back to without `terrain = x`. */
  readonly dominant: string | undefined;
  /** PNG data URI of the `GFX_terrainimg_<terrain>` picture, when the stack has one. */
  readonly pictureDataUri: string | undefined;
}

export interface ProvinceDetails {
  readonly id: number;
  readonly definitionName: string;
  readonly isSea: boolean;
  readonly localisation: LocSection;
  readonly history: HistorySection;
  readonly pops: PopsSection;
  readonly positions: PositionsSection;
  readonly terrain: TerrainSection;
  readonly vocabulary: Vocabulary;
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

export type SaveSection =
  | { readonly section: 'localisation'; readonly text: string; readonly renameHistoryFile: boolean }
  | { readonly section: 'history'; readonly data: ProvinceHistory; readonly createInFolder: string | undefined }
  | { readonly section: 'pops'; readonly pops: readonly PopEntry[]; readonly createInFile: string | undefined }
  | { readonly section: 'positions'; readonly data: ProvincePositions };

export type SaveParams = ProvinceRequestParams & SaveSection;

export type SaveResult =
  | { readonly ok: true; readonly written: readonly string[]; readonly details: ProvinceDetails }
  | { readonly ok: false; readonly reason: string };

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
 * What the extension posts to the Map Editor page. The page validates nothing:
 * both sides read this one declaration, so a payload that drifts fails to
 * compile. (The other direction is validated at runtime, in mapEditorMessages.)
 */
export type HostMessage =
  | { readonly type: 'map'; readonly map: MapEditorMap; readonly bmpUri: string; readonly riversUri: string | undefined }
  | ({ readonly type: 'revealPixel' } & MapEditorReveal)
  | { readonly type: 'details'; readonly details: ProvinceDetails }
  | { readonly type: 'positions'; readonly markers: readonly PositionMarker[] }
  | { readonly type: 'settings'; readonly countryColorsTint: number }
  | { readonly type: 'countryColors'; readonly owners: Readonly<Record<string, string>>; readonly colors: Readonly<Record<string, Rgb>> }
  | { readonly type: 'saved'; readonly result: SaveResult }
  | { readonly type: 'savedAll'; readonly written: readonly number[]; readonly failed: readonly { readonly provinceId: number; readonly reason: string }[] }
  | { readonly type: 'error'; readonly message: string }
  | ({ readonly type: 'terrainPicture' } & TerrainPictureResult);
