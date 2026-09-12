import type { Assignment, Block, Document, Entry, Value } from './ast.js';

/** Read helpers over the AST. Key comparisons are case-insensitive (Paradox is). */

export function assignmentsOf(entries: readonly Entry[]): Assignment[] {
  return entries.filter((entry) => entry.kind === 'assignment');
}

export function findByKey(entries: readonly Entry[], key: string): Assignment[] {
  const lower = key.toLowerCase();
  return assignmentsOf(entries).filter((assignment) => assignment.key.value.toLowerCase() === lower);
}

export function firstByKey(entries: readonly Entry[], key: string): Assignment | undefined {
  return findByKey(entries, key)[0];
}

export function asBlock(value: Value): Block | undefined {
  return value.kind === 'block' ? value : undefined;
}

export function scalarValueOf(entries: readonly Entry[], key: string): string | undefined {
  const assignment = firstByKey(entries, key);
  return assignment?.value.kind === 'scalar' ? assignment.value.value : undefined;
}

export function blockKeysOf(container: Document | Block): Assignment[] {
  return assignmentsOf(container.entries).filter((assignment) => assignment.value.kind === 'block');
}
