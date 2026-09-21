import type { Diagnostic, DiagnosticSeverity } from '../model/diagnostic.js';
import { classifyFile } from '../model/fileType.js';
import type { FileReport, ModReport, ReportDiagnostic } from '../model/fullReport.js';
import type { ModIndex } from '../model/modIndex.js';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationOptions } from '../model/validationOptions.js';
import { validateFileText } from './fileValidation.js';
import { NEVER_CANCELLED, type CancelSignal } from '../model/cancellation.js';
import { YieldBudget, type WorkUnits } from './scheduling.js';

/** File access for a whole-mod scan; injected so the service stays testable. */
export interface ReportFileProvider {
  readFile(relativePath: string): Promise<string | undefined>;
  /** Every file under a folder, recursively, as mod-root-relative forward-slash paths. */
  listFilesRecursive(relativeFolder: string): string[];
  fileUri(relativePath: string): string;
}

/** The folders whose files have a validator; everything else is highlighted only. */
export const REPORT_FOLDERS: readonly string[] = [
  'events',
  'decisions',
  'common',
  'poptypes',
  'technologies',
  'inventions',
  'news',
  'history',
  'map',
];

/**
 * Findings about a file the per-file scan cannot reach on its own, because they
 * depend on what sits next to the file rather than on its text — the flag audit,
 * which needs `gfx/flags` listed. The text comes with them so the offsets can be
 * turned into lines, and the uri because the file may come from a lower layer of
 * the stack than the mod being reported on.
 */
export interface ExtraFileFindings {
  readonly path: string;
  readonly uri: string;
  readonly text: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** Files read together, so their reads overlap. */
const BATCH_SIZE = 64;

/**
 * Validate every classified file of a mod and collect the findings. Files are
 * read in parallel batches and the event loop gets a turn once a batch has been
 * validated through its share of source, so a language server keeps answering
 * while a large mod is scanned — a batch that happens to hold a mod's biggest
 * files is interrupted as often as its size deserves, not once. The map bitmaps
 * are not part of this report; see `mapImageAudit.ts`.
 */
export async function buildModReport(
  root: string,
  provider: ReportFileProvider,
  index: ModIndex,
  options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS,
  extras: readonly ExtraFileFindings[] = [],
  signal: CancelSignal = NEVER_CANCELLED,
): Promise<ModReport> {
  const paths = reportFiles(provider);
  const scan = new Scan();
  const budget = new YieldBudget(undefined, signal);
  for (let start = 0; start < paths.length; start += BATCH_SIZE) {
    const batch = paths.slice(start, start + BATCH_SIZE);
    const texts = await Promise.all(batch.map((relativePath) => provider.readFile(relativePath)));
    await budget.run(scan.validateBatch(batch, texts, provider, index, options));
  }
  const { files, fileCount } = scan;
  const merged = withExtras(files, extras);
  const diagnostics = merged.flatMap((file) => file.diagnostics);
  return {
    root,
    fileCount,
    errorCount: diagnostics.filter((item) => item.severity === 'error').length,
    warningCount: diagnostics.filter((item) => item.severity === 'warning').length,
    files: errorsFirst(merged),
  };
}

/** The files scanned so far, and the work the scan reports as it goes. */
class Scan {
  readonly files: FileReport[] = [];
  /** Files that were read; one with no findings still counts as scanned. */
  fileCount = 0;

  *validateBatch(
    batch: readonly string[],
    texts: readonly (string | undefined)[],
    provider: ReportFileProvider,
    index: ModIndex,
    options: ValidationOptions,
  ): WorkUnits {
    for (const [position, relativePath] of batch.entries()) {
      const text = texts[position];
      if (text === undefined) {
        continue;
      }
      this.fileCount++;
      const report = reportFor(relativePath, text, provider, index, options);
      if (report) {
        this.files.push(report);
      }
      yield text.length;
    }
  }
}

/**
 * Fold the extra findings into the scanned files. A file the scan already
 * reported on keeps its entry and its uri, and its findings are re-sorted with
 * the new ones; a file the scan never read gets an entry of its own.
 */
function withExtras(files: readonly FileReport[], extras: readonly ExtraFileFindings[]): FileReport[] {
  if (extras.length === 0) {
    return [...files];
  }
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const extra of extras) {
    if (extra.diagnostics.length === 0) {
      continue;
    }
    const found = toReportDiagnostics(extra.text, extra.diagnostics);
    const existing = byPath.get(extra.path);
    byPath.set(extra.path, {
      path: extra.path,
      uri: existing?.uri ?? extra.uri,
      diagnostics: sortFindings([...(existing?.diagnostics ?? []), ...found]),
    });
  }
  return [...byPath.values()];
}

/** Severity order for the report: what breaks the game comes before what smells. */
const SEVERITY_RANK: Readonly<Record<DiagnosticSeverity, number>> = {
  error: 0,
  warning: 1,
  information: 2,
  hint: 3,
};

/** Files with an error lead the report; the rest keep the path order they were read in. */
function errorsFirst(files: readonly FileReport[]): FileReport[] {
  const hasError = (file: FileReport): number =>
    file.diagnostics.some((item) => item.severity === 'error') ? 0 : 1;
  return [...files].sort((a, b) => hasError(a) - hasError(b) || a.path.localeCompare(b.path));
}

function reportFor(
  relativePath: string,
  text: string,
  provider: ReportFileProvider,
  index: ModIndex,
  options: ValidationOptions,
): FileReport | undefined {
  const found = validateFileText(text, classifyFile(relativePath), index, relativePath, options);
  if (found.length === 0) {
    return undefined;
  }
  return { path: relativePath, uri: provider.fileUri(relativePath), diagnostics: toReportDiagnostics(text, found) };
}

function reportFiles(provider: ReportFileProvider): string[] {
  return REPORT_FOLDERS.flatMap((folder) => provider.listFilesRecursive(folder))
    .filter((relativePath) => classifyFile(relativePath) !== 'unknown')
    .sort((a, b) => a.localeCompare(b));
}

/** Errors first inside a file too, each severity then in source order. */
function toReportDiagnostics(text: string, diagnostics: readonly Diagnostic[]): ReportDiagnostic[] {
  const lineStarts = lineStartsOf(text);
  return sortFindings(
    diagnostics.map((item) => {
      const { line, character } = positionAt(lineStarts, item.range.start);
      return { line, character, severity: item.severity, code: item.code, message: item.message };
    }),
  );
}

function sortFindings(findings: readonly ReportDiagnostic[]): ReportDiagnostic[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.line - b.line ||
      a.character - b.character,
  );
}

function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let offset = 0; offset < text.length; offset++) {
    if (text.charCodeAt(offset) === 10) {
      starts.push(offset + 1);
    }
  }
  return starts;
}

/** 1-based line and column of a UTF-16 offset, by binary search over line starts. */
function positionAt(lineStarts: readonly number[], offset: number): { line: number; character: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { line: low + 1, character: offset - (lineStarts[low] ?? 0) + 1 };
}
