import type { ParseResult } from '../parser/parser.js';
import { analyze } from './documentAnalysis.js';

/**
 * Parse a whole file, returning the AST together with all syntax diagnostics
 * (lexer + parser). This is the single seam the server uses to obtain both the
 * document to validate structurally and the syntax errors to report.
 */
export function parseDocument(text: string): ParseResult {
  return analyze(text).parse();
}
