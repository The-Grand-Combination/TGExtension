import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import type { ModIndex } from '../../model/modIndex.js';
import { completionsAt, type CompletionEntry, type CompletionResult } from '../../services/completion.js';
import { analyze } from '../../services/documentAnalysis.js';
import { completionContextAt } from '../../services/completionContext.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

/** `|` marks the cursor. */
function cursor(marked: string): { readonly text: string; readonly offset: number } {
  const offset = marked.indexOf('|');
  assert.ok(offset >= 0, 'the marked text needs a cursor');
  return { text: marked.slice(0, offset) + marked.slice(offset + 1), offset };
}

function complete(marked: string, fileType: FileType, from: ModIndex = index): CompletionResult {
  const { text, offset } = cursor(marked);
  const result = completionsAt(analyze(text), offset, fileType, from);
  assert.ok(result, `expected completions for ${marked}`);
  return result;
}

function labels(marked: string, fileType: FileType, from: ModIndex = index): readonly string[] {
  return complete(marked, fileType, from).entries.map((entry) => entry.label);
}

function entryNamed(entries: readonly CompletionEntry[], label: string): CompletionEntry {
  const found = entries.find((entry) => entry.label === label);
  assert.ok(found, `expected an entry for ${label}`);
  return found;
}

suite('completion — values', () => {
  test('a modifier field lists the mod modifiers', () => {
    const result = complete(
      'country_event = { immediate = { add_country_modifier = { name = | } } }',
      'event',
    );
    assert.ok(result.entries.some((entry) => entry.label === 'the_great_modifier'));
    assert.strictEqual(entryNamed(result.entries, 'the_great_modifier').detail, 'modifier');
    assert.strictEqual(result.incomplete, false);
  });

  test('country history fields list cultures and governments', () => {
    assert.ok(labels('primary_culture = |', 'historyCountry').includes('north_german'));
    assert.ok(labels('government = |', 'historyCountry').includes('absolute_monarchy'));
  });

  test('province history fields list goods and terrain', () => {
    assert.ok(labels('trade_goods = |', 'historyProvince').includes('small_arms'));
    assert.ok(labels('terrain = |', 'historyProvince').includes('arctic'));
  });

  test('a yesno field offers yes and no only', () => {
    assert.deepStrictEqual(labels('civilized = |', 'historyCountry'), ['yes', 'no']);
  });

  test('country tags are offered as mods write them', () => {
    const names = labels('owner = |', 'historyProvince');
    assert.ok(names.includes('ENG'), names.join(' '));
    assert.ok(!names.includes('eng'));
  });

  test('a scalar effect argument resolves from the effect itself', () => {
    const names = labels(
      'country_event = { immediate = { remove_country_modifier = | } }',
      'event',
    );
    assert.ok(names.includes('the_great_modifier'));
  });

  test('a reform class lists the options of its pool', () => {
    assert.ok(labels('slavery = |', 'historyCountry').includes('yes_slavery'));
  });

  test('a flag field lists the flags the mod already sets', () => {
    const names = labels(
      'country_event = { immediate = { clr_country_flag = | } }',
      'event',
    );
    assert.ok(names.includes('known_flag'), names.join(' '));
  });

  test('a number field offers nothing', () => {
    assert.deepStrictEqual(labels('life_rating = |', 'historyProvince'), []);
  });

  test('the value is completed before anything is typed', () => {
    assert.ok(labels('religion = |', 'historyCountry').includes('catholic'));
  });
});

suite('completion — large categories', () => {
  const manyKeys = buildTestIndex({
    'localisation/01_many.csv': Array.from(
      { length: 2500 },
      (_unused, position) => `evt_key_${String(position)};Text ${String(position)};x`,
    ).join('\n'),
  });

  test('nothing is listed before the prefix is long enough', () => {
    const result = complete('country_event = { desc = | }', 'event', manyKeys);
    assert.deepStrictEqual(result.entries, []);
    assert.strictEqual(result.incomplete, true);
  });

  test('a typed prefix lists a capped, incomplete page', () => {
    const result = complete('country_event = { desc = ev| }', 'event', manyKeys);
    assert.strictEqual(result.entries.length, 300);
    assert.strictEqual(result.incomplete, true);
    assert.ok(result.entries.every((entry) => entry.label.toLowerCase().startsWith('ev')));
  });

  test('a localisation key carries its text as the detail', () => {
    const result = complete('country_event = { desc = evt_key_1| }', 'event', manyKeys);
    assert.strictEqual(entryNamed(result.entries, 'evt_key_1').detail, 'Text 1');
  });

  test('a small category is listed with nothing typed', () => {
    assert.ok(labels('country_event = { desc = | }', 'event').includes('EVTNAME100'));
  });
});

