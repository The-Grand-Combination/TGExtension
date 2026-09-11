import * as assert from 'node:assert';
import {
  applyPatches,
  deleteLinePatch,
  indentAt,
  indentUnitOf,
  lineEndingOf,
} from '../../services/textPatch.js';

suite('textPatch', () => {
  test('applies patches in offset order whatever order they arrive in', () => {
    const text = 'abcdef';
    const patched = applyPatches(text, [
      { start: 4, end: 5, text: 'E' },
      { start: 0, end: 1, text: 'A' },
      { start: 2, end: 2, text: '-' },
    ]);
    assert.strictEqual(patched, 'Ab-cdEf');
  });

  test('rejects overlapping patches', () => {
    assert.throws(() => applyPatches('abcdef', [{ start: 0, end: 3, text: '' }, { start: 2, end: 4, text: '' }]));
  });

  test('detects CRLF and the indent unit', () => {
    assert.strictEqual(lineEndingOf('a\r\nb\r\n'), '\r\n');
    assert.strictEqual(lineEndingOf('a\nb\n'), '\n');
    assert.strictEqual(indentUnitOf('x = {\n\ty = 1\n}\n'), '\t');
    assert.strictEqual(indentUnitOf('x = {\n    y = 1\n}\n'), '    ');
    assert.strictEqual(indentUnitOf('x = 1\n'), '\t');
    assert.strictEqual(indentAt('a\n  b = 1\n', 4), '  ');
  });

  test('deletes a whole line when the entry is alone on it, else only the entry', () => {
    const alone = 'owner = USA\r\n\tadd_core = USA\r\nlife = 1\r\n';
    const start = alone.indexOf('add_core');
    const end = start + 'add_core = USA'.length;
    assert.strictEqual(applyPatches(alone, [deleteLinePatch(alone, start, end)]), 'owner = USA\r\nlife = 1\r\n');
    const shared = 'add_core = USA # keep me\n';
    assert.strictEqual(applyPatches(shared, [deleteLinePatch(shared, 0, 'add_core = USA'.length)]), ' # keep me\n');
  });
});
