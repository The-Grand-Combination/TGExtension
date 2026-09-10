import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import type { Range } from '../model/range.js';

export type TokenKind =
  | 'word'
  | 'string'
  | 'equals'
  | 'lt'
  | 'gt'
  | 'le'
  | 'ge'
  | 'lbrace'
  | 'rbrace';

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly range: Range;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenKind>> = {
  '{': 'lbrace',
  '}': 'rbrace',
  '=': 'equals',
};

function isSpace(character: string): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\r' ||
    character === '\n' ||
    character === '\f' ||
    character === '\v'
  );
}

function isBareword(character: string): boolean {
  return (
    character !== '' &&
    !isSpace(character) &&
    !(character in SINGLE_CHAR_TOKENS) &&
    character !== '#' &&
    character !== '"' &&
    character !== '<' &&
    character !== '>'
  );
}

function skipLineComment(text: string, start: number): number {
  let position = start;
  while (position < text.length && text.charAt(position) !== '\n') {
    position++;
  }
  return position;
}

interface Scanned {
  readonly token: Token;
  readonly next: number;
  readonly error?: Diagnostic;
}

function scanRelational(text: string, start: number): Scanned {
  const pair = text.charAt(start) + text.charAt(start + 1);
  if (pair === '<=' || pair === '>=') {
    const kind: TokenKind = pair === '<=' ? 'le' : 'ge';
    return { token: { kind, value: pair, range: { start, end: start + 2 } }, next: start + 2 };
  }
  const character = text.charAt(start);
  const kind: TokenKind = character === '<' ? 'lt' : 'gt';
  return { token: { kind, value: character, range: { start, end: start + 1 } }, next: start + 1 };
}

function scanString(text: string, start: number): Scanned {
  const length = text.length;
  let position = start + 1;
  let value = '';
  let terminated = false;
  while (position < length) {
    const character = text.charAt(position);
    if (character === '\\' && position + 1 < length) {
      value += text.charAt(position + 1);
      position += 2;
      continue;
    }
    if (character === '"') {
      position++;
      terminated = true;
      break;
    }
    if (character === '\n') {
      break;
    }
    value += character;
    position++;
  }
  const range: Range = { start, end: position };
  const token: Token = { kind: 'string', value, range };
  if (terminated) {
    return { token, next: position };
  }
  return {
    token,
    next: position,
    error: diagnostic('error', 'unterminated-string', 'String literal is not terminated.', range),
  };
}

function scanBareword(text: string, start: number): Scanned {
  let position = start + 1;
  while (position < text.length && isBareword(text.charAt(position))) {
    position++;
  }
  return {
    token: { kind: 'word', value: text.slice(start, position), range: { start, end: position } },
    next: position,
  };
}

/** Turn Paradox script text into a flat token stream, skipping whitespace and comments. */
export function tokenize(text: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  const length = text.length;
  let position = 0;

  while (position < length) {
    const character = text.charAt(position);

    if (isSpace(character)) {
      position++;
      continue;
    }
    if (character === '#') {
      position = skipLineComment(text, position);
      continue;
    }

    const singleKind = SINGLE_CHAR_TOKENS[character];
    if (singleKind !== undefined) {
      tokens.push({ kind: singleKind, value: character, range: { start: position, end: position + 1 } });
      position++;
      continue;
    }

    let scanned: Scanned;
    if (character === '<' || character === '>') {
      scanned = scanRelational(text, position);
    } else if (character === '"') {
      scanned = scanString(text, position);
    } else {
      scanned = scanBareword(text, position);
    }
    tokens.push(scanned.token);
    if (scanned.error) {
      diagnostics.push(scanned.error);
    }
    position = scanned.next;
  }

  return { tokens, diagnostics };
}
