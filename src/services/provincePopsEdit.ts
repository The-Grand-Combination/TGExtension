import type { Assignment, Block, Document } from '../model/ast.js';
import type { PopEntry } from '../model/mapEditor.js';
import { ensureTrailingNewline, indentAt, indentUnitOf, lineEndingOf, type TextPatch } from './textPatch.js';

/**
 * Pops files (`history/pops/<date>/<file>.txt`): one `<province id> = { ... }`
 * block per province, each pop a `<type> = { culture religion size ... }`
 * block inside it. A province's block is rewritten whole; the rest of the file
 * is never touched.
 */

const DATE_PATTERN = /^\d+\.\d+\.\d+$/;
/** A province block opener at the start of a line; how a file is scanned for the province it holds. */
const BLOCK_OPENER = /^[ \t]*(\d+)[ \t]*=[ \t]*\{/gm;

/** The date folders among `history/pops/<date>/<file>` paths, earliest first. */
export function popDatesOf(relativePaths: readonly string[]): string[] {
  const dates = new Set<string>();
  for (const relativePath of relativePaths) {
    const date = relativePath.split('/')[2];
    if (date !== undefined && DATE_PATTERN.test(date) && relativePath.split('/').length === 4) {
      dates.add(date);
    }
  }
  return [...dates].sort(compareDates);
}

/** File names directly under `history/pops/<date>`, sorted. */
export function popFilesOf(relativePaths: readonly string[], date: string): string[] {
  const prefix = `history/pops/${date}/`;
  return relativePaths
    .filter((relativePath) => relativePath.startsWith(prefix) && !relativePath.slice(prefix.length).includes('/'))
    .map((relativePath) => relativePath.slice(prefix.length))
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right));
}

/** Province ids whose block opens in this text; a cheap scan that needs no parse. */
export function provinceIdsInPopsFile(text: string): number[] {
  const ids: number[] = [];
  for (const match of text.matchAll(BLOCK_OPENER)) {
    if (match[1] !== undefined) {
      ids.push(Number(match[1]));
    }
  }
  return ids;
}

/** The top-level `<id> = { ... }` assignment of a province, if the file has one. */
export function findPopsBlock(document: Document, provinceId: number): Assignment | undefined {
  const key = String(provinceId);
  for (const entry of document.entries) {
    if (entry.kind === 'assignment' && entry.key.value === key && entry.value.kind === 'block') {
      return entry;
    }
  }
  return undefined;
}

export function parsePops(block: Block): PopEntry[] {
  const pops: PopEntry[] = [];
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment' || entry.value.kind !== 'block') {
      continue;
    }
    const fields = scalarFields(entry.value);
    pops.push({
      type: entry.key.value,
      culture: fields.get('culture') ?? '',
      religion: fields.get('religion') ?? '',
      size: fields.get('size') ?? '',
      militancy: fields.get('militancy'),
      rebelType: fields.get('rebel_type'),
    });
  }
  return pops;
}

function scalarFields(block: Block): Map<string, string> {
  const fields = new Map<string, string>();
  for (const entry of block.entries) {
    if (entry.kind === 'assignment' && entry.value.kind === 'scalar') {
      fields.set(entry.key.value.toLowerCase(), entry.value.value);
    }
  }
  return fields;
}

/** `<id> = { ... }` with one block per pop, indented with the file's unit. */
export function renderPopsBlock(
  provinceId: number,
  pops: readonly PopEntry[],
  indent: string,
  unit: string,
  eol: string,
): string {
  const lines = [`${indent}${String(provinceId)} = {`];
  for (const pop of pops) {
    if (pop.type.trim() === '') {
      continue;
    }
    lines.push(`${indent}${unit}${pop.type.trim()} = {`);
    for (const [key, value] of popFields(pop)) {
      lines.push(`${indent}${unit}${unit}${key} = ${value}`);
    }
    lines.push(`${indent}${unit}}`);
  }
  lines.push(`${indent}}`);
  return lines.join(eol);
}

function popFields(pop: PopEntry): [string, string][] {
  const fields: [string, string][] = [
    ['culture', pop.culture.trim()],
    ['religion', pop.religion.trim()],
    ['size', pop.size.trim()],
  ];
  if (pop.militancy !== undefined && pop.militancy.trim() !== '') {
    fields.push(['militancy', pop.militancy.trim()]);
  }
  if (pop.rebelType !== undefined && pop.rebelType.trim() !== '') {
    fields.push(['rebel_type', pop.rebelType.trim()]);
  }
  return fields;
}

/**
 * Rewrite the province's block in place, or append one when the file has
 * none. Returns no patch when the pops did not change.
 */
export function planPopsEdit(text: string, document: Document, provinceId: number, pops: readonly PopEntry[]): TextPatch[] {
  const eol = lineEndingOf(text);
  const unit = indentUnitOf(text);
  const existing = findPopsBlock(document, provinceId);
  if (existing?.value.kind === 'block') {
    const indent = indentAt(text, existing.range.start);
    const rendered = renderPopsBlock(provinceId, pops, indent, unit, eol);
    const current = renderPopsBlock(provinceId, parsePops(existing.value), indent, unit, eol);
    return current === rendered ? [] : [{ ...existing.range, text: rendered.slice(indent.length) }];
  }
  const prefix = text === '' || text.endsWith('\n') ? '' : eol;
  const rendered = renderPopsBlock(provinceId, pops, '', unit, eol);
  return [{ start: text.length, end: text.length, text: `${prefix}${rendered}${eol}` }];
}

/** A whole new pops file holding one province. */
export function renderPopsFile(provinceId: number, pops: readonly PopEntry[]): string {
  return ensureTrailingNewline(renderPopsBlock(provinceId, pops, '', '\t', '\r\n'), '\r\n');
}

function compareDates(left: string, right: string): number {
  const [leftParts, rightParts] = [left, right].map((date) => date.split('.').map(Number));
  for (let index = 0; index < 3; index++) {
    const difference = (leftParts?.[index] ?? 0) - (rightParts?.[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}
