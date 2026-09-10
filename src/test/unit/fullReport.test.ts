import * as assert from 'node:assert';
import type { FullReportParams, ModReport } from '../../model/fullReport.js';
import { buildModReport, type ReportFileProvider } from '../../services/fullReport.js';
import type { MapReport } from '../../model/mapAudit.js';
import { renderMapReportText, renderReportText } from '../../services/reportText.js';
import { buildTestIndex } from './testIndex.js';

const files: Readonly<Record<string, string>> = {
  'events/Clean.txt':
    'country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" } }\n',
  'events/Broken.txt':
    'country_event = {\n  id = 2\n  title = "t"\n  desc = "d"\n  is_triggered_only = yes\n' +
    '  trigger = { tags = ENG }\n  option = { name = "o" }\n}\n',
  'map/definition.csv': ';r;g;b;x;x\n1;1;1;1;One;x\n2;1;1;1;Two;x\n',
  'map/provinces.bmp': 'binary',
  'units/infantry.txt': 'infantry = { type = land }\n',
};

function provider(reads: string[] = []): ReportFileProvider {
  return {
    readFile: (relativePath): Promise<string | undefined> => {
      reads.push(relativePath);
      return Promise.resolve(files[relativePath]);
    },
    listFilesRecursive: (folder) => Object.keys(files).filter((key) => key.startsWith(`${folder}/`)),
    fileUri: (relativePath) => `file:///mod/${relativePath}`,
  };
}

