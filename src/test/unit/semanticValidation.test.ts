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

function eventWithTrigger(trigger: string): string {
  return `country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes trigger = { ${trigger} } option = { name = "o" } }`;
}

function eventWithOption(effects: string): string {
  return `country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" ${effects} } }`;
}

suite('semanticValidation — stray entries', () => {
  test('a bare value in an event body is an error', () => {
    const text = 'country_event = { a id = 1 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.ok(codes(text).includes('stray-value'));
  });

  test('bare values in trigger, effect, and weight blocks are errors', () => {
    assert.ok(codes(eventWithTrigger('war = yes stray_word')).includes('stray-value'));
    assert.ok(codes(eventWithOption('prestige = 1 stray_word')).includes('stray-value'));
    assert.ok(
      codes(eventWithTrigger('OR = { war = yes { } }')).includes('stray-block'),
    );
  });

  test('legitimate bare-word lists still pass', () => {
    assert.deepStrictEqual(
      codes('peace_order = { acquire_all_cores }', 'cbType', 'common/cb_types.txt'),
      [],
    );
    assert.deepStrictEqual(
      codes(eventWithTrigger('tags_eq = { 0 2 PLAYER }')),
      [],
    );
  });

  test('top-level stray values error in common files', () => {
    const text = 'D01 = "countries/D01.txt"\nasd\nD02 = "countries/D02.txt"\nD03\n';
    const found = codes(text, 'commonOther', 'common/countries.txt');
    assert.strictEqual(found.filter((code) => code === 'stray-value').length, 2, found.join(', '));
    assert.ok(codes('junk\nmy_cb = { months = 12 }', 'cbType', 'common/cb_types.txt').includes('stray-value'));
  });

  test('country_colors.txt validates TAGs and color1-3 blocks', () => {
    const good = 'ENG = { color1 = { 62 122 189 } color2 = { 255 255 255 } color3 = { 193 26 14 } }';
    assert.deepStrictEqual(codes(good, 'countryColors', 'common/country_colors.txt'), []);
    assert.ok(
      codes('QQQ = { color1 = { 1 2 3 } }', 'countryColors', 'common/country_colors.txt').includes('unknown-country'),
    );
    assert.ok(
      codes('ENG = { color4 = { 1 2 3 } }', 'countryColors', 'common/country_colors.txt').includes('unknown-field'),
    );
    assert.ok(
      codes('ENG = { color1 = { 1 2n 3 } }', 'countryColors', 'common/country_colors.txt').includes('invalid-color'),
    );
  });

  test('graphicalculturetype.txt stays a bare list', () => {
    assert.deepStrictEqual(
      codes('BritishGC\nFrenchGC\nGeneric\n', 'graphicalCulture', 'common/graphicalculturetype.txt'),
      [],
    );
  });
});
