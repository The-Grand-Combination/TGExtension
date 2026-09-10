import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateStructure } from '../../services/structureValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';

function structureCodes(text: string, fileType: FileType): string[] {
  const { document } = parseDocument(text);
  return validateStructure(document, fileType).map((diagnostic) => diagnostic.code);
}

suite('structureValidation — events', () => {
  test('flags a missing id', () => {
    const text = 'country_event = { title = "t" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.ok(structureCodes(text, 'event').includes('event-missing-id'));
  });

  test('accepts a complete event', () => {
    const text = `country_event = {
      id = 1
      title = "t"
      desc = "d"
      option = { name = "o" }
    }`;
    assert.deepStrictEqual(structureCodes(text, 'event'), []);
  });

  test('flags unknown top-level keys', () => {
    assert.deepStrictEqual(structureCodes('add_decision = whatever', 'event'), [
      'unknown-top-level-key',
    ]);
  });

  test('suggests country_event for a top-level typo', () => {
    const { document } = parseDocument('countrya_event = { id = 1 }');
    const diagnostics = validateStructure(document, 'event');
    const first = diagnostics[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.code, 'unknown-top-level-key');
    assert.ok(first.message.includes("'country_event'"), first.message);
  });

  test('flags a non-block event value', () => {
    assert.deepStrictEqual(structureCodes('country_event = 5', 'event'), ['expected-block']);
  });
});

suite('structureValidation — decisions', () => {
  test('flags missing potential and effect', () => {
    const codes = structureCodes('political_decisions = { foo = { picture = bar } }', 'decision');
    assert.ok(codes.includes('decision-missing-potential'));
    assert.ok(codes.includes('decision-missing-effect'));
  });

  test('treats allow as optional', () => {
    // A decision with no `allow` is always enactable — not a warning.
    const text = 'political_decisions = { foo = { potential = { } effect = { } } }';
    assert.deepStrictEqual(structureCodes(text, 'decision'), []);
  });

  test('flags a typoed political_decisions wrapper', () => {
    const { document } = parseDocument('political_decisionsa = { foo = { } }');
    const diagnostics = validateStructure(document, 'decision');
    const first = diagnostics[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.code, 'unknown-top-level-key');
    assert.ok(first.message.includes("'political_decisions'"), first.message);
  });
});

suite('structureValidation — unknown files', () => {
  test('produces no structural diagnostics', () => {
    assert.deepStrictEqual(structureCodes('anything = { goes = here }', 'unknown'), []);
  });
});
