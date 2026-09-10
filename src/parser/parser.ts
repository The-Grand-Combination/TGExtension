import type { Block, Document, Entry, Operator, Scalar, ScalarType } from '../model/ast.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import type { Token, TokenKind } from './lexer.js';

export interface ParseResult {
  readonly document: Document;
  readonly diagnostics: readonly Diagnostic[];
}

const OPERATOR_BY_KIND: Partial<Record<TokenKind, Operator>> = {
  equals: '=',
  lt: '<',
  gt: '>',
  le: '<=',
  ge: '>=',
};

function operatorForKind(kind: TokenKind): Operator | undefined {
  return OPERATOR_BY_KIND[kind];
}

const DATE_PATTERN = /^-?\d+\.\d+\.\d+$/;
// Paradox accepts leading '+' and bare-dot decimals ('.25').
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function classifyWord(value: string): ScalarType {
  const lower = value.toLowerCase();
  if (lower === 'yes' || lower === 'no') {
    return 'boolean';
  }
  if (DATE_PATTERN.test(value)) {
    return 'date';
  }
  if (NUMBER_PATTERN.test(value)) {
    return 'number';
  }
  return 'identifier';
}

function scalarFromToken(token: Token): Scalar {
  const type: ScalarType = token.kind === 'string' ? 'string' : classifyWord(token.value);
  return { kind: 'scalar', type, value: token.value, range: token.range };
}

interface Pending {
  readonly key: Scalar;
  readonly operator: Operator;
}

interface Frame {
  readonly entries: Entry[];
  readonly braceStart: number;
  readonly owner: Pending | undefined;
  pending: Pending | undefined;
}

interface ParserState {
  readonly tokens: readonly Token[];
  readonly diagnostics: Diagnostic[];
  readonly stack: Frame[];
  readonly textLength: number;
  index: number;
}

function missingValue(pending: Pending): Diagnostic {
  return diagnostic(
    'error',
    'missing-value',
    `Expected a value for '${pending.key.value}'.`,
    pending.key.range,
  );
}

function attachClosedBlock(parent: Frame, closed: Frame, block: Block): void {
  const owner = closed.owner;
  if (owner) {
    parent.entries.push({
      kind: 'assignment',
      key: owner.key,
      operator: owner.operator,
      value: block,
      range: { start: owner.key.range.start, end: block.range.end },
    });
  } else {
    parent.entries.push(block);
  }
}

function handleClosingBrace(state: ParserState, frame: Frame, token: Token): void {
  state.index++;
  if (state.stack.length === 1) {
    state.diagnostics.push(
      diagnostic('error', 'unexpected-brace', "Unexpected '}' without a matching '{'.", token.range),
    );
    return;
  }
  if (frame.pending) {
    state.diagnostics.push(missingValue(frame.pending));
  }
  const block: Block = {
    kind: 'block',
    entries: frame.entries,
    range: { start: frame.braceStart, end: token.range.end },
  };
  state.stack.pop();
  const parent = state.stack[state.stack.length - 1];
  if (parent) {
    attachClosedBlock(parent, frame, block);
  }
}

function handleOpeningBrace(state: ParserState, frame: Frame, token: Token): void {
  state.index++;
  const owner = frame.pending;
  frame.pending = undefined;
  state.stack.push({ entries: [], braceStart: token.range.start, owner, pending: undefined });
}

function handleStrayOperator(state: ParserState, frame: Frame, token: Token): void {
  state.diagnostics.push(
    diagnostic('error', 'unexpected-token', `Unexpected '${token.value}'.`, token.range),
  );
  if (frame.pending) {
    state.diagnostics.push(missingValue(frame.pending));
    frame.pending = undefined;
  }
  state.index++;
}

function handleScalar(state: ParserState, frame: Frame, token: Token): void {
  const scalar = scalarFromToken(token);
  const pending = frame.pending;
  if (pending) {
    frame.entries.push({
      kind: 'assignment',
      key: pending.key,
      operator: pending.operator,
      value: scalar,
      range: { start: pending.key.range.start, end: scalar.range.end },
    });
    frame.pending = undefined;
    state.index++;
    return;
  }

  const next = state.tokens[state.index + 1];
  const nextOperator = next ? operatorForKind(next.kind) : undefined;
  if (next && nextOperator !== undefined) {
    frame.pending = { key: scalar, operator: nextOperator };
    state.index += 2;
    return;
  }

  frame.entries.push(scalar);
  state.index++;
}

function dispatch(state: ParserState, frame: Frame, token: Token): void {
  switch (token.kind) {
    case 'rbrace':
      handleClosingBrace(state, frame, token);
      return;
    case 'lbrace':
      handleOpeningBrace(state, frame, token);
      return;
    case 'equals':
    case 'lt':
    case 'gt':
    case 'le':
    case 'ge':
      handleStrayOperator(state, frame, token);
      return;
    case 'word':
    case 'string':
      handleScalar(state, frame, token);
      return;
  }
}

function finishOpenBlocks(state: ParserState): void {
  while (state.stack.length > 1) {
    const frame = state.stack[state.stack.length - 1];
    if (!frame) {
      return;
    }
    if (frame.pending) {
      state.diagnostics.push(missingValue(frame.pending));
    }
    state.diagnostics.push(
      diagnostic('error', 'unbalanced-brace', "Unclosed '{'.", {
        start: frame.braceStart,
        end: frame.braceStart + 1,
      }),
    );
    const block: Block = {
      kind: 'block',
      entries: frame.entries,
      range: { start: frame.braceStart, end: state.textLength },
    };
    state.stack.pop();
    const parent = state.stack[state.stack.length - 1];
    if (parent) {
      attachClosedBlock(parent, frame, block);
    }
  }
}

/**
 * Build a best-effort AST from a token stream. Never throws: on malformed input
 * it records a {@link Diagnostic}, recovers, and keeps going, so a single error
 * does not suppress diagnostics for the rest of the file.
 */
export function parse(
  tokens: readonly Token[],
  textLength: number,
  lexDiagnostics: readonly Diagnostic[] = [],
): ParseResult {
  const root: Frame = { entries: [], braceStart: 0, owner: undefined, pending: undefined };
  const state: ParserState = {
    tokens,
    diagnostics: [...lexDiagnostics],
    stack: [root],
    textLength,
    index: 0,
  };

  while (state.index < tokens.length) {
    const frame = state.stack[state.stack.length - 1];
    const token = tokens[state.index];
    if (!frame || !token) {
      break;
    }
    dispatch(state, frame, token);
  }

  finishOpenBlocks(state);
  if (root.pending) {
    state.diagnostics.push(missingValue(root.pending));
  }

  const document: Document = {
    kind: 'document',
    entries: root.entries,
    range: { start: 0, end: textLength },
  };
  return { document, diagnostics: state.diagnostics };
}
