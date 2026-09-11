import * as assert from 'node:assert';
import {
  appendProvinceLoc,
  countProvinceKeys,
  historyFileNameFor,
  locKeyLine,
  newProvinceLocFile,
  patchProvinceLoc,
  pickLocFileForNewKey,
  readProvinceLoc,
} from '../../services/provinceLocEdit.js';
import { applyPatches } from '../../services/textPatch.js';
import { buildTestIndex } from './testIndex.js';

const HEADER = 'CODE;ENGLISH;FRENCH;GERMAN;POLISH;SPANISH;ITALIAN;SWEDISH;CZECH;HUNGARIAN;DUTCH;PORTUGUESE;RUSSIAN;FINNISH;x';
const CSV = `${HEADER}\r\nPROV1;Novo-Arkhangelsk;;;;;;;;;;;;;x\r\nPROV2;Redut;Redoute;;;;;;;;;;;;x\r\n`;

suite('provinceLocEdit', () => {
  test('replaces only the ENGLISH column and keeps the other columns and CRLF', () => {
    const patch = patchProvinceLoc(CSV, 2, 'Fort Dionysius');
    assert.ok(patch);
    assert.strictEqual(
      applyPatches(CSV, [patch]),
      `${HEADER}\r\nPROV1;Novo-Arkhangelsk;;;;;;;;;;;;;x\r\nPROV2;Fort Dionysius;Redoute;;;;;;;;;;;;x\r\n`,
    );
  });

  test('strips separators and line breaks from the new text', () => {
    const patch = patchProvinceLoc(CSV, 1, 'A;B\nC');
    assert.ok(patch);
    assert.ok(applyPatches(CSV, [patch]).includes('PROV1;A B C;;;'));
  });

  test('returns nothing for a line that does not exist', () => {
    assert.strictEqual(patchProvinceLoc(CSV, 9, 'x'), undefined);
  });

  test('appends a row with as many columns as the header', () => {
    const appended = applyPatches(CSV, [appendProvinceLoc(CSV, 'PROV3', 'Ketchikan')]);
    assert.ok(appended.endsWith('PROV3;Ketchikan;;;;;;;;;;;;;x\r\n'));
    assert.strictEqual(appended.split('\r\n')[3]?.split(';').length, HEADER.split(';').length);
  });

  test('appends after a missing final line ending and with a minimal row when there is no header', () => {
    const noEol = 'CODE;ENGLISH;x\nPROV1;One;x';
    assert.strictEqual(applyPatches(noEol, [appendProvinceLoc(noEol, 'PROV2', 'Two')]), 'CODE;ENGLISH;x\nPROV1;One;x\nPROV2;Two;x\n');
    assert.strictEqual(appendProvinceLoc('', 'PROV2', 'Two').text, 'PROV2;Two;x\n');
  });

  test('a new file has the standard header and one row', () => {
    assert.strictEqual(newProvinceLocFile('PROV7', 'Kenai'), `${HEADER}\r\nPROV7;Kenai;;;;;;;;;;;;;x\r\n`);
  });

  test('finds the line of a key case-insensitively and counts province keys', () => {
    assert.strictEqual(locKeyLine(CSV, 'prov2'), 2);
    assert.strictEqual(locKeyLine(CSV, 'PROV9'), undefined);
    assert.strictEqual(countProvinceKeys(CSV), 2);
  });

  test('picks the file with the most province keys, else the default', () => {
    assert.strictEqual(
      pickLocFileForNewKey([
        { name: 'text.csv', provinceKeyCount: 3 },
        { name: '00_map.csv', provinceKeyCount: 3000 },
      ]),
      '00_map.csv',
    );
    assert.strictEqual(pickLocFileForNewKey([{ name: 'events.csv', provinceKeyCount: 0 }]), '00_map-provinces.csv');
  });

  test('reads the key through the index', () => {
    const index = buildTestIndex({ 'localisation/00_map.csv': 'CODE;ENGLISH;x\nPROV619;Milano;;x\n' });
    assert.deepStrictEqual(readProvinceLoc(index, 619), {
      key: 'PROV619',
      text: 'Milano',
      filePath: 'localisation/00_map.csv',
      line: 1,
    });
    assert.strictEqual(readProvinceLoc(index, 5).filePath, undefined);
  });

  test('builds a history file name without forbidden characters', () => {
    assert.strictEqual(historyFileNameFor(213, 'Fredericksburg'), '213 - Fredericksburg.txt');
    assert.strictEqual(historyFileNameFor(1, 'St. John\'s / "Harbour"?'), "1 - St. John's Harbour.txt");
    assert.strictEqual(historyFileNameFor(2, '   '), '2 - Province.txt');
  });
});
