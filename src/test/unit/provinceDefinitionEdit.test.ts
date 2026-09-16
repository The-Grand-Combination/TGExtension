import * as assert from 'node:assert';
import { appendDefinitionRow, nextProvinceId, rowOfColor } from '../../services/provinceDefinitionEdit.js';
import { parseProvinceRows } from '../../services/provinceTable.js';

const TABLE = [
  ';red;green;blue;x;x',
  '1;204;229;152;Sitka;x',
  '2;204;179;153;Juneau;x',
  ';1;222;208;Lake Sakami;x',
  '',
].join('\n');

suite('provinceDefinitionEdit', () => {
  test('the next id is past the last one, and a lake row is not an id', () => {
    assert.strictEqual(nextProvinceId(parseProvinceRows(TABLE)), 3);
  });

  test('a table with holes still gets an id of its own, never one that was used', () => {
    const rows = parseProvinceRows(';red;green;blue;x;x\n7;1;1;1;Seven;x\n2;2;2;2;Two;x\n');
    assert.strictEqual(nextProvinceId(rows), 8);
  });

  test('an empty table starts at one', () => {
    assert.strictEqual(nextProvinceId([]), 1);
  });

  test('a colour already in the table is found, lake rows included', () => {
    const rows = parseProvinceRows(TABLE);
    assert.strictEqual(rowOfColor(rows, (204 << 16) | (179 << 8) | 153)?.id, 2);
    assert.strictEqual(rowOfColor(rows, (1 << 16) | (222 << 8) | 208)?.name, 'Lake Sakami');
    assert.strictEqual(rowOfColor(rows, 0), undefined);
  });

  test('the row is appended with the file separator and the trailing column', () => {
    const written = appendDefinitionRow(TABLE, { id: 3, color: (10 << 16) | (20 << 8) | 30, name: 'Nova' });
    assert.strictEqual(written, TABLE.replace('2;204;179;153;Juneau;x\n', '2;204;179;153;Juneau;x\n3;10;20;30;Nova;x\n'));
  });

  test('the row goes after the last province, not after the lakes that close the file', () => {
    const lakes = ';red;green;blue;x;x\n1;1;1;1;One;x\n;1;222;200;Unnamed Lakes;x\n;26;27;255;Dead Sea;x\n';
    const written = appendDefinitionRow(lakes, { id: 2, color: 0, name: 'Two' });
    assert.strictEqual(written, ';red;green;blue;x;x\n1;1;1;1;One;x\n2;0;0;0;Two;x\n;1;222;200;Unnamed Lakes;x\n;26;27;255;Dead Sea;x\n');
  });

  test('a table with only the header and lakes takes the row at the end', () => {
    const written = appendDefinitionRow(';red;green;blue;x;x\n;1;222;200;Unnamed Lakes;x\n', { id: 1, color: 0, name: 'One' });
    assert.strictEqual(written, ';red;green;blue;x;x\n;1;222;200;Unnamed Lakes;x\n1;0;0;0;One;x\n');
  });

  test('a file with no newline at the end gets one before the row', () => {
    const written = appendDefinitionRow('1;1;1;1;One;x', { id: 2, color: 0, name: 'Two' });
    assert.strictEqual(written, '1;1;1;1;One;x\n2;0;0;0;Two;x\n');
  });

  test('a file written with CRLF keeps CRLF', () => {
    const written = appendDefinitionRow('1;1;1;1;One;x\r\n', { id: 2, color: 0, name: 'Two' });
    assert.strictEqual(written, '1;1;1;1;One;x\r\n2;0;0;0;Two;x\r\n');
  });
});
