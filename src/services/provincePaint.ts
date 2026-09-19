/**
 * Painting the map bitmaps: the pixels a brush or a fill covers, and how they
 * go back into a file's bytes. The Map Editor page and the server both read
 * this, so a pixel the page painted lands on the byte the server writes.
 *
 * Painted pixels travel as **runs** — `index, length, colour` triples — never
 * one entry per pixel: a bucket over a large region covers millions of pixels
 * but only thousands of runs, and a container holding one number each could
 * neither carry nor sort that many. A run never crosses a row, so the page can
 * draw one as a single horizontal `fillRect`.
 */

import type { BmpImage } from './bmpDecoder.js';
import { decodeRowOffset } from './mapBitmaps.js';

export { decodeRowOffset };

/**
 * The pixels of one map bitmap. `provinces.bmp` holds a packed colour per
 * pixel, the two 8-bit bitmaps a palette index; every run function reads only
 * the value, so both travel through the same code and an index map costs a
 * byte a pixel rather than four.
 */
export type PixelArray = Uint32Array | Uint8Array;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The pixels a square brush of side `size` covers along the segment, clipped to the map. */
export function strokePixels(from: Point, to: Point, size: number, width: number, height: number): number[] {
  const pixels = new Set<number>();
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    stamp(pixels, Math.round(from.x + (to.x - from.x) * ratio), Math.round(from.y + (to.y - from.y) * ratio), size, width, height);
  }
  return [...pixels];
}

function stamp(pixels: Set<number>, centerX: number, centerY: number, size: number, width: number, height: number): void {
  const before = Math.floor((size - 1) / 2);
  for (let y = centerY - before; y < centerY - before + size; y++) {
    if (y < 0 || y >= height) {
      continue;
    }
    for (let x = centerX - before; x < centerX - before + size; x++) {
      if (x >= 0 && x < width) {
        pixels.add(y * width + x);
      }
    }
  }
}

/**
 * The region around `start` that shares its colour, four neighbours at a time:
 * a bucket fills what touches what was clicked, not every pixel of the
 * province.
 */
export function floodRuns(
  packed: PixelArray,
  width: number,
  height: number,
  start: number,
  replacement: number,
): number[] {
  const target = packed[start];
  if (target === undefined || target === replacement) {
    return [];
  }
  // The colour is tested as the fill goes rather than walled off up front: a
  // pass over the whole map would cost the same for one province as for an ocean.
  const seen = new Uint8Array(packed.length);
  const runs: number[] = [];
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined || seen[index] !== 0 || packed[index] !== target) { continue; }
    const rowStart = index - (index % width);
    const left = reachLeft(packed, seen, target, index, rowStart);
    const right = reachRight(packed, seen, target, index, rowStart + width - 1);
    for (let at = left; at <= right; at++) { seen[at] = TAKEN; }
    runs.push(left, right - left + 1, replacement);
    const y = rowStart / width;
    if (y > 0) { pushTargetRuns(stack, seen, packed, target, left - width, right - width); }
    if (y < height - 1) { pushTargetRuns(stack, seen, packed, target, left + width, right + width); }
  }
  return runs;
}

function reachLeft(packed: PixelArray, seen: Uint8Array, target: number, from: number, rowStart: number): number {
  let left = from;
  while (left > rowStart && seen[left - 1] === 0 && packed[left - 1] === target) { left--; }
  return left;
}

function reachRight(packed: PixelArray, seen: Uint8Array, target: number, from: number, rowEnd: number): number {
  let right = from;
  while (right < rowEnd && seen[right + 1] === 0 && packed[right + 1] === target) { right++; }
  return right;
}

/** One seed per unvisited run of the neighbouring row that still holds the colour being filled. */
function pushTargetRuns(
  stack: number[],
  seen: Uint8Array,
  packed: PixelArray,
  target: number,
  from: number,
  to: number,
): void {
  let running = false;
  for (let at = from; at <= to; at++) {
    if (seen[at] !== 0 || packed[at] !== target) { running = false; continue; }
    if (!running) { stack.push(at); running = true; }
  }
}