suite('completion — keys', () => {
  test('an effect block lists effects of the scope it runs in', () => {
    const names = labels('country_event = { immediate = { | } }', 'event');
    assert.ok(names.includes('add_country_modifier'));
    assert.ok(!names.includes('change_province_name'), 'province-only effect leaked into country scope');
  });

  test('a trigger block lists triggers, never effects', () => {
    const names = labels('country_event = { trigger = { | } }', 'event');
    assert.ok(names.includes('is_vassal'));
    assert.ok(!names.includes('add_country_modifier'));
  });

  test('a scope changer moves the scope the list is filtered by', () => {
    const names = labels(
      'country_event = { immediate = { any_owned = { limit = { | } } } }',
      'event',
    );
    assert.ok(names.includes('province_id'));
    assert.ok(!names.includes('is_vassal'), 'country-only trigger leaked into province scope');
  });

  test('scope changers and control keys come with the symbols', () => {
    const names = labels('country_event = { immediate = { | } }', 'event');
    assert.ok(names.includes('any_owned'));
    assert.ok(names.includes('random_list'));
  });

  test('a block argument lists its own fields', () => {
    const result = complete(
      'country_event = { immediate = { add_country_modifier = { | } } }',
      'event',
    );
    assert.deepStrictEqual(result.entries.map((entry) => entry.label), ['name', 'duration']);
    assert.strictEqual(entryNamed(result.entries, 'name').detail, 'required field');
  });

  test('a weight block lists its factors and modifier', () => {
    const names = labels('country_event = { mean_time_to_happen = { | } }', 'event');
    assert.ok(names.includes('months'));
    assert.ok(names.includes('modifier'));
    assert.ok(!names.includes('add_country_modifier'));
  });

  test('a decision runs its effects in country scope', () => {
    const names = labels('political_decisions = { a = { effect = { | } } }', 'decision');
    assert.ok(names.includes('add_country_modifier'));
    assert.ok(!names.includes('change_province_name'));
  });

  test('the event body lists its structural fields', () => {
    const names = labels('country_event = { | }', 'event');
    assert.ok(names.includes('id'));
    assert.ok(names.includes('fire_only_once'));
    assert.ok(names.includes('immediate'));
  });

  test('the top of an event file lists the event kinds', () => {
    assert.deepStrictEqual(labels('|', 'event'), ['country_event', 'province_event']);
  });

  test('history fields are offered at the top of a history file', () => {
    assert.ok(labels('|', 'historyProvince').includes('life_rating'));
  });

  test('an effect taking a block is inserted as one', () => {
    const result = complete('country_event = { immediate = { | } }', 'event');
    const entry = entryNamed(result.entries, 'add_country_modifier');
    assert.ok(entry.snippet);
    assert.ok(entry.insertText.startsWith('add_country_modifier = {'));
    assert.ok(entry.documentation?.includes('add_country_modifier'));
  });

  test('an unnameable position offers nothing', () => {
    assert.deepStrictEqual(labels('country_event = { immediate = { not_a_thing = { | } } }', 'event'), []);
  });
});

suite('completionContext', () => {
  test('an unclosed block still resolves', () => {
    const { text, offset } = cursor('country_event = {\n  immediate = {\n    |');
    const context = completionContextAt(analyze(text), offset);
    assert.ok(context);
    assert.deepStrictEqual(context.path, ['country_event', 'immediate']);
    assert.strictEqual(context.position, 'key');
  });

  test('a partial word is the prefix, and the range covers it', () => {
    const { text, offset } = cursor('country_event = { immediate = { add_co| } }');
    const context = completionContextAt(analyze(text), offset);
    assert.ok(context);
    assert.strictEqual(context.prefix, 'add_co');
    assert.strictEqual(text.slice(context.range.start, context.range.end), 'add_co');
  });

  test('the cursor after an operator is a value', () => {
    const { text, offset } = cursor('owner = |');
    const context = completionContextAt(analyze(text), offset);
    assert.ok(context);
    assert.strictEqual(context.position, 'value');
    assert.deepStrictEqual(context.path, ['owner']);
    assert.strictEqual(context.prefix, '');
  });

  test('a value being edited keeps its key', () => {
    const { text, offset } = cursor('owner = EN|G');
    const context = completionContextAt(analyze(text), offset);
    assert.ok(context);
    assert.strictEqual(context.position, 'value');
    assert.strictEqual(context.prefix, 'EN');
    assert.strictEqual(text.slice(context.range.start, context.range.end), 'ENG');
  });

  test('comments and strings are left alone', () => {
    const comment = cursor('owner = ENG # a note |here');
    assert.strictEqual(completionContextAt(analyze(comment.text), comment.offset), undefined);
    const inString = cursor('desc = "some te|xt"');
    assert.strictEqual(completionContextAt(analyze(inString.text), inString.offset), undefined);
  });

  test('a closed block is popped off the path', () => {
    const { text, offset } = cursor('country_event = { trigger = { } |');
    const context = completionContextAt(analyze(text), offset);
    assert.ok(context);
    assert.deepStrictEqual(context.path, ['country_event']);
  });
});
