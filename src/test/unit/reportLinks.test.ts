import * as assert from 'node:assert';
import type { MapReport } from '../../model/mapAudit.js';
import type { ModReport } from '../../model/fullReport.js';
import { reportLinks } from '../../services/reportLinks.js';
import { renderMapReportText, renderReportText } from '../../services/reportText.js';

const brokenFile = {
  path: 'events/Broken.txt',
  uri: 'file:///mod/events/Broken.txt',
  diagnostics: [
    { line: 6, character: 15, severity: 'error' as const, code: 'unknown-trigger', message: "Unknown trigger 'tags'." },
    { line: 9, character: 4, severity: 'warning' as const, code: 'missing-localisation', message: "Key 'a' not found." },
  ],
};

function fullReportText(...reports: ModReport[]): string {
  return renderReportText(reports, 'now');
}

suite('reportLinks — the full report', () => {
  const text = fullReportText({
    root: 'D:\\mod\\TGC',
    fileCount: 3,
    errorCount: 1,
    warningCount: 1,
    files: [brokenFile],
  });

  test('links each finding to its file, line and column', () => {
    const targets = reportLinks(text).map((link) => link.target);
    assert.deepStrictEqual(targets, [
      { kind: 'file', root: 'D:\\mod\\TGC', relativePath: 'events/Broken.txt', line: 1, character: 1 },
      { kind: 'file', root: 'D:\\mod\\TGC', relativePath: 'events/Broken.txt', line: 6, character: 15 },
      { kind: 'file', root: 'D:\\mod\\TGC', relativePath: 'events/Broken.txt', line: 9, character: 4 },
    ]);
  });

  test('a finding link covers the locator, stopping before the message', () => {
    const lines = text.split('\n');
    const link = reportLinks(text)[1];
    assert.ok(link);
    const covered = lines[link.span.line]?.slice(link.span.start, link.span.end);
    assert.strictEqual(covered, '6:15     error   unknown-trigger');
  });

  test('the file path line links to the top of that file', () => {
    const lines = text.split('\n');
    const link = reportLinks(text)[0];
    assert.ok(link);
    assert.strictEqual(lines[link.span.line]?.slice(link.span.start, link.span.end), 'events/Broken.txt');
  });

  test('each finding keeps the root of its own mod', () => {
    const twoMods = fullReportText(
      { root: '/base', fileCount: 1, errorCount: 1, warningCount: 0, files: [brokenFile] },
      {
        root: '/submod',
        fileCount: 1,
        errorCount: 1,
        warningCount: 0,
        files: [{ ...brokenFile, path: 'events/Other.txt' }],
      },
    );
    const roots = reportLinks(twoMods).map((link) => link.target.root);
    assert.deepStrictEqual(roots, ['/base', '/base', '/base', '/submod', '/submod', '/submod']);
  });

  test('ignores text that is not one of our reports', () => {
    assert.deepStrictEqual(reportLinks('events/Broken.txt\n  6:15     error   unknown-trigger: nope.\n'), []);
    assert.deepStrictEqual(reportLinks(''), []);
  });

  test('a report with no mod has nothing to link', () => {
    assert.deepStrictEqual(reportLinks(fullReportText()), []);
  });
});

suite('reportLinks — the map report', () => {
  const report: MapReport = {
    root: 'D:\\mod\\TGC',
    audited: true,
    errorCount: 1,
    warningCount: 1,
    findings: [
      { file: 'map/provinces.bmp', severity: 'error', code: 'unknown-color', message: 'Color 1,2,3 covers 4 pixels.' },
      {
        file: 'map/rivers.bmp',
        severity: 'warning',
        code: 'river-thick',
        message: 'River is 2 pixels wide here.',
        pixel: { x: 12, y: 7 },
      },
    ],
  };
  const text = renderMapReportText([report], 'now');

  test('links a finding that has a pixel, and only that one', () => {
    assert.deepStrictEqual(
      reportLinks(text).map((link) => link.target),
      [{ kind: 'mapPixel', root: 'D:\\mod\\TGC', file: 'map/rivers.bmp', x: 12, y: 7 }],
    );
  });

  test('the link covers the locator of the finding', () => {
    const link = reportLinks(text)[0];
    assert.ok(link);
    const line = text.split('\n')[link.span.line];
    assert.strictEqual(line?.slice(link.span.start, link.span.end), 'map/rivers.bmp (12, 7)           warning river-thick');
  });

  test('a mod with no map of its own contributes nothing', () => {
    const notAudited: MapReport = { root: '/submod', audited: false, errorCount: 0, warningCount: 0, findings: [] };
    assert.deepStrictEqual(reportLinks(renderMapReportText([notAudited], 'now')), []);
  });
});
