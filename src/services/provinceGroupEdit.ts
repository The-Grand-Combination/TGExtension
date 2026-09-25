import type { Assignment, Block, Document, Scalar } from '../model/ast.js';
import { assignmentsOf } from '../model/astQuery.js';
import { lineEndingOf, type TextPatch } from './textPatch.js';

/**
 * The three map files that say which group a province belongs to:
 * `map/climate.txt`, `map/region.txt` and `map/continent.txt`. A province
 * belongs to one climate, one continent and at least one region, and all three
 * are edited the same way: the id joins the blocks it should be in and leaves
 * the ones it should not.
 *
 * They differ in one thing only — where a group keeps its ids — and that is
 * what `ProvinceListShape` names.
 */

/**
 * Where a group keeps its province ids.
 *
 * `bare`: straight in the named block, as `climate.txt` and `region.txt` write
 * them. Climate names a block twice, once with its modifiers and once with its
 * provinces, so only a block holding nothing but numbers is a membership.
 *
 * `nested`: in a `provinces = { }` inside the named block, as `continent.txt`
 * writes them, because that block carries the continent's modifiers as well.
 */
export type ProvinceListShape = 'bare' | 'nested';

/** A block of bare province ids; a modifier block (`farm_rgo_size = 0`) is not one. */
export function isProvinceList(block: Block): boolean {
  return block.entries.every((entry) => entry.kind === 'scalar' && entry.type === 'number');
}

const PROVINCES_KEY = 'provinces';

/** The block holding a group's ids, or undefined when the group has none yet. */
function listBlockOf(assignment: Assignment, shape: ProvinceListShape): Block | undefined {
  const body = assignment.value.kind === 'block' ? assignment.value : undefined;
  if (body === undefined) {
    return undefined;
  }
  if (shape === 'bare') {
    return isProvinceList(body) ? body : undefined;
  }
  const provinces = assignmentsOf(body.entries).find((entry) => same(entry.key.value, PROVINCES_KEY));
  return provinces?.value.kind === 'block' ? provinces.value : undefined;
}

interface GroupBlock {
  readonly name: string;
  readonly block: Block;
}

function groupBlocks(document: Document, shape: ProvinceListShape): GroupBlock[] {
  return assignmentsOf(document.entries).flatMap((assignment: Assignment) => {
    const block = listBlockOf(assignment, shape);
    return block ? [{ name: assignment.key.value, block }] : [];
  });
}

/** The named block itself, for a group that exists but keeps no id list yet. */
function bodyOf(document: Document, name: string): Block | undefined {
  const found = assignmentsOf(document.entries).find((assignment) => same(assignment.key.value, name));
  return found?.value.kind === 'block' ? found.value : undefined;
}

function idsOf(block: Block, provinceId: number): Scalar[] {
  const wanted = String(provinceId);
  return block.entries.filter((entry): entry is Scalar => entry.kind === 'scalar' && entry.value === wanted);
}

/** The groups whose id list holds the province, in file order. */
export function groupsOfProvince(
  document: Document,
  provinceId: number,
  shape: ProvinceListShape = 'bare',
): string[] {
  const names: string[] = [];
  for (const group of groupBlocks(document, shape)) {
    if (idsOf(group.block, provinceId).length > 0 && !names.includes(group.name)) {
      names.push(group.name);
    }
  }
  return names;
}

/** The first group listing each province, in file order: the one the engine puts the province in. */
export function firstGroupByProvince(
  document: Document,
  shape: ProvinceListShape = 'bare',
): Map<number, string> {
  const first = new Map<number, string>();
  for (const group of groupBlocks(document, shape)) {
    for (const entry of group.block.entries) {
      const id = entry.kind === 'scalar' ? Number(entry.value) : NaN;
      if (Number.isInteger(id) && !first.has(id)) {
        first.set(id, group.name);
      }
    }
  }
  return first;
}

/** Every group the file declares, id lists and modifier blocks alike, without repeats. */
export function groupNames(document: Document): string[] {
  const names: string[] = [];
  for (const assignment of assignmentsOf(document.entries)) {
    if (assignment.value.kind === 'block' && !names.some((name) => same(name, assignment.key.value))) {
      names.push(assignment.key.value);
    }
  }
  return names;
}

