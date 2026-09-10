import type { FileReport, ModReport, ReportDiagnostic } from '../model/fullReport.js';
import type { MapFinding, MapReport } from '../model/mapAudit.js';

/** Render the full report as plain text, grouped by file, one line per finding. */
export function renderReportText(reports: readonly ModReport[], generatedAt: string): string {
  const lines = ['Victorian Tools - Full report', `Generated ${generatedAt}`, ''];
  if (reports.length === 0) {
    lines.push('No Victoria 2 mod was found in the workspace (a folder containing common/).', '');
  }
  for (const report of reports) {
    lines.push(...renderModReport(report));
  }
  return lines.join('\n');
}

function renderModReport(report: ModReport): string[] {
  const lines = [
    report.root,
    `${plural(report.errorCount, 'error')}, ${plural(report.warningCount, 'warning')} in ${String(report.files.length)} of ${plural(report.fileCount, 'file')}`,
    '',
  ];
  for (const file of report.files) {
    lines.push(...renderFileReport(file));
  }
  return lines;
}

/**
 * Render the map report as plain text: per mod, one line per finding about
 * provinces.bmp, terrain.bmp and rivers.bmp, with pixel positions as image
 * editors show them.
 */
export function renderMapReportText(reports: readonly MapReport[], generatedAt: string): string {
  const lines = [
    'Victorian Tools - Map report',
    `Generated ${generatedAt}`,
    'Pixel positions are x, y from the top-left corner of the image.',
    '',
  ];
  if (reports.length === 0) {
    lines.push('No Victoria 2 mod was found in the workspace (a folder containing common/).', '');
  }
  for (const report of reports) {
    lines.push(...renderMapReport(report));
  }
  return lines.join('\n');
}

function renderMapReport(report: MapReport): string[] {
  if (!report.audited) {
    return [report.root, 'No map file of its own; the map is the one of the mods it is read over.', ''];
  }
  return [
    report.root,
    `${plural(report.errorCount, 'error')}, ${plural(report.warningCount, 'warning')} in the map bitmaps`,
    ...report.findings.map(renderMapFinding),
    '',
  ];
}

function renderMapFinding(item: MapFinding): string {
  const where = item.pixel ? `${item.file} (${String(item.pixel.x)}, ${String(item.pixel.y)})` : item.file;
  return `  ${where.padEnd(32)} ${item.severity.padEnd(7)} ${item.code}: ${item.message}`;
}

function renderFileReport(file: FileReport): string[] {
  return [file.path, ...file.diagnostics.map(renderFinding), ''];
}

function renderFinding(item: ReportDiagnostic): string {
  const position = `${String(item.line)}:${String(item.character)}`;
  return `  ${position.padEnd(8)} ${item.severity.padEnd(7)} ${item.code}: ${item.message}`;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
