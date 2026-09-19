import { RIVER_INDEX_NAMES, RIVERS_BMP_PALETTE, TERRAIN_BMP_PALETTE, TERRAIN_OCEAN } from '../data/mapPalettes.js';
import type { NamedIdentifier } from '../model/mapEditor.js';
import { unusedColor } from '../services/provincePaint.js';
import { required, requiredButton, requiredInput } from './dom.js';
import { paletteInput, type Field } from './fields.js';
import { seaColors, state, type FixedLayer } from './state.js';

/**
 * What the brush paints with. The province map takes a colour, the two 8-bit
 * bitmaps a palette index, so each layer keeps its own value and the control
 * under the tools changes with the layer: the picker for a colour nothing owns,
 * a list of the indices the file gives a meaning to for the other two.
 */

const paintColorInput = requiredInput('paintColor');
const paintColorText = required('paintColorText');
const generateColorButton = requiredButton('generateColorButton');
const colorRow = required('colorRow');
const paletteRow = required('paletteRow');

/** The first river width, which is what a mapper draws with. */
const FIRST_RIVER_WIDTH = 2;

const values: Record<FixedLayer, number> = { provinces: 0xff0000, rivers: FIRST_RIVER_WIDTH, terrain: 0 };
let palettePick: Field | null = null;
/**
 * Every colour the map already uses: the table's rows, its lakes, and what the
 * bitmap itself holds — a colour no row names is still a blob on the map, and
 * handing it out would silently merge the two. The bitmap is walked once, on
 * the first Generate, and kept: after it, the only colour that can reach the
 * map is the brush's, and `setBrushValue` adds that one as it goes.
 */
let usedColors: Set<number> | null = null;
/** The two colours Multi Draw paints provinces with, taken once and kept until one of them becomes a province. */
let reserved: { land: number; sea: number } | null = null;

/** What the brush writes into the layer being edited. */
export function brushValue(): number {
  return values[state.editLayer];
}

export function setBrushValue(value: number): void {
  const kind = state.editLayer;
  values[kind] = kind === 'provinces' ? value & 0xffffff : Math.min(255, Math.max(0, Math.round(value)));
  if (kind === 'provinces') {
    paintColorInput.value = hexOf(values.provinces);
    paintColorInput.title = 'Painting with ' + hexOf(values.provinces);
    paintColorText.textContent = rgbOf(values.provinces);
    // Whatever the brush holds can reach the map, so Generate must never offer it again.
    usedColors?.add(values.provinces);
    return;
  }
  if (palettePick) { palettePick.value = String(values[kind]); }
}

