import * as assert from 'node:assert';
import type { PopEntry } from '../../model/mapEditor.js';
import {
  findPopsBlock,
  parsePops,
  planPopsEdit,
  popDatesOf,
  popFilesOf,
  provinceIdsInPopsFile,
  renderPopsFile,
} from '../../services/provincePopsEdit.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { applyPatches } from '../../services/textPatch.js';
import { nth } from './support.js';

const FILE = [
  '#Afghanistan Region',
  '#Kabul',
  '1209 = {',
  '\taristocrats = {',
  '\t\tculture = pashtun',
  '\t\treligion = sunni',
  '\t\tsize = 2750',
  '\t}',
  '\tfarmers = {',
  '\t\tculture = pashtun',
  '\t\treligion = sunni',
  '\t\tsize = 100025',
  '\t\tmilitancy = 2',
  '\t}',
  '}',
  '#Ghazni',
  '1211 = {',
  '\tfarmers = {',
  '\t\tculture = pashtun',
  '\t\treligion = sunni',
  '\t\tsize = 1000',
  '\t}',
  '}',
  '',
].join('\r\n');

function popsOf(text: string, provinceId: number): PopEntry[] {
  const block = findPopsBlock(parseDocument(text).document, provinceId);
  if (block?.value.kind !== 'block') {
    throw new assert.AssertionError({ message: `expected a block for ${String(provinceId)}` });
  }
  return parsePops(block.value);
}

suite('provincePopsEdit', () => {
  test('scans block openers and parses pops of a province', () => {
    assert.deepStrictEqual(provinceIdsInPopsFile(FILE), [1209, 1211]);
    assert.deepStrictEqual(popsOf(FILE, 1209), [
      { type: 'aristocrats', culture: 'pashtun', religion: 'sunni', size: '2750', militancy: undefined, rebelType: undefined },
      { type: 'farmers', culture: 'pashtun', religion: 'sunni', size: '100025', militancy: '2', rebelType: undefined },
    ]);
  });

  test('rewrites only the province block and keeps the rest of the file', () => {
    const document = parseDocument(FILE).document;
    const pops = popsOf(FILE, 1209);
    assert.deepStrictEqual(planPopsEdit(FILE, document, 1209, pops), []);
    const edited = applyPatches(
      FILE,
      planPopsEdit(FILE, document, 1209, [{ ...nth(pops, 1), size: '90000', rebelType: 'jacobin' }]),
    );
    assert.ok(
      edited.startsWith(
        '#Afghanistan Region\r\n#Kabul\r\n1209 = {\r\n\tfarmers = {\r\n\t\tculture = pashtun\r\n\t\treligion = sunni\r\n\t\tsize = 90000\r\n\t\tmilitancy = 2\r\n\t\trebel_type = jacobin\r\n\t}\r\n}\r\n#Ghazni\r\n1211 = {',
      ),
      edited,
    );
    assert.ok(edited.endsWith('size = 1000\r\n\t}\r\n}\r\n'));
  });

  test('appends a block when the province has none', () => {
    const document = parseDocument(FILE).document;
    const slaves: PopEntry = { type: 'slaves', culture: 'hazara', religion: 'shiite', size: '10', militancy: undefined, rebelType: undefined };
    const edited = applyPatches(FILE, planPopsEdit(FILE, document, 2519, [slaves]));
    assert.ok(edited.endsWith('}\r\n2519 = {\r\n\tslaves = {\r\n\t\tculture = hazara\r\n\t\treligion = shiite\r\n\t\tsize = 10\r\n\t}\r\n}\r\n'), edited);
    assert.strictEqual(renderPopsFile(1, []), '1 = {\r\n}\r\n');
  });

  test('lists start dates in order and the files of a date', () => {
    const paths = [
      'history/pops/1861.4.14/A.txt',
      'history/pops/1836.1.1/B.txt',
      'history/pops/1836.1.1/A.txt',
      'history/pops/notes.txt',
      'history/pops/1836.1.1/sub/C.txt',
    ];
    assert.deepStrictEqual(popDatesOf(paths), ['1836.1.1', '1861.4.14']);
    assert.deepStrictEqual(popFilesOf(paths, '1836.1.1'), ['A.txt', 'B.txt']);
  });
});