/** How `enclosedPixels` marks a pixel while it works. */
const WALL = 1;
const OUTSIDE = 2;
const TAKEN = 3;

/**
 * What a drawn line shuts away. The line and the pixels already holding the
 * colour are one wall; everything the map's edge can still reach around it is
 * outside; what is left beside the line is what the line closed off. Only the
 * regions touching the line count, so a hole the province has had all along
 * elsewhere on the map is left alone.
 */
export function enclosedRuns(
  packed: PixelArray,
  width: number,
  height: number,
  line: readonly number[],
  color: number,
): number[] {
  const state = new Uint8Array(packed.length);
  for (let index = 0; index < packed.length; index++) {
    if (packed[index] === color) { state[index] = WALL; }
  }
  for (const index of line) { state[index] = WALL; }
  spread(edgeSeeds(width, height), state, width, height, OUTSIDE, undefined);
  const runs: number[] = [];
  spread(besideLine(line, state, width, height), state, width, height, TAKEN, { runs, color });
  return runs;
}

function edgeSeeds(width: number, height: number): number[] {
  const seeds: number[] = [];
  for (let x = 0; x < width; x++) { seeds.push(x, (height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seeds.push(y * width, y * width + width - 1); }
  return seeds;
}

/** The free pixels the line itself touches: where a closed-off region has to start. */
function besideLine(line: readonly number[], state: Uint8Array, width: number, height: number): number[] {
  const seeds: number[] = [];
  for (const index of line) {
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) { seeds.push(index - 1); }
    if (x < width - 1) { seeds.push(index + 1); }
    if (y > 0) { seeds.push(index - width); }
    if (y < height - 1) { seeds.push(index + width); }
  }
  return seeds.filter(function (index) { return state[index] === 0; });
}

/** Where a spread writes what it took: one run per row it swallowed. */
interface RunSink {
  readonly runs: number[];
  readonly color: number;
}

/** Run-by-run flood fill over the pixels still unmarked; a pixel-at-a-time stack is too deep for a map this size. */
function spread(
  seeds: readonly number[],
  state: Uint8Array,
  width: number,
  height: number,
  mark: number,
  collect: RunSink | undefined,
): void {
  const stack = [...seeds];
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined || state[index] !== 0) { continue; }
    const x = index % width;
    const rowStart = index - x;
    let left = index;
    while (left > rowStart && state[left - 1] === 0) { left--; }
    let right = index;
    while (right < rowStart + width - 1 && state[right + 1] === 0) { right++; }
    for (let at = left; at <= right; at++) { state[at] = mark; }
    if (collect) { collect.runs.push(left, right - left + 1, collect.color); }
    const y = rowStart / width;
    if (y > 0) { pushRuns(stack, state, left - width, right - width); }
    if (y < height - 1) { pushRuns(stack, state, left + width, right + width); }
  }
}

/** One seed per unmarked run of the neighbouring row. */
function pushRuns(stack: number[], state: Uint8Array, from: number, to: number): void {
  let running = false;
  for (let at = from; at <= to; at++) {
    if (state[at] !== 0) { running = false; continue; }
    if (!running) { stack.push(at); running = true; }
  }
}

/** Add one pixel to a run list, joining it to the last run when it carries on from it inside the same row. */
export function addPixel(runs: number[], index: number, color: number, width: number): void {
  const at = runs.length - 3;
  const carriesOn = at >= 0
    && runs[at + 2] === color
    && (runs[at] ?? 0) + (runs[at + 1] ?? 0) === index
    && index % width !== 0;
  if (carriesOn) { runs[at + 1] = (runs[at + 1] ?? 0) + 1; } else { runs.push(index, 1, color); }
}

/** A brush's scattered pixels as runs, all in the one colour it paints. */
export function runsOfIndices(indices: readonly number[], color: number, width: number): number[] {
  const sorted = [...indices].sort(function (one, other) { return one - other; });
  const runs: number[] = [];
  for (const index of sorted) { addPixel(runs, index, color, width); }
  return runs;
}

/**
 * Where two pictures of the map differ, carrying the first one's colours: what
 * the page has painted over the file, or the file's own colours back again.
 */