export function hexOf(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export function rgbOf(color: number): string {
  return String((color >> 16) & 255) + ' ' + String((color >> 8) & 255) + ' ' + String(color & 255);
}

/** How the status bar and the tooltips name what the brush is holding, or what a pixel holds. */
export function valueName(kind: FixedLayer, value: number): string {
  if (kind === 'provinces') { return hexOf(value); }
  const named = paletteEntries(kind).find(function (entry) { return entry.id === String(value); });
  return named ? named.label : String(value);
}

export function takenColors(): Set<number> {
  const kept = usedColors;
  if (kept) { return kept; }
  const taken = new Set<number>();
  for (const definition of state.map?.definitions ?? []) { taken.add(definition.color); }
  for (const color of state.map?.lakeColors ?? []) { taken.add(color); }
  for (const color of state.image?.packed ?? []) { taken.add(color); }
  taken.add(values.provinces);
  usedColors = taken;
  return taken;
}

/**
 * The colours Multi Draw gives the province map where it makes land or sea out
 * of another file. They are taken once and reused, so one stroke after another
 * builds the same province rather than a new one each time; clicking either
 * opens the panel that turns it into a real province. Nothing is left to
 * reserve only when every one of the sixteen million colours is a province, and
 * then the pair falls back to what it is standing in for.
 */
export function reservedColors(): { land: number; sea: number } {
  const held = reserved;
  if (held) { return held; }
  const taken = takenColors();
  const land = unusedColor(taken) ?? 0xfefefe;
  taken.add(land);
  const sea = unusedColor(taken) ?? 0xfefefd;
  taken.add(sea);
  seaColors.add(sea);
  reserved = { land, sea };
  return reserved;
}

/** Whether a colour is one of the two Multi Draw is holding, and which. */
export function reservedKind(color: number): 'land' | 'sea' | undefined {
  if (!reserved) { return undefined; }
  if (color === reserved.land) { return 'land'; }
  return color === reserved.sea ? 'sea' : undefined;
}

/** A reserved colour has become a province: the next stroke reserves another. */
export function dropReserved(color: number): void {
  if (reserved && (color === reserved.land || color === reserved.sea)) { reserved = null; }
}

/** A new map, or one written back: the colours it uses are read again. */
export function resetColors(): void {
  usedColors = null;
  reserved = null;
  values.terrain = state.map?.plainsTerrainIndex ?? 0;
  values.rivers = FIRST_RIVER_WIDTH;
  refreshColorControl();
}

/** The colour an index draws as: the palette the file itself carries, or the one the game ships while it is not loaded. */
function cssOfIndex(kind: FixedLayer, index: number): string {
  if (kind === 'provinces') { return hexOf(index); }
  const held = state.indexed[kind]?.palette;
  if (held) {
    return hexOf(((held[index * 3] ?? 0) << 16) | ((held[index * 3 + 1] ?? 0) << 8) | (held[index * 3 + 2] ?? 0));
  }
  const entry = (kind === 'rivers' ? RIVERS_BMP_PALETTE : TERRAIN_BMP_PALETTE)[index] ?? [0, 0, 0];
  return hexOf((entry[0] << 16) | (entry[1] << 8) | entry[2]);
}

/**
 * The indices worth painting a layer with: the terrain types `map/terrain.txt`
 * names, or the river widths the palette gives a meaning to. Every other index
 * is a pixel the game reads the same way as one of these, so offering it would
 * only be a longer list.
 */
function paletteEntries(kind: FixedLayer): readonly NamedIdentifier[] {
  if (kind === 'provinces') { return []; }
  const named = kind === 'rivers' ? RIVER_INDEX_NAMES : terrainNames();
  return named.map(function (entry) {
    return {
      id: String(entry.index),
      label: String(entry.index) + ' - ' + entry.name,
      name: entry.name,
      swatch: cssOfIndex(kind, entry.index),
    };
  });
}

function terrainNames(): { readonly index: number; readonly name: string }[] {
  const named = Object.entries(state.map?.terrainNames ?? {})
    .map(function ([index, name]) { return { index: Number(index), name: name }; })
    .filter(function (entry) { return Number.isInteger(entry.index); })
    .sort(function (one, other) { return one.index - other.index; });
  if (!named.some(function (entry) { return entry.index === TERRAIN_OCEAN; })) {
    named.push({ index: TERRAIN_OCEAN, name: 'ocean' });
  }
  return named;
}

/**
 * The two controls stand in the same place and look the same — a colour and
 * what it is called beside it. Only the click differs: the province map opens
 * the colours of the operating system, the other two the list of what their
 * own palette means.
 */
export function refreshColorControl(): void {
  const kind = state.editLayer;
  colorRow.hidden = kind !== 'provinces';
  paletteRow.hidden = kind === 'provinces';
  generateColorButton.disabled = kind !== 'provinces';
  generateColorButton.title = kind === 'provinces'
    ? 'Take a colour at random that no province and no pixel of the map is using'
    : 'Only the province map takes a colour of its own; ' + kind + '.bmp paints the indices of its palette';
  if (kind === 'provinces') {
    palettePick = null;
    paletteRow.replaceChildren();
    return;
  }
  const entries = paletteEntries(kind);
  if (!entries.some(function (entry) { return entry.id === String(values[kind]); })) {
    values[kind] = Number(entries[0]?.id ?? 0);
  }
  const pick = paletteInput(String(values[kind]), entries);
  pick.node.addEventListener('input', function () { setBrushValue(Number(pick.value) || 0); });
  palettePick = pick;
  paletteRow.replaceChildren(pick.node);
}

export function initPaintColor(): void {
  paintColorInput.addEventListener('input', function () {
    const color = Number.parseInt(paintColorInput.value.slice(1), 16);
    setBrushValue(Number.isNaN(color) ? 0 : color);
  });
  refreshColorControl();
}
