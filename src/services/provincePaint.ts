/**
 * Painting provinces on `provinces.bmp`: the pixels a brush or a fill covers,
 * and how they go back into the file's bytes. The Map Editor page and the
 * server both read this, so a pixel the page painted lands on the byte the
 * server writes.
 */

import type { BmpImage } from './bmpDecoder.js';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Byte offset of the row the page's decoder puts at `y`. The page reads the
 * rows in the order the file stores them, so a bottom-up bitmap — every
 * Paradox map is one — counts its rows the other way round from `rowOffset`.
 */
export function decodeRowOffset(image: BmpImage, y: number): number {
  return image.rowOffset(image.topDown ? y : image.height - 1 - y);
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
 * The pixels of the region around `start` that share its colour, four
 * neighbours at a time: a bucket fills what touches what was clicked, not
 * every pixel of the province.
 */
export function floodFill(
  packed: Uint32Array,
  width: number,
  height: number,
  start: number,
  replacement: number,
): number[] {
  const target = packed[start];
  if (target === undefined || target === replacement) {
    return [];
  }
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined) { break; }
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) { visit(index - 1, target, packed, seen, stack); }
    if (x < width - 1) { visit(index + 1, target, packed, seen, stack); }
    if (y > 0) { visit(index - width, target, packed, seen, stack); }
    if (y < height - 1) { visit(index + width, target, packed, seen, stack); }
  }
  return [...seen];
}

function visit(index: number, target: number, packed: Uint32Array, seen: Set<number>, stack: number[]): void {
  if (packed[index] === target && !seen.has(index)) {
    seen.add(index);
    stack.push(index);
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
export function enclosedPixels(
  packed: Uint32Array,
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
  const inside: number[] = [];
  spread(besideLine(line, state, width, height), state, width, height, TAKEN, inside);
  return inside;
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

/** Run-by-run flood fill over the pixels still unmarked; a pixel-at-a-time stack is too deep for a map this size. */
function spread(
  seeds: readonly number[],
  state: Uint8Array,
  width: number,
  height: number,
  mark: number,
  collect: number[] | undefined,
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
    for (let at = left; at <= right; at++) {
      state[at] = mark;
      if (collect) { collect.push(at); }
    }
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

/**
 * Painted pixels as `index, length, colour` triples, neighbours of one colour
 * joined: a fill of a whole province is thousands of pixels and crosses the
 * message channel as a handful of numbers per row.
 */
export function runsOf(pixels: ReadonlyMap<number, number>): number[] {
  const indices = [...pixels.keys()].sort(function (one, other) { return one - other; });
  const runs: number[] = [];
  let start = -1;
  let color = -1;
  let length = 0;
  for (const index of indices) {
    const pixel = pixels.get(index) ?? 0;
    if (length > 0 && index === start + length && pixel === color) {
      length++;
      continue;
    }
    if (length > 0) { runs.push(start, length, color); }
    start = index; color = pixel; length = 1;
  }
  if (length > 0) { runs.push(start, length, color); }
  return runs;
}

export type PaintOutcome =
  | { readonly ok: true; readonly pixels: number }
  | { readonly ok: false; readonly reason: string };

/** Write the runs into the bitmap's own bytes; the caller saves them as they are. */
export function applyRuns(image: BmpImage, runs: readonly number[]): PaintOutcome {
  if (image.bitsPerPixel === 8) {
    return { ok: false, reason: 'provinces.bmp is 8-bit; the map editor paints 24-bit and 32-bit maps' };
  }
  if (runs.length % 3 !== 0) {
    return { ok: false, reason: 'painted pixels arrived incomplete' };
  }
  const { width, height, bytes } = image;
  const bytesPerPixel = image.bitsPerPixel / 8;
  let count = 0;
  let row = -1;
  let rowStart = 0;
  for (let at = 0; at < runs.length; at += 3) {
    const start = runs[at] ?? 0;
    const length = runs[at + 1] ?? 0;
    const color = runs[at + 2] ?? 0;
    if (start < 0 || length < 1 || start + length > width * height) {
      return { ok: false, reason: 'painted pixels fall outside the map' };
    }
    for (let index = start; index < start + length; index++) {
      const x = index % width;
      const y = (index - x) / width;
      if (y !== row) { row = y; rowStart = decodeRowOffset(image, y); }
      const offset = rowStart + x * bytesPerPixel;
      bytes[offset] = color & 0xff;
      bytes[offset + 1] = (color >> 8) & 0xff;
      bytes[offset + 2] = (color >> 16) & 0xff;
      count++;
    }
  }
  return { ok: true, pixels: count };
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
