/**
 * What one stroke writes, across the three map bitmaps. The page paints one
 * layer at a time, but the files only work together: a province of land over
 * ocean terrain, or a river running through a sea province, is a map the game
 * draws wrong. The mode says what to do about it — hold the stroke back, or
 * carry it into the other files — and this is where that is decided, away from
 * the DOM so it can be read on its own.
 *
 * Land and sea are the one thing every layer agrees on: `provinces.bmp` says it
 * with a sea province's colour, `rivers.bmp` with index 254, `terrain.bmp` with
 * a type `terrain.txt` calls water. A colour no province owns counts as land,
 * so the colour Multi Draw reserves for a province still to be made survives
 * the next stroke.
 */

import { RIVER_LAND, RIVER_SEA, TERRAIN_OCEAN } from '../data/mapPalettes.js';
import { PAINT_LAYERS, type PaintLayer } from '../model/mapEditor.js';
import { addPixel, runPixels, type PixelArray } from './provincePaint.js';

/** Terrain Lock paints on land only, Sea Province on water only, Multi Draw carries the stroke into the other files. */
export type PaintMode = 'lock' | 'sea' | 'multi';
export const PAINT_MODES: readonly PaintMode[] = ['lock', 'sea', 'multi'];

export interface PaintRules {
  /** Packed colours of the sea provinces and the lakes, plus the reserved sea colour. */
  readonly seaColors: ReadonlySet<number>;
  /** terrain.bmp indices `map/terrain.txt` types as water. */
  readonly waterTerrain: ReadonlySet<number>;
  /** What Multi Draw gives terrain that has to become land; undefined leaves terrain alone. */
  readonly plainsIndex: number | undefined;
  /** The colours Multi Draw paints provinces with where it makes land or sea out of another file. */
  readonly reservedLand: number;
  readonly reservedSea: number;
}

/** The pixels of each layer the page has decoded; a layer the mods lack is absent and constrains nothing. */
export type LayerPixels = Partial<Record<PaintLayer, PixelArray>>;

/** Runs per layer, as `index, length, value` triples. */
export type LayerRuns = Partial<Record<PaintLayer, number[]>>;

export interface StrokePlan {
  readonly writes: LayerRuns;
  /** Pixels the mode kept the brush off. */
  readonly heldBack: number;
}

/** Whether the value stands for water in its own layer. */
export function isSeaValue(layer: PaintLayer, value: number, rules: PaintRules): boolean {
  if (layer === 'provinces') {
    return rules.seaColors.has(value);
  }
  if (layer === 'rivers') {
    return value === RIVER_SEA;
  }
  return value === TERRAIN_OCEAN || rules.waterTerrain.has(value);
}

/** What a layer holds where the map is land, or where it is sea; undefined when nothing sensible can be written. */
export function fillValue(layer: PaintLayer, sea: boolean, rules: PaintRules): number | undefined {
  if (layer === 'provinces') {
    return sea ? rules.reservedSea : rules.reservedLand;
  }
  if (layer === 'rivers') {
    return sea ? RIVER_SEA : RIVER_LAND;
  }
  return sea ? TERRAIN_OCEAN : rules.plainsIndex;
}

/**
 * The runs each layer takes from a stroke the page painted on `layer`. Under
 * the two locks the stroke is only thinned; under Multi Draw it grows into the
 * other files wherever they disagree with the land or sea it lays down.
 */
export function planStroke(
  runs: readonly number[],
  layer: PaintLayer,
  mode: PaintMode,
  pixels: LayerPixels,
  width: number,
  rules: PaintRules,
): StrokePlan {
  if (mode === 'sea' && layer !== 'provinces') {
    return { writes: {}, heldBack: runPixels(runs) };
  }
  const writes: LayerRuns = {};
  if (mode === 'multi') {
    planMulti(runs, layer, pixels, width, rules, writes);
    return { writes, heldBack: 0 };
  }
  const heldBack = planGuarded(runs, layer, mode === 'sea', pixels, width, rules, writes);
  return { writes, heldBack };
}

/** Under a lock every other layer has to agree already, and the pixels that disagree are left alone. */
function planGuarded(
  runs: readonly number[],
  layer: PaintLayer,
  wantSea: boolean,
  pixels: LayerPixels,
  width: number,
  rules: PaintRules,
  writes: LayerRuns,
): number {
  const own: number[] = [];
  let heldBack = 0;
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const end = start + (runs[at + 1] ?? 0);
    const value = runs[at + 2] ?? 0;
    for (let index = start; index < end; index++) {
      if (agrees(layer, index, wantSea, pixels, rules)) {
        addPixel(own, index, value, width);
      } else {
        heldBack++;
      }
    }
  }
  if (own.length > 0) {
    writes[layer] = own;
  }
  return heldBack;
}

/** Whether every other layer the page holds says what the lock is asking for at that pixel. */
function agrees(layer: PaintLayer, index: number, wantSea: boolean, pixels: LayerPixels, rules: PaintRules): boolean {
  for (const other of PAINT_LAYERS) {
    const held = other === layer ? undefined : pixels[other]?.[index];
    if (held !== undefined && isSeaValue(other, held, rules) !== wantSea) {
      return false;
    }
  }
  return true;
}

/** Multi Draw: the stroke lands whole, and every other layer that disagrees with it is brought along. */
function planMulti(
  runs: readonly number[],
  layer: PaintLayer,
  pixels: LayerPixels,
  width: number,
  rules: PaintRules,
  writes: LayerRuns,
): void {
  const own: number[] = [];
  const along: LayerRuns = {};
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const end = start + (runs[at + 1] ?? 0);
    const value = runs[at + 2] ?? 0;
    const sea = isSeaValue(layer, value, rules);
    for (let index = start; index < end; index++) {
      addPixel(own, index, value, width);
      bringAlong(layer, index, sea, pixels, width, rules, along);
    }
  }
  if (own.length > 0) {
    writes[layer] = own;
  }
  for (const other of PAINT_LAYERS) {
    const taken = along[other];
    if (taken && taken.length > 0) {
      writes[other] = taken;
    }
  }
}

/** One pixel of a Multi Draw stroke: each other layer holding the opposite of what was painted takes the matching value. */
function bringAlong(
  layer: PaintLayer,
  index: number,
  sea: boolean,
  pixels: LayerPixels,
  width: number,
  rules: PaintRules,
  along: LayerRuns,
): void {
  for (const other of PAINT_LAYERS) {
    const held = other === layer ? undefined : pixels[other]?.[index];
    if (held === undefined || isSeaValue(other, held, rules) === sea) {
      continue;
    }
    const fill = fillValue(other, sea, rules);
    if (fill === undefined || fill === held) {
      continue;
    }
    const taken = along[other] ?? [];
    along[other] = taken;
    addPixel(taken, index, fill, width);
  }
}
