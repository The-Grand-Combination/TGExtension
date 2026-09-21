import * as assert from 'node:assert';
import { NULL_TAG_FLAGS } from '../../model/validationOptions.js';
import {
  CompiledPattern,
  CompiledValidationOptions,
  type ValidationSettingsSource,
} from '../../services/validationSettings.js';

const SETTINGS: ValidationSettingsSource = {
  locKeyPattern: '^EVT',
  flagNamePattern: '',
  nullTagPattern: '^(QQQ)$',
  nullTagSuppressWarnings: true,
  ignoreMarker: '#VT - Skip Validation',
};

suite('validationSettings', () => {
  test('the same settings give back the same compiled options', () => {
    const compiled = new CompiledValidationOptions(NULL_TAG_FLAGS);
    const first = compiled.of(SETTINGS);
    assert.strictEqual(compiled.of({ ...SETTINGS }), first, 'a fresh object with the same text still hits');
  });

  test('a changed pattern recompiles', () => {
    const compiled = new CompiledValidationOptions(NULL_TAG_FLAGS);
    const first = compiled.of(SETTINGS);
    const second = compiled.of({ ...SETTINGS, locKeyPattern: '^MSG' });
    assert.notStrictEqual(second, first);
    assert.strictEqual(second.locKeyPattern?.source, '^MSG');
  });

  test('a changed boolean recompiles too, since it is part of the options', () => {
    const compiled = new CompiledValidationOptions(NULL_TAG_FLAGS);
    const first = compiled.of(SETTINGS);
    const second = compiled.of({ ...SETTINGS, nullTagSuppressWarnings: false });
    assert.notStrictEqual(second, first);
    assert.strictEqual(second.suppressNullTagWarnings, false);
  });

  test('an empty pattern compiles to nothing, which means "no filter"', () => {
    const options = new CompiledValidationOptions(NULL_TAG_FLAGS).of({ ...SETTINGS, locKeyPattern: '' });
    assert.strictEqual(options.locKeyPattern, undefined);
  });

  test('the null-tag flags reach the pattern that needs them', () => {
    const options = new CompiledValidationOptions(NULL_TAG_FLAGS).of(SETTINGS);
    assert.strictEqual(options.nullTagPattern?.flags, NULL_TAG_FLAGS);
  });

  test('a single pattern is rebuilt only when its text changes', () => {
    const pattern = new CompiledPattern('i');
    const first = pattern.of('^vanilla');
    assert.strictEqual(pattern.of('^vanilla'), first);
    assert.notStrictEqual(pattern.of('^mine'), first);
    assert.strictEqual(pattern.of(''), undefined);
  });
});
