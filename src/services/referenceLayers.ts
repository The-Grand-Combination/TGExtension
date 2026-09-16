import type { Point } from './provincePaint.js';

/**
 * Reference images laid over the map: pictures the modder drops in to draw
 * against, kept inside the mod so they travel with it. Each one is a
 * quadrilateral in map pixels — a rectangle until it is distorted — and an
 * opacity. Both the page and the extension read this file, so the geometry
 * the page drags with and the manifest the extension writes agree by
 * construction.
 */

export const REFERENCES_FOLDER = 'map/references';
export const REFERENCES_MANIFEST = 'references.json';
export const DEFAULT_REFERENCE_OPACITY = 60;

/** Top-left, top-right, bottom-right, bottom-left, in map pixels. */
export type Quad = readonly [Point, Point, Point, Point];

export interface ReferenceLayer {
  /** File name inside `map/references`, as it was dropped (made safe and unique). */
  readonly file: string;
  readonly corners: Quad;
  /** 0-100. */
  readonly opacity: number;
  /** Switched off for now, its opacity kept for when it comes back; absent means shown. */
  readonly hidden?: boolean;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The eight grips of the frame: four corners and four sides. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// --- The manifest ------------------------------------------------------------------

/** Anything that is not a whole reference is left out; the rest of the file still counts. */
export function parseReferences(text: string): ReferenceLayer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list: unknown = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)['references'] : undefined;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((item: unknown) => {
    const layer = asReference(item);
    return layer ? [layer] : [];
  });
}

export function asReference(value: unknown): ReferenceLayer | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const corners = asQuad(record['corners']);
  const opacity = record['opacity'];
  if (typeof record['file'] !== 'string' || record['file'] === '' || !corners || typeof opacity !== 'number' || !Number.isFinite(opacity)) {
    return undefined;
  }
  const layer: ReferenceLayer = { file: record['file'], corners, opacity: Math.min(100, Math.max(0, opacity)) };
  return record['hidden'] === true ? { ...layer, hidden: true } : layer;
}

function asQuad(value: unknown): Quad | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const points = value.map(asPoint);
  const [a, b, c, d] = points;
  return a && b && c && d ? [a, b, c, d] : undefined;
}

/**
 * A point as the manifest writes it, `[x, y]`, or as the page holds it, `{x, y}`:
 * the page posts its own list back, and a shape it could not send would empty
 * the manifest on every drag.
 */
