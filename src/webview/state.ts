import type {
  MapCountryColors,
  MapEditorMap,
  PaintLayer,
  MapEditorReveal,
  PositionKind,
  PositionMarker,
  PositionPoint,
  ProvinceDefinition,
  ProvinceLabel,
  ProvinceDetails,
  Rgb,
  Vocabulary,
} from '../model/mapEditor.js';
import { DEFAULT_COUNTRY_COLORS_TINT } from '../model/mapEditor.js';
import type { PaintMode } from '../services/layerPaint.js';
import type { PixelArray } from '../services/provincePaint.js';

/**
 * What more than one part of the page reads or writes. ES modules cannot
 * reassign another module's `let`, so the shared fields live on this one
 * object; what a single module owns stays inside it.
 */

/** One square of the decoded bitmap; a single 20-megapixel canvas never settles on some GPUs. */
export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly canvas: HTMLCanvasElement;
}

/**
 * One map bitmap as the page holds it: the pixels the tools read and write,
 * and the tiles it is drawn from once it is on screen. An overlay the Terrain
 * Lock reads but nobody shows has no tiles.
 */
export interface PixelLayer {
  readonly width: number;
  readonly height: number;
  readonly packed: PixelArray;
  tiles: Tile[] | null;
}

export interface DecodedImage extends PixelLayer {
  /** `red << 16 | green << 8 | blue` per pixel, in the order the rows are drawn. */
  readonly packed: Uint32Array;
  tiles: Tile[];
}

/** rivers.bmp or terrain.bmp: a palette index per pixel, and the palette the file itself carries. */
export interface IndexedImage extends PixelLayer {
  readonly packed: Uint8Array;
  /** 256 RGB triples, as the file has them. */
  readonly palette: Uint8ClampedArray;
  /** How the tiles were drawn, so the rivers mask can be built again as the file's own colours. */
  shown: OverlayLook | null;
}

/** rivers.bmp is a blue mask over nothing while it is only being looked at, and its own magenta and white while it is edited. */
export type OverlayLook = 'mask' | 'palette';

