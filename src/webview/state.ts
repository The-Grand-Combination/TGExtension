import type {
  MapCountryColors,
  MapEditorMap,
  MapEditorReveal,
  PositionKind,
  PositionMarker,
  PositionPoint,
  ProvinceDefinition,
  ProvinceDetails,
  Rgb,
  Vocabulary,
} from '../model/mapEditor.js';
import { DEFAULT_COUNTRY_COLORS_TINT } from '../model/mapEditor.js';

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

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[];
  /** `red << 16 | green << 8 | blue` per pixel, in the order the rows are drawn. */
  readonly packed: Uint32Array;
}

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

/** A province's points as the form holds them; an absent kind has no block. */
export type Draft = Partial<Record<PositionKind, PositionPoint | undefined>>;

export interface View {
  scale: number;
  x: number;
  y: number;
}

export type Tool = 'hand' | 'reference' | 'pencil' | 'draw' | 'bucket' | 'pick';

// The Layers box: the three map bitmaps, each at its own opacity. provinces.bmp
// is what is painted and drawn first; rivers.bmp (8-bit, every index below 254
// is river, drawn blue over nothing) and terrain.bmp (8-bit, shown through its
// own palette) go over it, and are only fetched once their slider leaves 0.
export type FixedLayer = 'provinces' | 'rivers' | 'terrain';
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
  draft: Draft | null;
  /** The selected province's points as the file has them. */
  draftBaseline: Draft | null;
  /** Kind -> the Positions tab inputs, kept in step with a drag. */
  positionInputs: Partial<Record<PositionKind, { x: HTMLInputElement; y: HTMLInputElement }>>;
  showPositions: boolean;
  // Country Colors tints every province towards its start-date owner's colour;
  // the pixels the clicks read (image.packed) stay the definition colours.
  showCountryColors: boolean;
  countryColors: MapCountryColors | null;
  /** Tiles of the tinted bitmap, built the first time the layer is shown. */
  tintedTiles: Tile[] | null;
  /** Province colour -> its tint, kept from that build so a painted pixel can be tinted on its own. */
  tintOfColor: Map<number, number> | null;
  /** Share of the owner's colour (victorianTools.mapEditor.countryColorsTint / 100). */
  tintWeight: number;
  layerOpacity: Record<FixedLayer, number>;
  /** Webview URIs of the two overlays, or null when the stack has none. */
  overlayUri: Record<Overlay, string | null>;
  overlayTiles: Record<Overlay, Tile[] | null>;
  overlayLoading: Record<Overlay, boolean>;
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
  draft: null,
  draftBaseline: null,
  positionInputs: {},
  showPositions: true,
  showCountryColors: false,
  countryColors: null,
  tintedTiles: null,
  tintOfColor: null,
  tintWeight: DEFAULT_COUNTRY_COLORS_TINT / 100,
  layerOpacity: { provinces: 100, rivers: 20, terrain: 0 },
  overlayUri: { rivers: null, terrain: null },
  overlayTiles: { rivers: null, terrain: null },
  overlayLoading: { rivers: false, terrain: false },
};

export const idByColor = new Map<number, number>();
export const definitionById = new Map<number, ProvinceDefinition>();
export const seaIds = new Set<number>();
// Points moved but not written, province by province. They survive moving to
// the next province, draw on the map, and go out together on Save all.
export const pendingPositions = new Map<number, Draft>();

/** The pick lists come with the map; a form is only ever built once there is one. */
export function vocabulary(): Vocabulary {
  if (!state.map) { throw new Error('No map is loaded.'); }
  return state.map.vocabulary;
}