function same(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * The province in exactly the groups named, and in no others. A group the file
 * does not declare yet becomes a block of its own at the end of the file.
 */
export function planGroupEdit(
  text: string,
  document: Document,
  provinceId: number,
  groups: readonly string[],
  shape: ProvinceListShape = 'bare',
): TextPatch[] {
  const wanted = groups.map((name) => name.trim()).filter((name) => name !== '');
  const blocks = groupBlocks(document, shape);
  const patches: TextPatch[] = [];
  for (const group of blocks) {
    if (wanted.some((name) => same(name, group.name))) {
      continue;
    }
    for (const scalar of idsOf(group.block, provinceId)) {
      patches.push(removePatch(text, scalar));
    }
  }
  for (const name of dedupe(wanted)) {
    const patch = joinPatch(text, document, blocks, name, provinceId, shape);
    if (patch) {
      patches.push(patch);
    }
  }
  return patches;
}

function dedupe(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (!out.some((kept) => same(kept, name))) {
      out.push(name);
    }
  }
  return out;
}

/**
 * The id after the last one already in the group's list. A group named only by
 * a modifier block — a climate with no provinces yet — gets its id list written
 * where `newListPatch` puts it.
 */
function joinPatch(
  text: string,
  document: Document,
  blocks: readonly GroupBlock[],
  name: string,
  provinceId: number,
  shape: ProvinceListShape,
): TextPatch | undefined {
  const lists = blocks.filter((group) => same(group.name, name));
  const block = lists[lists.length - 1]?.block;
  if (!block) {
    return newListPatch(text, document, name, provinceId, shape);
  }
  if (idsOf(block, provinceId).length > 0) {
    return undefined;
  }
  const numbers = block.entries.filter((entry) => entry.kind === 'scalar');
  const last = numbers[numbers.length - 1];
  const at = last ? last.range.end : block.range.start + 1;
  return { start: at, end: at, text: ' ' + String(provinceId) };
}

/**
 * A group with no id list yet. A continent that is already declared gets its
 * `provinces = { }` written inside the block it already has, so its modifiers
 * are left where they are; anything else is written as a new block at the end
 * of the file, which is where the engine expects to find one.
 */
function newListPatch(
  text: string,
  document: Document,
  name: string,
  provinceId: number,
  shape: ProvinceListShape,
): TextPatch {
  const id = String(provinceId);
  const body = shape === 'nested' ? bodyOf(document, name) : undefined;
  if (body) {
    const at = body.range.start + 1;
    return { start: at, end: at, text: ` ${PROVINCES_KEY} = { ${id} }` };
  }
  const eol = lineEndingOf(text);
  const lead = text === '' || text.endsWith('\n') ? '' : eol;
  const written = shape === 'nested' ? `${name} = { ${PROVINCES_KEY} = { ${id} } }` : `${name} = { ${id} }`;
  return { start: text.length, end: text.length, text: `${lead}${written}${eol}` };
}

/**
 * The id and one separator with it: the blank that held it apart from its
 * neighbour, or the whole line when it was alone on one.
 */
function removePatch(text: string, scalar: Scalar): TextPatch {
  const lineStart = text.lastIndexOf('\n', scalar.range.start - 1) + 1;
  const newline = text.indexOf('\n', scalar.range.end);
  const lineEnd = newline === -1 ? text.length : newline + 1;
  const before = text.slice(lineStart, scalar.range.start);
  const after = text.slice(scalar.range.end, lineEnd);
  if (before.trim() === '' && after.trim() === '') {
    return { start: lineStart, end: lineEnd, text: '' };
  }
  // Nothing but indentation before it: that belongs to the line, so the blank
  // that goes with the id is the one after it.
  const blank = before.trim() === '' ? null : /[ \t]+$/.exec(before);
  if (blank) {
    return { start: scalar.range.start - blank[0].length, end: scalar.range.end, text: '' };
  }
  const trailing = /^[ \t]+/.exec(after);
  return { start: scalar.range.start, end: scalar.range.end + (trailing?.[0].length ?? 0), text: '' };
}

/** Where the id list of a group begins, for a file reference pointing at it. */
export function groupOffsetOf(
  document: Document,
  name: string,
  shape: ProvinceListShape = 'bare',
): number | undefined {
  const found = assignmentsOf(document.entries).find(
    (assignment) => listBlockOf(assignment, shape) !== undefined && same(assignment.key.value, name),
  );
  return found?.range.start;
}
