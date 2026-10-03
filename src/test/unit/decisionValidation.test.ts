import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateSemantics } from '../../services/semanticValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

function codes(text: string, fileType: FileType = 'event', currentFile = 'events/Test.txt'): string[] {
  const { document } = parseDocument(text);
  return validateSemantics(document, fileType, index, currentFile).map((item) => item.code);
}

suite('decisionValidation — duplicate decisions', () => {
  test('flags a decision name already used in another file', () => {
    const text = 'political_decisions = { taken_name = { potential = { } effect = { } } }';
    assert.ok(
      codes(text, 'decision', 'decisions/Other.txt').includes('duplicate-decision-name'),
    );
  });

  test('same file re-validation is not a cross-file duplicate', () => {
    const text = 'political_decisions = { taken_name = { potential = { } effect = { } } }';
    assert.deepStrictEqual(codes(text, 'decision', 'decisions/Existing.txt'), []);
  });
});

suite('decisionValidation — decisions', () => {
  test('validates potential/allow as triggers and effect as effects', () => {
    const text = `political_decisions = { my_decision = {
      picture = cavours_diplomacy
      potential = { tag = ENG NOT = { has_country_flag = done } }
      allow = { war = no money = 1000 }
      effect = { prestige = 5 set_country_flag = done 619 = { add_core = THIS } }
      ai_will_do = { factor = 1 modifier = { factor = 0 war = yes } }
    } }`;
    assert.deepStrictEqual(codes(text, 'decision', 'decisions/Test.txt'), []);
  });

  test('flags unknown trigger inside potential', () => {
    const text = 'political_decisions = { d = { potential = { taag = ENG } allow = { } effect = { } } }';
    assert.ok(codes(text, 'decision', 'decisions/Test.txt').includes('unknown-trigger'));
  });
});

suite('decisionValidation — ai_will_do factors', () => {
  function factors(aiWillDo: string): string[] {
    const text = `political_decisions = { d = { potential = { } allow = { } effect = { } ai_will_do = { ${aiWillDo} } } }`;
    return codes(text, 'decision', 'decisions/Test.txt').filter((code) => code !== 'missing-localisation');
  }

  test('0 and 1 are the only factors, spelled as numbers', () => {
    assert.deepStrictEqual(factors('factor = 1 modifier = { factor = 0 war = yes } modifier = { factor = 1.0 exists = yes }'), []);
  });

  test('a fraction is an error, at the top and in every modifier', () => {
    const found = factors('factor = 0 modifier = { factor = 0.3 exists = yes } modifier = { factor = 0.3 exists = yes }');
    assert.deepStrictEqual(found, ['decision-ai-factor', 'decision-ai-factor']);
    assert.deepStrictEqual(factors('factor = 0.5'), ['decision-ai-factor']);
    assert.deepStrictEqual(factors('factor = 2'), ['decision-ai-factor']);
  });

  test('a factor inside a group of modifiers is checked too', () => {
    assert.deepStrictEqual(factors('factor = 1 group = { modifier = { factor = 0.3 exists = yes } }'), ['decision-ai-factor']);
  });
});

suite('decisionValidation — same-file duplicates', () => {
  test('flags a name defined twice in one file', () => {
    const text = `political_decisions = {
      foo = { potential = { } allow = { } effect = { } }
      foo = { potential = { } allow = { } effect = { } }
    }`;
    const found = codes(text, 'decision', 'decisions/Dup.txt');
    assert.strictEqual(found.filter((code) => code === 'duplicate-decision-name').length, 1);
  });

  test('does not flag a name that appears once', () => {
    const text = 'political_decisions = { my_decision = { potential = { } effect = { } } }';
    assert.ok(!codes(text, 'decision', 'decisions/One.txt').includes('duplicate-decision-name'));
  });
});
