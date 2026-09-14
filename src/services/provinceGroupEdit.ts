import type { Assignment, Block, Document, Scalar } from '../model/ast.js';
import { assignmentsOf } from '../model/astQuery.js';
import { lineEndingOf, type TextPatch } from './textPatch.js';

/**
 * `map/climate.txt` and `map/region.txt` are the same file shape: named blocks
 * of bare province ids, saying which group each province belongs to. Climate
 * names the block twice — once with its modifiers, once with its provinces — so
 * only the blocks holding nothing but numbers count as membership.
 *
 * A province belongs to one climate and to at least one region, and both are
 * edited the same way: the id joins the blocks it should be in and leaves the
 * ones it should not.
 */

/** A block of bare province ids; a modifier block (`farm_rgo_size = 0`) is not one. */
export function isProvinceList(block: Block): boolean {
  return block.entries.every((entry) => entry.kind === 'scalar' && entry.type === 'number');
}

interface GroupBlock {
  readonly name: string;
  readonly block: Block;
}

function groupBlocks(document: Document): GroupBlock[] {
  return assignmentsOf(document.entries).flatMap((assignment: Assignment) =>
    assignment.value.kind === 'block' && isProvinceList(assignment.value)
      ? [{ name: assignment.key.value, block: assignment.value }]
      : [],
  );
}

function idsOf(block: Block, provinceId: number): Scalar[] {
  const wanted = String(provinceId);
  return block.entries.filter((entry): entry is Scalar => entry.kind === 'scalar' && entry.value === wanted);
}

/** The groups whose id list holds the province, in file order. */
export function groupsOfProvince(document: Document, provinceId: number): string[] {
  const names: string[] = [];
  for (const group of groupBlocks(document)) {
    if (idsOf(group.block, provinceId).length > 0 && !names.includes(group.name)) {
      names.push(group.name);
    }
  }
  return names;
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
): TextPatch[] {
  const wanted = groups.map((name) => name.trim()).filter((name) => name !== '');
  const blocks = groupBlocks(document);
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
    const patch = joinPatch(text, blocks, name, provinceId);
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
 * at the end of the file, which is where the engine expects to find one.
 */
function joinPatch(text: string, blocks: readonly GroupBlock[], name: string, provinceId: number): TextPatch | undefined {
  const lists = blocks.filter((group) => same(group.name, name));
  const block = lists[lists.length - 1]?.block;
  if (!block) {
    const eol = lineEndingOf(text);
    const lead = text === '' || text.endsWith('\n') ? '' : eol;
    return { start: text.length, end: text.length, text: `${lead}${name} = { ${String(provinceId)} }${eol}` };
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
export function groupOffsetOf(document: Document, name: string): number | undefined {
  const found = assignmentsOf(document.entries).find(
    (assignment) => assignment.value.kind === 'block' && isProvinceList(assignment.value) && same(assignment.key.value, name),
  );
  return found?.range.start;
}
