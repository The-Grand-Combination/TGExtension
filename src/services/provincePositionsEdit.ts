import type { Assignment, Block, Document } from '../model/ast.js';
import { firstByKey, scalarValueOf } from '../model/astQuery.js';
import {
  BUILDING_POSITION_KINDS,
  POSITION_KINDS,
  type PositionKind,
  type PositionMarker,
  type PositionPoint,
  type ProvincePositions,
} from '../model/mapEditor.js';
import {
  ensureTrailingNewline,
  indentAt,
  indentUnitOf,
  lineEndAt,
  lineEndingOf,
  lineStartAt,
  type TextPatch,
} from './textPatch.js';

/**
 * `map/positions.txt`: one `<province id> = { ... }` block per province holding
 * where the game draws things. The editor moves `unit`, `city` and `factory`
 * (`<kind> = { x y }` at the top of the block) and `fort`, `railroad` and
 * `naval_base` inside `building_position = { ... }`. Everything else in a block
 * (`text_position`, rotations, construction points, ...) is kept as written.
 * `y` counts from the bottom of the map.
 */

const BUILDING_POSITION = 'building_position';
const COORDINATE_DECIMALS = 6;
const TOP_KINDS: readonly PositionKind[] = POSITION_KINDS.filter((kind) => !BUILDING_POSITION_KINDS.includes(kind));

export const EMPTY_PROVINCE_POSITIONS: ProvincePositions = {
  unit: undefined,
  city: undefined,
  factory: undefined,
  fort: undefined,
  railroad: undefined,
  naval_base: undefined,
};

/** The top-level `<id> = { ... }` assignment of a province, if the file has one. */
export function findPositionsBlock(document: Document, provinceId: number): Assignment | undefined {
  const entry = firstByKey(document.entries, String(provinceId));
  return entry?.value.kind === 'block' ? entry : undefined;
}

export function parseProvincePositions(block: Block): ProvincePositions {
  const buildings = blockOf(block, BUILDING_POSITION);
  const positions: Record<PositionKind, PositionPoint | undefined> = { ...EMPTY_PROVINCE_POSITIONS };
  for (const kind of POSITION_KINDS) {
    const container = BUILDING_POSITION_KINDS.includes(kind) ? buildings : block;
    positions[kind] = container ? pointOf(container, kind) : undefined;
  }
  return positions;
}

/** Every editable point of every province block, for the map to draw; points that are not numbers are skipped. */
export function positionMarkersOf(document: Document): PositionMarker[] {
  const markers: PositionMarker[] = [];
  for (const entry of document.entries) {
    if (entry.kind !== 'assignment' || entry.value.kind !== 'block' || !/^\d+$/.test(entry.key.value)) {
      continue;
    }
    const id = Number(entry.key.value);
    const positions = parseProvincePositions(entry.value);
    for (const kind of POSITION_KINDS) {
      const point = positions[kind];
      const x = point === undefined ? Number.NaN : Number(point.x);
      const y = point === undefined ? Number.NaN : Number(point.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        markers.push({ id, kind, x, y });
      }
    }
  }
  return markers;
}

/** A coordinate as the game writes it (six decimals); text that is not a number is kept. */
export function formatCoordinate(value: string): string {
  const trimmed = value.trim();
  const number = Number(trimmed);
  return trimmed !== '' && Number.isFinite(number) ? number.toFixed(COORDINATE_DECIMALS) : trimmed;
}

/** Whether two coordinates are the same number (`643.71` is `643.710000`). */
export function sameCoordinate(left: string, right: string): boolean {
  return formatCoordinate(left) === formatCoordinate(right);
}

