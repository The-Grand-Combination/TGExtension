import type { Range } from './range.js';

/** Comparison/assignment operator between a key and its value. */
export type Operator = '=' | '<' | '>' | '<=' | '>=';

/** Lexical category of a scalar value, inferred from its text. */
export type ScalarType = 'string' | 'number' | 'date' | 'boolean' | 'identifier';

/** A leaf value: a bareword, quoted string, number, date, or boolean. */
export interface Scalar {
  readonly kind: 'scalar';
  readonly type: ScalarType;
  readonly value: string;
  readonly range: Range;
}

/** A `key = value` pair. `value` is a scalar or a nested block. */
export interface Assignment {
  readonly kind: 'assignment';
  readonly key: Scalar;
  readonly operator: Operator;
  readonly value: Value;
  readonly range: Range;
}

/** A `{ ... }` block containing further entries. */
export interface Block {
  readonly kind: 'block';
  readonly entries: readonly Entry[];
  readonly range: Range;
}

/** The parsed root of a whole file. */
export interface Document {
  readonly kind: 'document';
  readonly entries: readonly Entry[];
  readonly range: Range;
}

/** The right-hand side of an assignment. */
export type Value = Scalar | Block;

/** An item inside a block or document: a `key = value` pair, or a bare list item. */
export type Entry = Assignment | Scalar | Block;
