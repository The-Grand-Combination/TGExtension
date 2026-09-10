import * as assert from 'node:assert';
import { validateFileText } from '../../services/fileValidation.js';
import { buildTestIndex } from './testIndex.js';

suite('fileValidation — the per-file pipeline', () => {
  const index = buildTestIndex({ 'common/buildings.txt': 'fort = { type = fort }\nfort = { type = fort }\n' });

  test('runs syntax, structure, and semantics on a script file', () => {
    const text = 'country_event = { title = "t" desc = "d" trigger = { tags = ENG } option = { name = "o" }';
    const codes = validateFileText(text, 'event', index, 'events/A.txt').map((item) => item.code);
    assert.ok(codes.includes('event-missing-id'), 'structure');
    assert.ok(codes.includes('unknown-trigger'), 'semantics');
    assert.ok(codes.includes('unbalanced-brace'), 'syntax');
  });

  test('appends the duplicates the index found for this file', () => {
    const codes = validateFileText('fort = { type = fort }\nfort = { type = fort }\n', 'buildings', index, 'common/buildings.txt').map(
      (item) => item.code,
    );
    assert.deepStrictEqual(codes, ['duplicate-identifier', 'duplicate-identifier']);
  });

  test('skips semantics and duplicates without an index', () => {
    const codes = validateFileText('fort = { type = fort }\nfort = { type = fort }\n', 'buildings', undefined, 'common/buildings.txt');
    assert.deepStrictEqual(codes, []);
    assert.deepStrictEqual(validateFileText('1;1;1;1;x;x\n', 'mapDefinition', undefined, 'map/definition.csv'), []);
  });

  test('routes the map CSVs to the CSV validator', () => {
    const codes = validateFileText(';r;g;b;x;x\n1;1;1;1;One;x\n2;1;1;1;Two;x\n', 'mapDefinition', index, 'map/definition.csv').map(
      (item) => item.code,
    );
    assert.deepStrictEqual(codes, ['duplicate-color']);
  });
});
