import { tokenize } from '../parser/lexer.js';
import type { Range } from '../model/range.js';
import type { LocKeyDefinition, ModIndex } from '../model/modIndex.js';

export interface ResolvedLocKey {
  readonly definition: LocKeyDefinition;
  /** Source range of the token under the cursor. */
  readonly tokenRange: Range;
}

/**
 * Resolve the localisation key under the cursor, if any: word/string tokens
 * whose value is a known loc key map to their CSV definition site.
 */
export function resolveLocKeyAt(
  text: string,
  offset: number,
  index: ModIndex,
): ResolvedLocKey | undefined {
  const { tokens } = tokenize(text);
  const token = tokens.find(
    (candidate) =>
      (candidate.kind === 'word' || candidate.kind === 'string') &&
      candidate.range.start <= offset &&
      offset <= candidate.range.end,
  );
  if (!token) {
    return undefined;
  }
  const definition = index.locKeyDefinitions.get(token.value.toLowerCase());
  return definition ? { definition, tokenRange: token.range } : undefined;
}

export function locKeyHoverMarkdown(resolved: ResolvedLocKey): string {
  const { definition } = resolved;
  const text = definition.text === '' ? '_(empty text)_' : definition.text;
  return `${text}\n\n---\n\n_${definition.filePath}:${String(definition.line + 1)}_`;
}
