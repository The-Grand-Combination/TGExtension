import { tokenize } from '../parser/lexer.js';
import { parse, type ParseResult } from '../parser/parser.js';

/**
 * Parse a whole file, returning the AST together with all syntax diagnostics
 * (lexer + parser). This is the single seam the server uses to obtain both the
 * document to validate structurally and the syntax errors to report.
 */
export function parseDocument(text: string): ParseResult {
  const lex = tokenize(text);
  return parse(lex.tokens, text.length, lex.diagnostics);
}
