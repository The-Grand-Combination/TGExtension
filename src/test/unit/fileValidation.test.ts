import * as assert from 'node:assert';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationOptions } from '../../model/validationOptions.js';
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

suite('fileValidation — the skip-validation marker', () => {
  const index = buildTestIndex();
  // The marker is a comment, so it belongs at the end of its own line: anything
  // after it on that line, a closing brace included, is commented out.
  const marked = (line: string): string =>
    `country_event = {\n  id = 1\n  title = "EVTNAME100"\n  desc = "d"\n  is_triggered_only = yes\n  trigger = {\n    ${line}\n  }\n  option = { name = "o" }\n}\n`;

  function codes(text: string, options?: Partial<ValidationOptions>): string[] {
    return validateFileText(text, 'event', index, 'events/A.txt', {
      ...DEFAULT_VALIDATION_OPTIONS,
      ...options,
    }).map((item) => item.code);
  }

  test('a marked line reports nothing', () => {
    assert.deepStrictEqual(codes(marked('tags = ENG')), ['unknown-trigger']);
    assert.deepStrictEqual(codes(marked('tags = ENG #VT - Skip Validation')), []);
  });

  test('the match is case-insensitive and takes trailing text', () => {
    assert.deepStrictEqual(codes(marked('tags = ENG #vt - skip validation, engine quirk')), []);
    assert.deepStrictEqual(codes(marked('tags = ENG #VT - SKIP VALIDATION')), []);
  });

  test('the marker is matched literally, spacing included', () => {
    // '# VT' is not '#VT': the marker is a plain string, not a pattern.
    assert.deepStrictEqual(codes(marked('tags = ENG # VT - Skip Validation')), ['unknown-trigger']);
  });

  test('only the marked line is silenced', () => {
    const text =
      'country_event = {\n  id = 1\n  title = "EVTNAME100"\n  desc = "d"\n  is_triggered_only = yes\n' +
      '  trigger = {\n    tags = ENG #VT - Skip Validation\n    warr = yes\n  }\n  option = { name = "o" }\n}\n';
    assert.deepStrictEqual(codes(text), ['unknown-trigger'], 'the second bad line still reports');
  });

  test('an empty marker turns the escape hatch off', () => {
    assert.deepStrictEqual(codes(marked('tags = ENG #VT - Skip Validation'), { ignoreMarker: '' }), [
      'unknown-trigger',
    ]);
  });

  test('a custom marker is honoured', () => {
    assert.deepStrictEqual(codes(marked('tags = ENG # NOLINT'), { ignoreMarker: '# NOLINT' }), []);
    assert.deepStrictEqual(codes(marked('tags = ENG #VT - Skip Validation'), { ignoreMarker: '# NOLINT' }), [
      'unknown-trigger',
    ]);
  });
});