/** `<id> = { ... }` holding only the given points, indented with the file's unit. */
export function renderPositionsBlock(
  provinceId: number,
  positions: ProvincePositions,
  indent: string,
  unit: string,
  eol: string,
): string {
  const lines = [`${String(provinceId)} = {`];
  for (const kind of TOP_KINDS) {
    const point = positions[kind];
    if (point) {
      lines.push(...pointLines(kind, point, unit).map((line) => unit + line));
    }
  }
  const buildings = buildingLines(positions, unit);
  if (buildings.length > 0) {
    lines.push(...buildings.map((line) => unit + line));
  }
  lines.push('}');
  return lines.map((line) => indent + line).join(eol);
}

/** A whole new positions file holding one province. */
export function renderPositionsFile(provinceId: number, positions: ProvincePositions): string {
  return ensureTrailingNewline(renderPositionsBlock(provinceId, positions, '', '\t', '\r\n'), '\r\n');
}

/**
 * Patches that make the province's block hold `after`: changed coordinates are
 * rewritten in place, a cleared point loses its lines, a new point is added
 * before the block's closing brace (inside `building_position` for the
 * building kinds, creating that block when needed). Without a block for the
 * province, one is appended to the file. No patch when nothing changed.
 */
export function planPositionsEdit(
  text: string,
  document: Document,
  provinceId: number,
  after: ProvincePositions,
): TextPatch[] {
  const eol = lineEndingOf(text);
  const unit = indentUnitOf(text);
  const existing = findPositionsBlock(document, provinceId);
  if (existing?.value.kind !== 'block') {
    const prefix = text === '' || text.endsWith('\n') ? '' : eol;
    const rendered = renderPositionsBlock(provinceId, after, '', unit, eol);
    return [{ start: text.length, end: text.length, text: `${prefix}${rendered}${eol}` }];
  }
  const block = existing.value;
  const patches: TextPatch[] = [];
  const additions: string[] = [];
  for (const kind of TOP_KINDS) {
    patchPoint(text, block, kind, after[kind], unit, eol, patches, additions);
  }
  additions.push(...patchBuildings(text, block, after, unit, eol, patches));
  if (additions.length > 0) {
    patches.push(insertIntoBlock(text, block, additions, unit, eol));
  }
  return patches;
}

/**
 * The building kinds live one level down. Returns lines to add to the province
 * block when it has no `building_position` yet; an existing one is patched in
 * place, or removed whole when every point in it is cleared and nothing else
 * is inside.
 */
function patchBuildings(
  text: string,
  block: Block,
  after: ProvincePositions,
  unit: string,
  eol: string,
  patches: TextPatch[],
): string[] {
  const entry = firstByKey(block.entries, BUILDING_POSITION);
  const buildings = entry?.value.kind === 'block' ? entry.value : undefined;
  if (!entry || !buildings) {
    return buildingLines(after, unit);
  }
  const wanted = BUILDING_POSITION_KINDS.some((kind) => after[kind] !== undefined);
  const onlyKnownKinds = buildings.entries.every(
    (item) => item.kind === 'assignment' && BUILDING_POSITION_KINDS.includes(item.key.value.toLowerCase() as PositionKind),
  );
  if (!wanted && onlyKnownKinds) {
    if (buildings.entries.length > 0) {
      patches.push(deleteEntryPatch(text, entry.range));
    }
    return [];
  }
  const additions: string[] = [];
  for (const kind of BUILDING_POSITION_KINDS) {
    patchPoint(text, buildings, kind, after[kind], unit, eol, patches, additions);
  }
  if (additions.length > 0) {
    patches.push(insertIntoBlock(text, buildings, additions, unit, eol));
  }
  return [];
}

/**
 * Make `container`'s `<kind> = { x y }` match `wanted`: coordinates that differ
 * are rewritten, a missing coordinate is added, a cleared point is deleted.
 * A point the container lacks is rendered into `additions` for the caller to place.
 */
