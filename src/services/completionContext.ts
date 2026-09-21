import type { Range } from '../model/range.js';
import type { Token, TokenKind } from '../parser/lexer.js';
import type { AnalyzedDocument } from './documentAnalysis.js';

export type CursorPosition = 'key' | 'value';

export interface CompletionContext {
  readonly position: CursorPosition;
  /**
   * Enclosing block keys, outermost first. In value position the assigned key
   * is the last element. A block opened without a key contributes an empty name.
   */
  readonly path: readonly string[];
  readonly prefix: string;
  /** The word the completion replaces. */
  readonly range: Range;
}

const OPERATOR_KINDS: ReadonlySet<TokenKind> = new Set(['equals', 'lt', 'gt', 'le', 'ge']);

interface Level {
  readonly owner: string;
  pendingKey: string | undefined;
  /** The last bare word, which an operator would turn into a key. */
  lastWord: string | undefined;
}

/**
 * Resolve what the cursor is completing, from the token stream alone. A file
 * being typed is rarely well-formed — a brace is open, a value is missing — and
 * the lexer walks that without complaint where the parser would have to recover.
 */
export function completionContextAt(
  document: AnalyzedDocument,
  offset: number,
): CompletionContext | undefined {
  if (inLineComment(document.text, offset)) {
    return undefined;
  }
  const { tokens } = document;
  if (tokens.some((token) => token.kind === 'string' && covers(token, offset))) {
    return undefined;
  }
  const cursorIndex = tokens.findIndex((token) => token.kind === 'word' && covers(token, offset));
  const levels = foldLevels(tokens, cursorIndex < 0 ? firstIndexFrom(tokens, offset) : cursorIndex);
  const current = levels[levels.length - 1];
  if (!current) {
    return undefined;
  }
  const cursorToken = cursorIndex < 0 ? undefined : tokens[cursorIndex];
  const path = levels.slice(1).map((level) => level.owner);
  if (current.pendingKey !== undefined) {
    path.push(current.pendingKey);
  }
  return {
    position: current.pendingKey === undefined ? 'key' : 'value',
    path,
    prefix: cursorToken ? cursorToken.value.slice(0, offset - cursorToken.range.start) : '',
    range: cursorToken ? cursorToken.range : { start: offset, end: offset },
  };
}

function covers(token: Token, offset: number): boolean {
  return token.range.start < offset && offset <= token.range.end;
}

function firstIndexFrom(tokens: readonly Token[], offset: number): number {
  const index = tokens.findIndex((token) => token.range.start >= offset);
  return index < 0 ? tokens.length : index;
}

function foldLevels(tokens: readonly Token[], stopAt: number): Level[] {
  const levels: Level[] = [{ owner: '', pendingKey: undefined, lastWord: undefined }];
  for (let index = 0; index < stopAt; index++) {
    const token = tokens[index];
    const level = levels[levels.length - 1];
    if (token && level) {
      apply(levels, level, token);
    }
  }
  return levels;
}

function apply(levels: Level[], level: Level, token: Token): void {
  if (token.kind === 'lbrace') {
    levels.push({ owner: level.pendingKey ?? '', pendingKey: undefined, lastWord: undefined });
    level.pendingKey = undefined;
    return;
  }
  if (token.kind === 'rbrace') {
    if (levels.length > 1) {
      levels.pop();
    }
    return;
  }
  if (OPERATOR_KINDS.has(token.kind)) {
    level.pendingKey = level.lastWord;
    level.lastWord = undefined;
    return;
  }
  level.pendingKey = undefined;
  level.lastWord = token.kind === 'word' ? token.value : undefined;
}

function inLineComment(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const hash = text.indexOf('#', lineStart);
  return hash >= 0 && hash < offset;
}