export function changedRuns(from: PixelArray, against: PixelArray, width: number): number[] {
  const runs: number[] = [];
  const count = Math.min(from.length, against.length);
  for (let index = 0; index < count; index++) {
    const color = from[index] ?? 0;
    if (color !== against[index]) { addPixel(runs, index, color, width); }
  }
  return runs;
}

/** How many pixels a run list covers. */
export function runPixels(runs: readonly number[]): number {
  let count = 0;
  for (let at = 1; at < runs.length; at += 3) { count += runs[at] ?? 0; }
  return count;
}

export type PaintOutcome =
  | { readonly ok: true; readonly pixels: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Every pixel of every run, as the byte offset of its row and its place in it.
 * The runs are checked whole and inside the map before a byte is written, so a
 * bitmap is never left half painted by a bad message.
 */
function writeRunPixels(
  image: BmpImage,
  runs: readonly number[],
  write: (rowStart: number, x: number, value: number) => void,
): PaintOutcome {
  if (runs.length % 3 !== 0) {
    return { ok: false, reason: 'painted pixels arrived incomplete' };
  }
  const { width, height } = image;
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const length = runs[at + 1] ?? 0;
    if (start < 0 || length < 1 || start + length > width * height) {
      return { ok: false, reason: 'painted pixels fall outside the map' };
    }
  }
  let count = 0;
  let row = -1;
  let rowStart = 0;
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const end = start + (runs[at + 1] ?? 0);
    const value = runs[at + 2] ?? 0;
    for (let index = start; index < end; index++) {
      const x = index % width;
      const y = (index - x) / width;
      if (y !== row) { row = y; rowStart = decodeRowOffset(image, y); }
      write(rowStart, x, value);
      count++;
    }
  }
  return { ok: true, pixels: count };
}

/** Write the runs into a colour bitmap's own bytes; the caller saves them as they are. */
export function applyRuns(image: BmpImage, runs: readonly number[]): PaintOutcome {
  if (image.bitsPerPixel !== 24 && image.bitsPerPixel !== 32) {
    return { ok: false, reason: `is ${String(image.bitsPerPixel)}-bit; the map editor paints 24-bit and 32-bit colour maps` };
  }
  const { bytes } = image;
  const bytesPerPixel = image.bitsPerPixel / 8;
  return writeRunPixels(image, runs, function (rowStart, x, color) {
    const offset = rowStart + x * bytesPerPixel;
    bytes[offset] = color & 0xff;
    bytes[offset + 1] = (color >> 8) & 0xff;
    bytes[offset + 2] = (color >> 16) & 0xff;
  });
}

/** Write the runs into an 8-bit bitmap's own bytes: `rivers.bmp` and `terrain.bmp` are palette indices, a byte a pixel. */
export function applyIndexRuns(image: BmpImage, runs: readonly number[]): PaintOutcome {
  if (image.bitsPerPixel !== 8) {
    return { ok: false, reason: `is ${String(image.bitsPerPixel)}-bit; the game reads an 8-bit one` };
  }
  for (let at = 2; at < runs.length; at += 3) {
    const value = runs[at] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return { ok: false, reason: 'a painted palette index falls outside 0-255' };
    }
  }
  const { bytes } = image;
  return writeRunPixels(image, runs, function (rowStart, x, index) {
    bytes[rowStart + x] = index;
  });
}

/** Packed colours are 24 bits: `red << 16 | green << 8 | blue`. */
const COLOR_SPACE = 0x1000000;

/**
 * A colour nothing on the map is using yet. The space is thousands of times
 * larger than any province table, so the draw lands on a free colour almost
 * every time; the walk from where it landed is what makes the answer certain
 * rather than likely, and it is what finds the gaps in a table that has grown
 * large. Undefined only when every colour is taken.
 */
export function unusedColor(taken: ReadonlySet<number>, random: () => number = Math.random): number | undefined {
  const start = Math.min(COLOR_SPACE - 1, Math.max(0, Math.floor(random() * COLOR_SPACE)));
  for (let step = 0; step < COLOR_SPACE; step++) {
    const color = (start + step) % COLOR_SPACE;
    if (!taken.has(color)) {
      return color;
    }
  }
  return undefined;
}