function patchPoint(
  text: string,
  container: Block,
  kind: PositionKind,
  wanted: PositionPoint | undefined,
  unit: string,
  eol: string,
  patches: TextPatch[],
  additions: string[],
): void {
  const entry = firstByKey(container.entries, kind);
  const point = entry?.value.kind === 'block' ? entry.value : undefined;
  if (!entry || !point) {
    if (wanted) {
      additions.push(...pointLines(kind, wanted, unit));
    }
    return;
  }
  if (!wanted) {
    patches.push(deleteEntryPatch(text, entry.range));
    return;
  }
  const missing: string[] = [];
  for (const [key, value] of [['x', wanted.x], ['y', wanted.y]] as const) {
    const scalar = firstByKey(point.entries, key);
    if (scalar?.value.kind === 'scalar') {
      if (!sameCoordinate(scalar.value.value, value)) {
        patches.push({ ...scalar.value.range, text: formatCoordinate(value) });
      }
    } else {
      missing.push(`${key} = ${formatCoordinate(value)}`);
    }
  }
  if (missing.length > 0) {
    patches.push(insertIntoBlock(text, point, missing, unit, eol));
  }
}

/** `building_position = { ... }` lines for the building points `positions` has; none when it has none. */
function buildingLines(positions: ProvincePositions, unit: string): string[] {
  const inner: string[] = [];
  for (const kind of BUILDING_POSITION_KINDS) {
    const point = positions[kind];
    if (point) {
      inner.push(...pointLines(kind, point, unit).map((line) => unit + line));
    }
  }
  return inner.length === 0 ? [] : [`${BUILDING_POSITION} = {`, ...inner, '}'];
}

function pointLines(kind: PositionKind, point: PositionPoint, unit: string): string[] {
  return [`${kind} = {`, `${unit}x = ${formatCoordinate(point.x)}`, `${unit}y = ${formatCoordinate(point.y)}`, '}'];
}

/**
 * Insert `lines` (unindented) as the last entries of a block: before the line
 * of its closing brace when that brace has a line of its own, else the block
 * is opened up onto several lines (`2985 = {}` becomes a normal block).
 */
function insertIntoBlock(text: string, block: Block, lines: readonly string[], unit: string, eol: string): TextPatch {
  const closeAt = block.range.end - 1;
  const outerIndent = indentAt(text, block.range.start);
  const closeLineStart = lineStartAt(text, closeAt);
  if (text.slice(block.range.start, closeAt).includes('\n') && text.slice(closeLineStart, closeAt).trim() === '') {
    const first = block.entries[0];
    const inner = first ? indentAt(text, first.range.start) : indentAt(text, closeAt) + unit;
    return { start: closeLineStart, end: closeLineStart, text: lines.map((line) => inner + line).join(eol) + eol };
  }
  const inner = outerIndent + unit;
  return { start: closeAt, end: closeAt, text: eol + lines.map((line) => inner + line).join(eol) + eol + outerIndent };
}

/**
 * Remove an entry with the lines it occupies when nothing else shares them,
 * together with one blank line that follows (the files leave one after every
 * block); otherwise remove just its text.
 */
function deleteEntryPatch(text: string, range: { readonly start: number; readonly end: number }): TextPatch {
  const lineStart = lineStartAt(text, range.start);
  let lineEnd = lineEndAt(text, range.end - 1);
  if (text.slice(lineStart, range.start).trim() !== '' || text.slice(range.end, lineEnd).trim() !== '') {
    return { start: range.start, end: range.end, text: '' };
  }
  const nextLineEnd = lineEndAt(text, lineEnd);
  if (nextLineEnd > lineEnd && text.slice(lineEnd, nextLineEnd).trim() === '') {
    lineEnd = nextLineEnd;
  }
  return { start: lineStart, end: lineEnd, text: '' };
}

function blockOf(block: Block, key: string): Block | undefined {
  const entry = firstByKey(block.entries, key);
  return entry?.value.kind === 'block' ? entry.value : undefined;
}

function pointOf(container: Block, kind: PositionKind): PositionPoint | undefined {
  const point = blockOf(container, kind);
  const x = point ? scalarValueOf(point.entries, 'x') : undefined;
  const y = point ? scalarValueOf(point.entries, 'y') : undefined;
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}
