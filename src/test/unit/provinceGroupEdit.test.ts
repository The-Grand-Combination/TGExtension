import * as assert from 'node:assert';
import { firstGroupByProvince, groupNames, groupsOfProvince, isProvinceList, planGroupEdit } from '../../services/provinceGroupEdit.js';
import { applyPatches } from '../../services/textPatch.js';
import { parseDocument } from '../../services/syntaxValidation.js';

const CLIMATE = [
  '## Tropical ##',
  'harsh_climate = {',
  '\tfarm_rgo_size = 0',
  '\tmax_attrition = 5',
  '}',
  '',
  'temperate_climate = {',
  '\tfarm_rgo_size = 0',
  '}',
  '',
  'harsh_climate = {',
  '\t8 10 39',
  '}',
  '',
  'temperate_climate = {',
  '\t1 3 5',
  '}',
  '',
].join('\n');

const REGION = ['USA_1 = { 1 2 3 } # Alaska', 'ENG_6 = { 6 7 }', ''].join('\n');

function edit(text: string, provinceId: number, groups: readonly string[]): string {
  return applyPatches(text, planGroupEdit(text, parseDocument(text).document, provinceId, groups));
}

suite('provinceGroupEdit', () => {
  test('a province listed by two groups belongs to the first, the way the engine reads it', () => {
    const document = parseDocument('ENG_1 = { 1 2 }\nUSA_3 = { 2 7 }\nharsh = { farm_rgo_size = 0 }\n').document;
    assert.deepStrictEqual([...firstGroupByProvince(document)], [[1, 'ENG_1'], [2, 'ENG_1'], [7, 'USA_3']]);
  });

  test('a modifier block is not an id list, so it never claims a province', () => {
    const document = parseDocument(CLIMATE).document;
    assert.deepStrictEqual(groupsOfProvince(document, 8), ['harsh_climate']);
    assert.deepStrictEqual(groupsOfProvince(document, 0), []);
    const blocks = document.entries.filter((entry) => entry.kind === 'assignment' && entry.value.kind === 'block');
    const first = blocks[0];
    assert.ok(first?.kind === 'assignment' && first.value.kind === 'block');
    assert.strictEqual(isProvinceList(first.value), false);
  });

  test('every declared group is offered once, modifier block and id list together', () => {
    assert.deepStrictEqual(groupNames(parseDocument(CLIMATE).document), ['harsh_climate', 'temperate_climate']);
  });

  test('a province moves from the climate it had to the one it was given', () => {
    const written = edit(CLIMATE, 8, ['temperate_climate']);
    assert.ok(written.includes('\t10 39\n'), written);
    assert.ok(written.includes('\t1 3 5 8\n'), written);
  });

  test('a province already in the group is left exactly where it is', () => {
    assert.deepStrictEqual(planGroupEdit(CLIMATE, parseDocument(CLIMATE).document, 8, ['harsh_climate']), []);
  });

  test('a group with no id list yet gets one at the end of the file', () => {
    const text = 'arid_climate = {\n\tmax_attrition = 5\n}\n';
    assert.strictEqual(edit(text, 12, ['arid_climate']), text + 'arid_climate = { 12 }\n');
  });

  test('a name the file does not have becomes a block of its own', () => {
    assert.strictEqual(edit(REGION, 9, ['USA_1', 'NEW_9']), REGION.replace('1 2 3 }', '1 2 3 9 }') + 'NEW_9 = { 9 }\n');
  });

  test('several regions at once, and the ones dropped lose the id', () => {
    assert.strictEqual(edit(REGION, 6, ['USA_1']), 'USA_1 = { 1 2 3 6 } # Alaska\nENG_6 = { 7 }\n');
  });

  test('an empty list takes the province out of every group', () => {
    assert.strictEqual(edit(REGION, 2, []), 'USA_1 = { 1 3 } # Alaska\nENG_6 = { 6 7 }\n');
  });

  test('an id alone on its line takes the line with it', () => {
    const text = 'A = {\n\t1\n\t2\n}\n';
    assert.strictEqual(edit(text, 1, []), 'A = {\n\t2\n}\n');
  });

  test('blank names are ignored, and a repeated name is written once', () => {
    assert.strictEqual(edit(REGION, 9, ['  ', 'ENG_6', 'eng_6']), 'USA_1 = { 1 2 3 } # Alaska\nENG_6 = { 6 7 9 }\n');
  });

  test('a file written with CRLF keeps CRLF in the block it gains', () => {
    const written = edit('A = { 1 }\r\n', 2, ['A', 'B']);
    assert.strictEqual(written, 'A = { 1 2 }\r\nB = { 2 }\r\n');
  });
});
