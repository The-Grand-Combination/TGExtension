import type { Diagnostic } from '../model/diagnostic.js';
import { classifyFile } from '../model/fileType.js';
import type { FileReport, ModReport, ReportDiagnostic } from '../model/fullReport.js';
import type { ModIndex } from '../model/modIndex.js';
import { validateFileText } from './fileValidation.js';
import { yieldToEventLoop } from './scheduling.js';

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

/** Files read together; also how often the scan yields to other requests. */
const BATCH_SIZE = 64;

/**
 * Validate every classified file of a mod and collect the findings. Files are
 * read in parallel batches and the event loop gets a turn between batches, so
 * a language server keeps answering while a large mod is scanned. The map
 * bitmaps are not part of this report; see `mapImageAudit.ts`.
 */
export async function buildModReport(root: string, provider: ReportFileProvider, index: ModIndex): Promise<ModReport> {
  const paths = reportFiles(provider);
  const files: FileReport[] = [];
  let fileCount = 0;
  for (let start = 0; start < paths.length; start += BATCH_SIZE) {
    const batch = paths.slice(start, start + BATCH_SIZE);
    const texts = await Promise.all(batch.map((relativePath) => provider.readFile(relativePath)));
    batch.forEach((relativePath, position) => {
      const text = texts[position];
      if (text === undefined) {
        return;
      }
      fileCount++;
      const report = reportFor(relativePath, text, provider, index);
      if (report) {
        files.push(report);
      }
    });
    await yieldToEventLoop();
  }
  const diagnostics = files.flatMap((file) => file.diagnostics);
  return {
    root,
    fileCount,
    errorCount: diagnostics.filter((item) => item.severity === 'error').length,
    warningCount: diagnostics.filter((item) => item.severity === 'warning').length,
    files,
  };
}

function reportFor(
  relativePath: string,
  text: string,
  provider: ReportFileProvider,
  index: ModIndex,
): FileReport | undefined {
  const found = validateFileText(text, classifyFile(relativePath), index, relativePath);
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

function toReportDiagnostics(text: string, diagnostics: readonly Diagnostic[]): ReportDiagnostic[] {
  const lineStarts = lineStartsOf(text);
  return diagnostics
    .map((item) => {
      const { line, character } = positionAt(lineStarts, item.range.start);
      return { line, character, severity: item.severity, code: item.code, message: item.message };
    })
    .sort((a, b) => a.line - b.line || a.character - b.character);
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
