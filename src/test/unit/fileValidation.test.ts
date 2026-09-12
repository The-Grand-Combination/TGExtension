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

  test('a marker holding regex metacharacters is still matched literally', () => {
    // The scan compiles the marker, so '(' and '.' must not become syntax.
    assert.deepStrictEqual(codes(marked('tags = ENG # skip(v2.0)'), { ignoreMarker: '# skip(v2.0)' }), []);
    assert.deepStrictEqual(codes(marked('tags = ENG # skipXv2Y0Z'), { ignoreMarker: '# skip(v2.0)' }), [
      'unknown-trigger',
    ]);
  });

  test('CRLF files and a marker on the last line work', () => {
    const crlf = marked('tags = ENG #VT - Skip Validation').replace(/\n/g, '\r\n');
    assert.deepStrictEqual(codes(crlf), []);
    // No trailing newline after the marked line.
    const lastLine = 'country_event = {\n  id = 1\n  title = "EVTNAME100"\n  desc = "d"\n  is_triggered_only = yes\n  trigger = { tags = ENG }\n  option = { name = "o" }\n}\n#VT - Skip Validation';
    assert.deepStrictEqual(codes(lastLine), ['unknown-trigger'], 'a marker on its own last line silences only itself');
  });

  test('two markers on one line silence it once', () => {
    assert.deepStrictEqual(codes(marked('tags = ENG #VT - Skip Validation #VT - Skip Validation')), []);
  });

  /**
   * The marker scan used to search the whole text again for every line, which
   * is quadratic; a ten-megabyte script file cost minutes on its own. The bound
   * is loose on purpose: it only has to fail if that ever comes back.
   */
  test('a multi-megabyte file with findings is scanned in linear time', () => {
    const body = '    tags = ENG\n'.repeat(120000); // ~1.8 MB, 120k findings' worth of lines
    const text = `country_event = {\n  id = 1\n  title = "EVTNAME100"\n  desc = "d"\n  is_triggered_only = yes\n  trigger = {\n${body}  }\n  option = { name = "o" }\n}\n`;
    const started = Date.now();
    const found = validateFileText(text, 'event', index, 'events/A.txt', DEFAULT_VALIDATION_OPTIONS);
    const elapsed = Date.now() - started;
    assert.ok(found.length > 0, 'the file does report findings, so the marker scan runs');
    assert.ok(elapsed < 10000, `validating ${String(text.length)} chars took ${String(elapsed)}ms`);
  });
});
