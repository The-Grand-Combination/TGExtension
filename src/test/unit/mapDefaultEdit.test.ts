import * as assert from 'node:assert';
import { planDefaultMapEdit } from '../../services/mapDefaultEdit.js';
import { applyPatches } from '../../services/textPatch.js';
import { parseDocument } from '../../services/syntaxValidation.js';

const DEFAULT_MAP = [
  'max_provinces = 10',
  'sea_starts = {',
  '\t7 8 9',
  '}',
  '',
  'definitions = "definition.csv"',
  '',
].join('\n');

function edit(text: string, provinceId: number, isSea: boolean): string {
  return applyPatches(text, planDefaultMapEdit(parseDocument(text).document, { provinceId, isSea }));
}

suite('mapDefaultEdit', () => {
  test('max_provinces makes room for the new id: it is a count, not the last id', () => {
    assert.ok(edit(DEFAULT_MAP, 10, false).startsWith('max_provinces = 11\n'));
  });

  test('a file that already has room is left exactly as it was', () => {
    assert.strictEqual(edit(DEFAULT_MAP, 5, false), DEFAULT_MAP);
    assert.deepStrictEqual(planDefaultMapEdit(parseDocument(DEFAULT_MAP).document, { provinceId: 5, isSea: false }), []);
  });

  test('a sea province joins sea_starts after the last id in it', () => {
    assert.strictEqual(edit(DEFAULT_MAP, 5, true), DEFAULT_MAP.replace('7 8 9', '7 8 9 5'));
  });

  test('an id already in sea_starts is not written twice', () => {
    assert.strictEqual(edit(DEFAULT_MAP, 8, true), DEFAULT_MAP);
  });

  test('both changes travel together, and nothing else moves', () => {
    const written = edit(DEFAULT_MAP, 10, true);
    assert.strictEqual(written, DEFAULT_MAP.replace('= 10', '= 11').replace('7 8 9', '7 8 9 10'));
  });

  test('a file without the keys is not invented', () => {
    assert.deepStrictEqual(planDefaultMapEdit(parseDocument('#nothing\n').document, { provinceId: 3, isSea: true }), []);
  });
});
