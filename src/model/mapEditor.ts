/**
 * The Map Editor: a province map the user clicks on to edit one province's
 * localisation, history file and pops. Three custom LSP requests carry the
 * map, one province's details, and one section's save.
 */

export const MAP_EDITOR_MAP_REQUEST = 'victorianTools/mapEditor/map';
export const MAP_EDITOR_PROVINCE_REQUEST = 'victorianTools/mapEditor/province';
export const MAP_EDITOR_SAVE_REQUEST = 'victorianTools/mapEditor/save';
export const MAP_EDITOR_TERRAIN_PICTURE_REQUEST = 'victorianTools/mapEditor/terrainPicture';

export interface MapEditorTargetParams {
  /** File-system paths of the open workspace folders. */
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

/** The terrain the province view would show for the province. */
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
  | { readonly section: 'pops'; readonly pops: readonly PopEntry[]; readonly createInFile: string | undefined };

export type SaveParams = ProvinceRequestParams & SaveSection;

export type SaveResult =
  | { readonly ok: true; readonly written: readonly string[]; readonly details: ProvinceDetails }
  | { readonly ok: false; readonly reason: string };
