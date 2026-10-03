import * as assert from 'node:assert';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationOptions } from '../../model/validationOptions.js';
import { validateFileText } from '../../services/fileValidation.js';
import { validateLocalisation } from '../../services/localisationValidation.js';

const SHORT = 'short text';
const LONG = 'a'.repeat(1001);

function csv(...rows: readonly string[]): string {
  return `#CODE;ENGLISH;FRENCH;GERMAN;x\n${rows.join('\n')}\n`;
}

function options(overrides: Partial<ValidationOptions>): ValidationOptions {
  return { ...DEFAULT_VALIDATION_OPTIONS, ...overrides };
}

suite('localisationValidation — event description length', () => {
  test('a description within the limit reports nothing', () => {
    assert.deepStrictEqual(validateLocalisation(csv(`EVTDESC1;${SHORT};${SHORT};;x`), DEFAULT_VALIDATION_OPTIONS), []);
    assert.deepStrictEqual(validateLocalisation(csv(`EVTDESC1;${'a'.repeat(1000)};x`), DEFAULT_VALIDATION_OPTIONS), []);
  });

  test('a description past the limit warns on that column, once per language', () => {
    const text = csv(`EVTDESC48300;${LONG};${SHORT};${LONG};x`);
    const found = validateLocalisation(text, DEFAULT_VALIDATION_OPTIONS);
    assert.deepStrictEqual(
      found.map((item) => [item.severity, item.code]),
      [
        ['warning', 'event-desc-too-long'],
        ['warning', 'event-desc-too-long'],
      ],
    );
    assert.strictEqual(text.slice(found[0]?.range.start, found[0]?.range.end), LONG);
    assert.strictEqual(text.slice(found[1]?.range.start, found[1]?.range.end), LONG);
    assert.match(found[0]?.message ?? '', /'EVTDESC48300' is 1001 characters long, past the 1000/);
  });

  test('only keys matching the pattern are measured', () => {
    const text = csv(`EVTNAME1;${LONG};x`, `PROV1234;${LONG};x`, `EVTDESC1;${LONG};x`);
    assert.strictEqual(validateLocalisation(text, DEFAULT_VALIDATION_OPTIONS).length, 1);
    assert.strictEqual(validateLocalisation(text, options({ eventDescPattern: /^EVT/ })).length, 2);
    assert.strictEqual(validateLocalisation(text, options({ eventDescPattern: undefined })).length, 3, 'empty pattern: every key');
  });

  test('the limit is a setting', () => {
    const text = csv(`EVTDESC1;${'a'.repeat(300)};x`);
    assert.strictEqual(validateLocalisation(text, DEFAULT_VALIDATION_OPTIONS).length, 0);
    assert.strictEqual(validateLocalisation(text, options({ eventDescMaxLength: 250 })).length, 1);
  });

  test('the row terminator and empty columns are not measured, and comments are skipped', () => {
    const text = csv(`#EVTDESC1;${LONG};x`, 'EVTDESC2;;;;x');
    assert.deepStrictEqual(validateLocalisation(text, DEFAULT_VALIDATION_OPTIONS), []);
  });

  test('runs through the per-file pipeline without an index, and honours the skip marker', () => {
    const text = csv(`EVTDESC1;${LONG};x`, `EVTDESC2;${LONG};x #VT - Skip Validation`);
    const found = validateFileText(text, 'localisation', undefined, 'localisation/events.csv');
    assert.deepStrictEqual(found.map((item) => item.code), ['event-desc-too-long']);
  });
});
