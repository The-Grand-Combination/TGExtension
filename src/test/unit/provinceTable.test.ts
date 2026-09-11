import * as assert from 'node:assert';
import { parseProvinceDefinitions, parseProvinceRows } from '../../services/provinceTable.js';

const CSV = ';red;green;blue;x;x\n1;204;229;152;Sitka;x\n;0;0;255;Lake;x\n2;204;179;153;Juneau;x\nbad;1;2;3;Bad;x\n3;300;0;0;Bad color;x\n';

suite('provinceTable', () => {
  test('keeps id rows and lake rows, drops rows with a bad id or color', () => {
    const rows = parseProvinceRows(CSV);
    assert.deepStrictEqual(
      rows.map((row) => [row.id, row.color, row.name]),
      [
        [1, (204 << 16) | (229 << 8) | 152, 'Sitka'],
        [undefined, 255, 'Lake'],
        [2, (204 << 16) | (179 << 8) | 153, 'Juneau'],
      ],
    );
  });

  test('definitions leave lake rows out', () => {
    assert.deepStrictEqual(parseProvinceDefinitions(CSV).map((definition) => definition.id), [1, 2]);
  });
});
