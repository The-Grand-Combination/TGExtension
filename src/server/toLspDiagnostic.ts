import {
  DiagnosticSeverity as LspDiagnosticSeverity,
  type Diagnostic as LspDiagnostic,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic, DiagnosticSeverity } from '../model/diagnostic.js';

const SEVERITY_MAP: Record<DiagnosticSeverity, LspDiagnosticSeverity> = {
  error: LspDiagnosticSeverity.Error,
  warning: LspDiagnosticSeverity.Warning,
  information: LspDiagnosticSeverity.Information,
  hint: LspDiagnosticSeverity.Hint,
};

/** Map domain diagnostics (offset ranges) to LSP diagnostics (line/character ranges). */
export function toLspDiagnostics(
  diagnostics: readonly Diagnostic[],
  document: TextDocument,
): LspDiagnostic[] {
  return diagnostics.map((item) => ({
    severity: SEVERITY_MAP[item.severity],
    code: item.code,
    source: 'victoria2',
    message: item.message,
    range: {
      start: document.positionAt(item.range.start),
      end: document.positionAt(item.range.end),
    },
  }));
}
