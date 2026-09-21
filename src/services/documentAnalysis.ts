import type { Diagnostic } from '../model/diagnostic.js';
import { tokenize, type Token } from '../parser/lexer.js';
import { parse, type ParseResult } from '../parser/parser.js';

/**
 * A file read once. Hover, go-to-definition and completion each look for a
 * different thing in the same text, and every one of them needs the tokens;
 * passing this instead of the text is what stops a single hover from tokenizing
 * a document three times over.
 */
export interface AnalyzedDocument {
  readonly text: string;
  readonly tokens: readonly Token[];
  /** The AST and every syntax diagnostic; built on the first ask, since hover never needs it. */
  parse(): ParseResult;
}

export function analyze(text: string): AnalyzedDocument {
  const lex = tokenize(text);
  let parsed: ParseResult | undefined;
  return {
    text,
    tokens: lex.tokens,
    parse: (): ParseResult => (parsed ??= parse(lex.tokens, text.length, lex.diagnostics)),
  };
}

/** The lexer's own diagnostics, for a caller that wants them without the AST. */
export function lexDiagnosticsOf(text: string): readonly Diagnostic[] {
  return tokenize(text).diagnostics;
}

/**
 * The analysis of the document a request is about.
 *
 * One entry. Hover, completion and validation all follow the cursor, so they
 * ask about the same file one after another, and a second entry would buy
 * almost nothing for what it costs: the tokens of a 400 KB file weigh about
 * 7 MB, and of a 11 MB one about 80 MB. The entry is replaced as soon as the
 * document is edited, and `forget` drops it when the document closes.
 */
export class DocumentAnalysisCache {
  private held: { readonly uri: string; readonly version: number; readonly analysis: AnalyzedDocument } | undefined;

  of(uri: string, version: number, text: string): AnalyzedDocument {
    const held = this.held;
    if (held?.uri === uri && held.version === version) {
      return held.analysis;
    }
    const analysis = analyze(text);
    this.held = { uri, version, analysis };
    return analysis;
  }

  forget(uri: string): void {
    if (this.held?.uri === uri) {
      this.held = undefined;
    }
  }

  clear(): void {
    this.held = undefined;
  }
}