/** The outline drawn over the selected province, as its own canvas at an offset. */
export interface Highlight {
  readonly id: number;
  readonly color: number;
  readonly canvas: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A province's points as the form holds them, with the name's angle and size; an absent kind has no block. */
export type Draft = Partial<Record<PositionKind, PositionPoint | undefined>> & {
  text_rotation?: string | undefined;
  text_scale?: string | undefined;
};

export interface View {
  scale: number;
  x: number;
  y: number;
}

/** `eraser` is the pencil button clicked a second time: it only takes back the draft's own pixels. */
export type Tool = 'hand' | 'reference' | 'pencil' | 'eraser' | 'draw' | 'bucket' | 'pick';

/** The two ways the province map can be repainted; both are tints of the same bitmap, so at most one is on. */
export type TintMode = 'country' | 'state';
export const TINT_MODES: readonly TintMode[] = ['country', 'state'];

/** The province map repainted one way, and the tint of each province colour, so a painted pixel can be tinted alone. */
export interface Tinted {
  readonly tiles: Tile[];
  readonly tintOfColor: Map<number, number>;
}

// The Layers box: the three map bitmaps, each at its own opacity, one of them
// the one being edited. provinces.bmp is drawn first; rivers.bmp (8-bit, every
// index below 254 is river, drawn blue over nothing) and terrain.bmp (8-bit,
// shown through its own palette) go over it, and are only fetched once their
// slider leaves 0 or the brush needs them.
export type FixedLayer = PaintLayer;
export type Overlay = Exclude<FixedLayer, 'provinces'>;
export const FIXED_LAYERS: readonly FixedLayer[] = ['provinces', 'rivers', 'terrain'];
export const OVERLAYS: readonly Overlay[] = ['rivers', 'terrain'];

export const TILE = 1024;
/** Screen pixels per map pixel before positions are drawn. */
export const MARKER_MIN_SCALE = 4;
export const SEA_TINT: Rgb = [150, 190, 230];
export const UNOWNED_TINT: Rgb = [150, 150, 150];
export const RIVER_COLOR: Rgb = [47, 128, 255];

export interface PositionKindSpec {
  readonly kind: PositionKind;
  readonly label: string;
  readonly color: string;
}

export const POSITION_KIND_SPECS: readonly PositionKindSpec[] = [
  { kind: 'text_position', label: 'Name', color: '#64d2ff' },
  { kind: 'unit', label: 'Unit', color: '#ff3b30' },
  { kind: 'city', label: 'City', color: '#ffd60a' },
  { kind: 'factory', label: 'Factory', color: '#ff9f0a' },
  { kind: 'fort', label: 'Fort', color: '#30d158' },
  { kind: 'railroad', label: 'Railroad', color: '#0a84ff' },
  { kind: 'naval_base', label: 'Naval base', color: '#bf5af2' },
];
export const COLOR_OF: Partial<Record<PositionKind, string>> = {};
for (const spec of POSITION_KIND_SPECS) {
  COLOR_OF[spec.kind] = spec.color;
}

export interface State {
  map: MapEditorMap | null;
  image: DecodedImage | null;
  view: View;
  selection: Highlight | null;
  /** The province the side panel is about, set before its answer arrives. */
  selectedId: number | null;
  /** The painted colour the panel is about while the province it names does not exist yet. */
  newColor: number | null;
  details: ProvinceDetails | null;
  /** From a map report link, applied once the bitmap is decoded. */
  pendingReveal: MapEditorReveal | null;
  popDate: string;
  tool: Tool;
  // map/positions.txt: every point of the map as the file has it, drawn once
  // the view is close enough; the selected province draws its draft instead.
  markers: PositionMarker[];
  /** Where the file puts every province's name, for the map to draw them. */
  labels: ProvinceLabel[];
  draft: Draft | null;
  /** The selected province's points as the file has them. */
  draftBaseline: Draft | null;
  /** Kind -> the Positions tab inputs, kept in step with a drag. */
  positionInputs: Partial<Record<PositionKind, { x: HTMLInputElement; y: HTMLInputElement }>>;
  /** The Positions tab's rotation field and the degrees beside it, so turning the name on the map shows there too. */
  labelInputs: { rotation: HTMLInputElement; degrees: HTMLElement } | null;
  showPositions: boolean;
  /** The Text Positions switch: with it off no name is drawn, not even the selected province's. */
  showTextLabels: boolean;
  // Country Colors tints every province towards its start-date owner's colour,
  // State Colors towards its first state's; the pixels the clicks read
  // (image.packed) stay the definition colours.
  tintMode: TintMode | null;
  countryColors: MapCountryColors | null;
  /** Province id (as a JSON key) -> the first state of map/region.txt listing it. */
  stateOf: Readonly<Record<string, string>> | null;
  /** Each repaint, built the first time its layer is shown and kept until its data changes. */
  tinted: Record<TintMode, Tinted | null>;
  /** Share of the owner's (or the state's) colour (victorianTools.mapEditor.countryColorsTint / 100). */
  tintWeight: number;
  layerOpacity: Record<FixedLayer, number>;
  /** Webview URIs of the two overlays, or null when the stack has none. */
  overlayUri: Record<Overlay, string | null>;
  overlayLoading: Record<Overlay, boolean>;
  /** Each overlay once fetched: what the Terrain Lock and Multi Draw read, and what the layer is drawn from. */
  indexed: Record<Overlay, IndexedImage | null>;
  editLayer: FixedLayer;
  /** What the brush is allowed to do where the three files disagree; none of them paints wherever it is put. */
  paintMode: PaintMode | null;
}

export const state: State = {
  map: null,
  image: null,
  view: { scale: 1, x: 0, y: 0 },
  selection: null,
  selectedId: null,
  newColor: null,
  details: null,
  pendingReveal: null,
  popDate: '',
  tool: 'hand',
  markers: [],
  labels: [],
  draft: null,
  draftBaseline: null,
  positionInputs: {},
  labelInputs: null,
  showPositions: true,
  showTextLabels: true,
  tintMode: null,
  countryColors: null,
  stateOf: null,
  tinted: { country: null, state: null },
  tintWeight: DEFAULT_COUNTRY_COLORS_TINT / 100,
  layerOpacity: { provinces: 100, rivers: 20, terrain: 0 },
  overlayUri: { rivers: null, terrain: null },
  overlayLoading: { rivers: false, terrain: false },
  indexed: { rivers: null, terrain: null },
  editLayer: 'provinces',
  paintMode: 'lock',
};

export function layerImage(kind: FixedLayer): PixelLayer | null {
  return kind === 'provinces' ? state.image : state.indexed[kind];
}

export const idByColor = new Map<number, number>();
export const definitionById = new Map<number, ProvinceDefinition>();
export const seaIds = new Set<number>();
/** The colours of the sea provinces and the lakes: what tells water from land on the province map. */
export const seaColors = new Set<number>();
/** The terrain.bmp indices map/terrain.txt types as water, from the map message. */
export const waterTerrain = new Set<number>();
// Points moved but not written, province by province. They survive moving to
// the next province, draw on the map, and go out together on Save all.
export const pendingPositions = new Map<number, Draft>();
/** The name the game draws for a province: its localisation, by id. */
export const locNameById = new Map<number, string>();

/** The pick lists come with the map; a form is only ever built once there is one. */
export function vocabulary(): Vocabulary {
  if (!state.map) { throw new Error('No map is loaded.'); }
  return state.map.vocabulary;
}