function asPoint(value: unknown): Point | undefined {
  let x: unknown;
  let y: unknown;
  if (Array.isArray(value) && value.length === 2) {
    [x, y] = value as unknown[];
  } else if (typeof value === 'object' && value !== null) {
    ({ x, y } = value as { x?: unknown; y?: unknown });
  } else {
    return undefined;
  }
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/**
 * The list the extension sent, merged with the one the page holds. The
 * extension only adds and removes pictures, so it decides which files are in
 * the list and in what order; the page owns where each picture sits and how
 * see-through it is, so a file both lists hold keeps the page's geometry — a
 * drag the manifest has not caught up with is not undone by the answer.
 */
export function mergeReferenceLists(current: readonly ReferenceLayer[], incoming: readonly ReferenceLayer[]): ReferenceLayer[] {
  const held = new Map(current.map((layer) => [layer.file, layer] as const));
  return incoming.map((layer) => held.get(layer.file) ?? layer);
}

/** Corners as `[x, y]` pairs, rounded to a hundredth: a file a diff can read. */
export function renderReferences(layers: readonly ReferenceLayer[]): string {
  const references = layers.map((layer) => ({
    file: layer.file,
    corners: layer.corners.map((corner) => [round(corner.x), round(corner.y)]),
    opacity: Math.round(layer.opacity),
    ...(layer.hidden === true ? { hidden: true } : {}),
  }));
  return JSON.stringify({ references }, null, 2) + '\n';
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A safe, unused file name for a dropped picture: only letters, digits, `-`,
 * `_` and `.` survive, and a name already in the folder gets `-2`, `-3`, ...
 * before its extension.
 */
export function freeFileName(taken: readonly string[], wanted: string): string {
  const safe = wanted.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '') || 'reference.png';
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : '';
  const lower = new Set(taken.map((name) => name.toLowerCase()));
  if (!lower.has(safe.toLowerCase())) {
    return safe;
  }
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${String(n)}${extension}`;
    if (!lower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

// --- The geometry ------------------------------------------------------------------

export function quadOfBox(x: number, y: number, width: number, height: number): Quad {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

export function boundsOf(quad: Quad): Box {
  const xs = quad.map((corner) => corner.x);
  const ys = quad.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * True while the corners form a parallelogram: the picture is then an affine
 * image of itself and one `drawImage` under a transform draws it exactly. A
 * distorted quad needs the mesh.
 */
export function isAffine(quad: Quad): boolean {
  const [a, b, c, d] = quad;
  return Math.abs(a.x + c.x - b.x - d.x) < 1e-6 && Math.abs(a.y + c.y - b.y - d.y) < 1e-6;
}

export function moveQuad(quad: Quad, dx: number, dy: number): Quad {
  return mapQuad(quad, (corner) => ({ x: corner.x + dx, y: corner.y + dy }));
}

/** Every corner carried by the transformation that takes one box to the other; a distorted quad stays distorted. */
export function fitQuad(quad: Quad, from: Box, to: Box): Quad {
  const scaleX = from.width === 0 ? 1 : to.width / from.width;
  const scaleY = from.height === 0 ? 1 : to.height / from.height;
  return mapQuad(quad, (corner) => ({
    x: to.x + (corner.x - from.x) * scaleX,
    y: to.y + (corner.y - from.y) * scaleY,
  }));
}

/**
 * The frame a dragged grip asks for. A side grip moves that side; a corner grip
 * moves two. `proportional` keeps the frame's shape, growing from the opposite
 * corner (or, for a side grip, the opposite side) by whichever axis was pulled
 * further. The frame never turns inside out: a side dragged past the other
 * stops one pixel short of it.
 */
export function boxFromHandle(box: Box, handle: Handle, dx: number, dy: number, proportional: boolean): Box {
  const pull: Pull = {
    west: handle.includes('w'),
    east: handle.includes('e'),
    north: handle.includes('n'),
    south: handle.includes('s'),
  };
  return proportional ? proportionalBox(box, pull, dx, dy) : stretchedBox(box, pull, dx, dy);
}

/** Which sides a grip pulls: one for a side grip, two for a corner. */
interface Pull {
  readonly west: boolean;
  readonly east: boolean;
  readonly north: boolean;
  readonly south: boolean;
}

function stretchedBox(box: Box, pull: Pull, dx: number, dy: number): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (pull.west) { left = Math.min(left + dx, right - 1); }
  if (pull.east) { right = Math.max(right + dx, left + 1); }
  if (pull.north) { top = Math.min(top + dy, bottom - 1); }
  if (pull.south) { bottom = Math.max(bottom + dy, top + 1); }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The frame grows away from what is not being pulled — a corner from the
 * opposite corner, a side from the middle of the opposite side — by whichever
 * axis was pulled further.
 */
function proportionalBox(box: Box, pull: Pull, dx: number, dy: number): Box {
  const pulledWidth = Math.max(1, box.width + (pull.east ? dx : pull.west ? -dx : 0));
  const pulledHeight = Math.max(1, box.height + (pull.south ? dy : pull.north ? -dy : 0));
  const factor = box.width === 0 || box.height === 0 ? 1 : Math.max(pulledWidth / box.width, pulledHeight / box.height);
  const width = Math.max(1, box.width * factor);
  const height = Math.max(1, box.height * factor);
  const anchorX = pull.east ? box.x : pull.west ? box.x + box.width : box.x + box.width / 2;
  const anchorY = pull.south ? box.y : pull.north ? box.y + box.height : box.y + box.height / 2;
  return {
    x: pull.east ? anchorX : pull.west ? anchorX - width : anchorX - width / 2,
    y: pull.south ? anchorY : pull.north ? anchorY - height : anchorY - height / 2,
    width,
    height,
  };
}

/** Which corners of the quad a grip stands for: one for a corner grip, the two along a side for a side grip. */
function cornersOf(handle: Handle): readonly (0 | 1 | 2 | 3)[] {
  switch (handle) {
    case 'nw': return [0];
    case 'ne': return [1];
    case 'se': return [2];
    case 'sw': return [3];
    case 'n': return [0, 1];
    case 'e': return [1, 2];
    case 's': return [2, 3];
    case 'w': return [3, 0];
  }
}

/** Photoshop's distort: a corner grip moves that corner alone, a side grip slides its whole side. */
export function distortQuad(quad: Quad, handle: Handle, dx: number, dy: number): Quad {
  const moved = new Set<number>(cornersOf(handle));
  return mapQuad(quad, (corner, index) => (moved.has(index) ? { x: corner.x + dx, y: corner.y + dy } : corner));
}

/**
 * The grip under a point, else `inside` when the point is within the picture,
 * else null. Grips sit on the frame — the quad's bounding box — so they are
 * where the eye sees them even when the picture is distorted. `tolerance` is in
 * map pixels: half the grip's drawn size divided by the zoom.
 */
export function handleAt(quad: Quad, point: Point, tolerance: number): Handle | 'inside' | null {
  const box = boundsOf(quad);
  for (const handle of HANDLES) {
    const grip = handlePoint(box, handle);
    if (Math.abs(grip.x - point.x) <= tolerance && Math.abs(grip.y - point.y) <= tolerance) {
      return handle;
    }
  }
  return insideQuad(quad, point) ? 'inside' : null;
}

/** Where a grip is drawn on the frame. */
export function handlePoint(box: Box, handle: Handle): Point {
  const x = handle.includes('w') ? box.x : handle.includes('e') ? box.x + box.width : box.x + box.width / 2;
  const y = handle.includes('n') ? box.y : handle.includes('s') ? box.y + box.height : box.y + box.height / 2;
  return { x, y };
}

/** Even-odd test over the four edges: holds for a convex picture and a distorted one alike. */
export function insideQuad(quad: Quad, point: Point): boolean {
  const [a, b, c, d] = quad;
  const edges: readonly (readonly [Point, Point])[] = [[d, a], [a, b], [b, c], [c, d]];
  let inside = false;
  for (const [from, to] of edges) {
    const crosses = from.y > point.y !== to.y > point.y
      && point.x < ((to.x - from.x) * (point.y - from.y)) / (to.y - from.y) + from.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

// --- Drawing a distorted picture -----------------------------------------------------

/** The point of the quad at picture fraction (u, v), u across and v down: bilinear in the four corners. */
export function bilinear(quad: Quad, u: number, v: number): Point {
  const [a, b, c, d] = quad;
  const topX = a.x + (b.x - a.x) * u;
  const topY = a.y + (b.y - a.y) * u;
  const bottomX = d.x + (c.x - d.x) * u;
  const bottomY = d.y + (c.y - d.y) * u;
  return { x: topX + (bottomX - topX) * v, y: topY + (bottomY - topY) * v };
}

/** `a b c d e f` of the canvas transform, as `ctx.transform` takes them. */
export type Affine = readonly [number, number, number, number, number, number];

/**
 * The affine map taking one triangle onto another — three points fix it. A
 * distorted picture is drawn as a mesh of such triangles, each clipped and
 * drawn with its own map; a parallelogram needs just the one for its corners.
 */
export function affineFromTriangles(source: readonly [Point, Point, Point], target: readonly [Point, Point, Point]): Affine | undefined {
  const [s0, s1, s2] = source;
  const [t0, t1, t2] = target;
  const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(det) < 1e-9) {
    return undefined;
  }
  const a = (t0.x * (s1.y - s2.y) + t1.x * (s2.y - s0.y) + t2.x * (s0.y - s1.y)) / det;
  const b = (t0.y * (s1.y - s2.y) + t1.y * (s2.y - s0.y) + t2.y * (s0.y - s1.y)) / det;
  const c = (t0.x * (s2.x - s1.x) + t1.x * (s0.x - s2.x) + t2.x * (s1.x - s0.x)) / det;
  const d = (t0.y * (s2.x - s1.x) + t1.y * (s0.x - s2.x) + t2.y * (s1.x - s0.x)) / det;
  const e = (t0.x * (s1.x * s2.y - s2.x * s1.y) + t1.x * (s2.x * s0.y - s0.x * s2.y) + t2.x * (s0.x * s1.y - s1.x * s0.y)) / det;
  const f = (t0.y * (s1.x * s2.y - s2.x * s1.y) + t1.y * (s2.x * s0.y - s0.x * s2.y) + t2.y * (s0.x * s1.y - s1.x * s0.y)) / det;
  return [a, b, c, d, e, f];
}

export function applyAffine(matrix: Affine, point: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

function mapQuad(quad: Quad, map: (corner: Point, index: 0 | 1 | 2 | 3) => Point): Quad {
  return [map(quad[0], 0), map(quad[1], 1), map(quad[2], 2), map(quad[3], 3)];
}
