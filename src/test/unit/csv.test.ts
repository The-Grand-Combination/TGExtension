import * as assert from 'node:assert';
import { csvRows } from '../../parser/csv.js';

suite('csv parser', () => {
  test('splits rows into trimmed fields with document offsets', () => {
    const text = 'id;r;g\n 12 ;3;4\n';
    const [row] = csvRows(text, { skipHeader: true });
    assert.ok(row);
    assert.strictEqual(row.line, 1);
    assert.deepStrictEqual(
      row.fields.map((field) => [field.text, field.range.start, field.range.end]),
      [['12', 8, 10], ['3', 12, 13], ['4', 14, 15]],
    );
    assert.deepStrictEqual(row.range, { start: 7, end: 15 });
  });

  test('drops blank lines and # comments but keeps line numbers', () => {
    const rows = csvRows('a;1\n\n# note\nb;2\n');
    assert.deepStrictEqual(rows.map((row) => [row.line, row.fields[0]?.text]), [[0, 'a'], [3, 'b']]);
  });

  test('keeps the header unless asked to skip it', () => {
    assert.strictEqual(csvRows('CODE;ENGLISH\nk;v\n').length, 2);
    assert.strictEqual(csvRows('CODE;ENGLISH\nk;v\n', { skipHeader: true }).length, 1);
  });

  test('a trailing carriage return is not part of the last field', () => {
    const [row] = csvRows('a;b\r\nc;d\r\n');
    assert.deepStrictEqual(row?.fields.map((field) => field.text), ['a', 'b']);
    assert.strictEqual(csvRows('a;b\r\nc;d\r\n')[1]?.fields[0]?.range.start, 5);
  });

  test('maxFields stops splitting early', () => {
    const [row] = csvRows('key;text;extra;more', { maxFields: 2 });
    assert.deepStrictEqual(row?.fields.map((field) => field.text), ['key', 'text']);
  });

  test('empty fields keep their positions', () => {
    const [row] = csvRows(';r;;b');
    assert.deepStrictEqual(row?.fields.map((field) => field.text), ['', 'r', '', 'b']);
    assert.strictEqual(row.fields[2]?.range.start, 3);
  });
});
