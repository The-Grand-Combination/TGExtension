import type { DiagnosticSeverity } from './diagnostic.js';

/** Custom LSP request: validate every file of every mod in the workspace. */
export const FULL_REPORT_REQUEST = 'victorianTools/fullReport';

export interface FullReportParams {
  readonly workspaceFolders: readonly string[];
  /** `name`s of the mods to report on, each over the game files and its dependencies; empty for the default. */
  readonly mods: readonly string[];
}

/** One finding, positioned for humans (1-based line and column). */
export interface ReportDiagnostic {
  readonly line: number;
  readonly character: number;
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
}

export interface FileReport {
  /** Mod-root-relative path with forward slashes. */
  readonly path: string;
  readonly uri: string;
  readonly diagnostics: readonly ReportDiagnostic[];
}

/** Every finding in one mod; only files with findings are listed. */
export interface ModReport {
  readonly root: string;
  readonly fileCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly files: readonly FileReport[];
}

export interface FullReportResult {
  readonly generatedAt: string;
  readonly reports: readonly ModReport[];
  readonly text: string;
}