suite('fullReport', () => {
  let report: ModReport;
  const reads: string[] = [];

  suiteSetup(async () => {
    report = await buildModReport('/mod', provider(reads), buildTestIndex());
    const params: FullReportParams = { workspaceFolders: ['/mod'], mods: [] };
    assert.deepStrictEqual(params.mods, []);
  });

  test('scans classified files only and lists just the files with findings', () => {
    assert.strictEqual(report.fileCount, 3);
    assert.deepStrictEqual(reads, ['events/Broken.txt', 'events/Clean.txt', 'map/definition.csv']);
    assert.deepStrictEqual(
      report.files.map((file) => file.path),
      ['events/Broken.txt', 'map/definition.csv'],
    );
  });

  test('positions findings with 1-based lines and columns', () => {
    const broken = report.files.find((file) => file.path === 'events/Broken.txt');
    assert.deepStrictEqual(
      broken?.diagnostics.map((item) => [item.code, item.line, item.character]),
      [['unknown-trigger', 6, 15]],
    );
    assert.strictEqual(broken.uri, 'file:///mod/events/Broken.txt');
  });

  test('counts errors and warnings', () => {
    assert.strictEqual(report.errorCount, 2);
    assert.strictEqual(report.warningCount, 0);
    assert.strictEqual(
      report.files.find((file) => file.path === 'map/definition.csv')?.diagnostics[0]?.code,
      'duplicate-color',
    );
  });

  test('includes the identifiers the index found defined twice', async () => {
    const index = buildTestIndex({ 'common/buildings.txt': 'fort = { }\nfort = { }\n' });
    const duplicated: Readonly<Record<string, string>> = { 'common/buildings.txt': 'fort = { }\nfort = { }\n' };
    const withDuplicate = await buildModReport(
      '/mod',
      {
        readFile: (relativePath) => Promise.resolve(duplicated[relativePath]),
        listFilesRecursive: (folder) => Object.keys(duplicated).filter((key) => key.startsWith(`${folder}/`)),
        fileUri: (relativePath) => `file:///mod/${relativePath}`,
      },
      index,
    );
    assert.deepStrictEqual(
      withDuplicate.files[0]?.diagnostics.map((item) => item.code),
      ['duplicate-identifier', 'duplicate-identifier'],
    );
  });

  test('renders the map report per mod, with pixel positions', () => {
    const mapReports: MapReport[] = [
      {
        root: '/base',
        audited: true,
        errorCount: 1,
        warningCount: 1,
        findings: [
          { file: 'map/provinces.bmp', severity: 'error', code: 'unknown-color', message: 'Color 1,2,3 covers 4 pixels.' },
          { file: 'map/rivers.bmp', severity: 'warning', code: 'river-thick', message: 'River is 2 pixels wide here.', pixel: { x: 12, y: 7 } },
        ],
      },
      { root: '/submod', audited: false, errorCount: 0, warningCount: 0, findings: [] },
    ];
    const lines = renderMapReportText(mapReports, 'now').split('\n');
    assert.strictEqual(lines[0], 'Victorian Tools - Map report');
    assert.ok(lines.includes('1 error, 1 warning in the map bitmaps'));
    assert.ok(lines.some((line) => /^ {2}map\/provinces\.bmp {2,}error {3}unknown-color: Color 1,2,3/.test(line)), lines.join('\n'));
    assert.ok(lines.some((line) => /^ {2}map\/rivers\.bmp \(12, 7\) {2,}warning river-thick:/.test(line)), lines.join('\n'));
    assert.ok(lines.indexOf('/submod') > lines.indexOf('/base'));
    assert.ok(lines.includes('No map file of its own; the map is the one of the mods it is read over.'));
    assert.ok(renderMapReportText([], 'now').includes('No Victoria 2 mod was found'));
  });

  test('renders plain text grouped by file', () => {
    const text = renderReportText([report], '2026-09-07 12:00:00');
    const lines = text.split('\n');
    assert.strictEqual(lines[0], 'Victorian Tools - Full report');
    assert.strictEqual(lines[1], 'Generated 2026-09-07 12:00:00');
    assert.ok(lines.includes('/mod'));
    assert.ok(lines.includes('2 errors, 0 warnings in 2 of 3 files'));
    assert.ok(lines.includes('events/Broken.txt'));
    assert.ok(
      lines.some((line) => /^ {2}6:15 {5}error {3}unknown-trigger: Unknown trigger 'tags'/.test(line)),
      text,
    );
    assert.ok(!text.includes('file:///'), 'plain text carries no links');
  });

  test('lists every finding, repeated ones included', () => {
    const repeated = {
      root: '/mod',
      fileCount: 1,
      errorCount: 3,
      warningCount: 2,
      files: [
        {
          path: 'events/Loop.txt',
          uri: 'file:///mod/events/Loop.txt',
          diagnostics: [
            { line: 10, character: 6, severity: 'error' as const, code: 'unknown-country', message: "Unknown country tag 'QQQ'." },
            { line: 12, character: 6, severity: 'warning' as const, code: 'missing-localisation', message: "Localisation key 'a' was not found in localisation/." },
            { line: 19, character: 6, severity: 'error' as const, code: 'unknown-country', message: "Unknown country tag 'QQQ'." },
            { line: 28, character: 6, severity: 'error' as const, code: 'unknown-country', message: "Unknown country tag 'QQQ'." },
            { line: 30, character: 6, severity: 'warning' as const, code: 'missing-localisation', message: "Localisation key 'b' was not found in localisation/." },
          ],
        },
      ],
    };
    const lines = renderReportText([repeated], 'now').split('\n');
    const findings = lines.filter((line) => line.startsWith('  '));
    assert.deepStrictEqual(findings, [
      "  10:6     error   unknown-country: Unknown country tag 'QQQ'.",
      "  12:6     warning missing-localisation: Localisation key 'a' was not found in localisation/.",
      "  19:6     error   unknown-country: Unknown country tag 'QQQ'.",
      "  28:6     error   unknown-country: Unknown country tag 'QQQ'.",
      "  30:6     warning missing-localisation: Localisation key 'b' was not found in localisation/.",
    ]);
    assert.ok(lines.includes('3 errors, 2 warnings in 1 of 1 file'));
  });

  test('renders an explanation when no mod was found', () => {
    assert.ok(renderReportText([], 'now').includes('No Victoria 2 mod was found'));
  });
});
