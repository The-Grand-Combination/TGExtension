import type { Range } from './range.js';

export type Operator = '=' | '<' | '>' | '<=' | '>=';

export type ScalarType = 'string' | 'number' | 'date' | 'boolean' | 'identifier';

export interface Scalar {
  readonly kind: 'scalar';
  readonly type: ScalarType;
  readonly value: string;
  readonly range: Range;
}

export interface Assignment {
  readonly kind: 'assignment';
  readonly key: Scalar;
  readonly operator: Operator;
  readonly value: Value;
  readonly range: Range;
}

export interface Block {
  readonly kind: 'block';
  readonly entries: readonly Entry[];
  readonly range: Range;
}

export interface Document {
  readonly kind: 'document';
  readonly entries: readonly Entry[];
  readonly range: Range;
}

export type Value = Scalar | Block;

export type Entry = Assignment | Scalar | Block;
