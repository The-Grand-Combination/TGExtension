import type { Range } from './range.js';

export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

/** A validation finding, independent of any editor API. */
export interface Diagnostic {
  readonly range: Range;
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
}

export function diagnostic(
  severity: DiagnosticSeverity,
  code: string,
  message: string,
  range: Range,
): Diagnostic {
  return { severity, code, message, range };
}
