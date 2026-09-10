import * as assert from 'node:assert';
import type { Assignment, Block, Entry } from '../../model/ast.js';

/** Return the element at `index`, failing the test if it is absent. */
export function nth<T>(items: readonly T[], index: number): T {
  const item: T | undefined = items[index];
  if (item === undefined) {
    throw new assert.AssertionError({ message: `expected an element at index ${String(index)}` });
  }
  return item;
}

export function expectAssignment(entry: Entry | undefined): Assignment {
  if (entry?.kind !== 'assignment') {
    throw new assert.AssertionError({ message: 'expected an assignment entry' });
  }
  return entry;
}

export function expectBlock(entry: Entry | undefined): Block {
  if (entry?.kind !== 'block') {
    throw new assert.AssertionError({ message: 'expected a block entry' });
  }
  return entry;
}
