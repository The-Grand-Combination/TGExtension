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

suite('validationWalker — trigger names and scopes', () => {
  test('accepts known triggers in the right scope', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('tag = ENG war = no year = 1850')), []);
  });

  test('flags an unknown trigger with a suggestion', () => {
    const found = codes(eventWithTrigger('tags = ENG'));
    assert.deepStrictEqual(found, ['unknown-trigger']);
  });

  test('flags a province trigger used in country scope', () => {
    assert.ok(codes(eventWithTrigger('is_coastal = yes')).includes('wrong-scope'));
  });

  test('country triggers with an engine province fallback pass in province scope', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('capital_scope = { civilized = yes }')), []);
  });

  test('country-only triggers are rejected in province scope', () => {
    assert.ok(codes(eventWithTrigger('capital_scope = { prestige = 5 }')).includes('wrong-scope'));
  });

  test('accepts province triggers after a scope change', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('capital_scope = { is_coastal = yes }')), []);
  });

  test('AND/OR/NOT pass scope through', () => {
    assert.deepStrictEqual(
      codes(eventWithTrigger('NOT = { tag = ENG } OR = { war = yes prestige = 5 }')),
      [],
    );
  });

  test('exists works in any scope (IF-emulation idiom)', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('capital_scope = { exists = FRA }')), []);
  });

  test('comparison operators require numbers', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('prestige >= 10')), []);
    assert.ok(codes(eventWithTrigger('prestige >= ENG')).includes('invalid-value'));
  });
});

suite('validationWalker — dynamic trigger keys', () => {
  test('ideology name as trigger takes a number', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('liberal = 10')), []);
    assert.ok(codes(eventWithTrigger('liberal = lots')).includes('invalid-value'));
  });

  test('reform class checks its options', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('slavery = yes_slavery')), []);
    assert.ok(codes(eventWithTrigger('slavery = maybe_slavery')).includes('unknown-reform-option'));
  });

  test('reform options resolve against the engine pool, not the class (NCE map_of_ioptions/roptions)', () => {
    // Party, political, and social options share one pool; economic and military reforms another.
    assert.deepStrictEqual(codes(eventWithTrigger('slavery = free_trade')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('land_reform = yes_land_reform')), []);
    assert.ok(codes(eventWithTrigger('slavery = yes_land_reform')).includes('unknown-reform-option'));
    assert.ok(codes(eventWithTrigger('land_reform = free_trade')).includes('unknown-reform-option'));
  });

  test('technology as trigger takes a number', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('flintlock_rifles = 1')), []);
  });

  test('TAG scope key switches to country scope', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('FRA = { war = no }')), []);
  });

  test('province id scope key switches to province scope', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('619 = { owned_by = ENG }')), []);
  });
});

suite('validationWalker — reference checks', () => {
  test('unknown TAG is an error with a suggestion', () => {
    const diagnostics = validateSemantics(
      parseDocument(eventWithTrigger('tag = ENQ')).document,
      'event',
      index,
      'events/Test.txt',
    );
    const first = diagnostics[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.code, 'unknown-country');
    assert.ok(first.message.includes("'eng'"), first.message);
  });

  test('unknown culture in an effect', () => {
    assert.ok(codes(eventWithOption('primary_culture = klingon')).includes('unknown-culture'));
  });

  test('unknown modifier in add_country_modifier', () => {
    assert.ok(
      codes(eventWithOption('add_country_modifier = { name = missing_mod duration = 10 }')).includes(
        'unknown-modifier',
      ),
    );
  });

  test('block args validate required fields', () => {
    assert.ok(
      codes(eventWithOption('add_country_modifier = { name = the_great_modifier }')).includes(
        'missing-field',
      ),
    );
  });

  test('valid references pass', () => {
    assert.deepStrictEqual(
      codes(
        eventWithOption(
          'prestige = 5 add_country_modifier = { name = the_great_modifier duration = 10 } relation = { who = FRA value = -20 }',
        ),
      ),
      [],
    );
  });
});

suite('validationWalker — effects', () => {
  test('flags unknown effects', () => {
    assert.deepStrictEqual(codes(eventWithOption('prestigee = 5')), ['unknown-effect']);
  });

  test('secede_province to an undefined tag, null, or --- warns about uncolonizing', () => {
    for (const target of ['QQQ', 'null', '---']) {
      assert.deepStrictEqual(
        codes(eventWithOption(`any_owned = { secede_province = ${target} }`)),
        ['uncolonize-province'],
        target,
      );
    }
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { secede_province = ENG }')), []);
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { secede_province = QQQQ }')), ['unknown-country']);
  });

  test('flags a province effect in country scope', () => {
    assert.ok(codes(eventWithOption('infrastructure = 1')).includes('wrong-scope'));
  });

  test('accepts province effects after any_owned', () => {
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { infrastructure = 1 }')), []);
  });

  test('limit inside an iterator validates as trigger in the new scope', () => {
    assert.deepStrictEqual(
      codes(eventWithOption('any_owned = { limit = { is_coastal = yes } fort = 1 }')),
      [],
    );
  });

  test('pop type key targets pops', () => {
    assert.deepStrictEqual(codes(eventWithOption('farmers = { consciousness = 1 }')), []);
  });

  test('pop-only effects inside a TAG scope are wrong-scope', () => {
    assert.ok(
      codes(eventWithOption('FRA = { country_event = 100 literacy = 0.1 }')).includes('wrong-scope'),
    );
  });

  test('good as stockpile effect takes a number', () => {
    assert.deepStrictEqual(codes(eventWithOption('small_arms = 25')), []);
  });

  test('random and random_list walk nested effects', () => {
    assert.deepStrictEqual(
      codes(eventWithOption('random = { chance = 50 prestige = 1 } random_list = { 50 = { badboy = 1 } 50 = { } }')),
      [],
    );
  });

  test('context-restricted scopes are rejected on the wrong side', () => {
    assert.ok(codes(eventWithOption('any_owned = { fort = 1 }')).length === 0);
    assert.ok(codes(eventWithOption('any_owned_province = { fort = 1 }')).includes('wrong-context'));
    assert.ok(codes(eventWithTrigger('random_owned = { is_coastal = yes }')).includes('wrong-context'));
  });
});

suite('validationWalker — localisation and pictures', () => {
  test('warns on a missing localisation key in title/desc/name', () => {
    const text =
      'country_event = { id = 1 title = "NOPE_TITLE" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.deepStrictEqual(codes(text), ['missing-localisation']);
  });

  test('warns on a missing event picture with a suggestion', () => {
    const text =
      'country_event = { id = 1 title = "t" desc = "d" picture = "Slavs" is_triggered_only = yes option = { name = "o" } }';
    const diagnostics = validateSemantics(parseDocument(text).document, 'event', index, 'events/Test.txt');
    const first = diagnostics[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.code, 'missing-picture');
    assert.strictEqual(first.severity, 'warning');
    assert.ok(first.message.includes("'slaves'"), first.message);
  });

  test('accepts existing loc keys and pictures', () => {
    const text =
      'country_event = { id = 1 title = "EVTNAME100" desc = "d" picture = "Slaves" is_triggered_only = yes option = { name = "o" } }';
    assert.deepStrictEqual(codes(text), []);
  });

  test('warns on missing derived decision loc keys', () => {
    const text = 'political_decisions = { unlocalised_one = { potential = { } effect = { } } }';
    const found = codes(text, 'decision', 'decisions/Test.txt');
    assert.deepStrictEqual(found, ['missing-localisation', 'missing-localisation']);
  });

  test('accepts a decision with derived loc keys present', () => {
    const text = 'political_decisions = { my_decision = { potential = { } effect = { } } }';
    assert.deepStrictEqual(codes(text, 'decision', 'decisions/Test.txt'), []);
  });
});

suite('validationWalker — never-set flags', () => {
  test('warns when a checked country flag is never set', () => {
    const found = codes(eventWithTrigger('has_country_flag = ghost_flag'));
    assert.deepStrictEqual(found, ['flag-never-set']);
  });

  test('warns when a checked global flag is never set', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('has_global_flag = ghost_global')), ['flag-never-set']);
  });

  test('accepts flags set elsewhere in the mod', () => {
    assert.deepStrictEqual(
      codes(eventWithTrigger('has_country_flag = known_flag has_global_flag = known_global')),
      [],
    );
  });

  test('accepts flags set in the same buffer', () => {
    const text =
      'country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes ' +
      'trigger = { NOT = { has_country_flag = fresh_flag } } ' +
      'option = { name = "o" set_country_flag = fresh_flag } }';
    assert.deepStrictEqual(codes(text), []);
  });

  test('suggests close flag names', () => {
    const diagnostics = validateSemantics(
      parseDocument(eventWithTrigger('has_country_flag = known_flagg')).document,
      'event',
      index,
      'events/Test.txt',
    );
    const first = diagnostics[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.severity, 'warning');
    assert.ok(first.message.includes("'known_flag'"), first.message);
  });
});

suite('validationWalker — color definitions', () => {
  test('colors take exactly three plain numbers', () => {
    assert.deepStrictEqual(codes('color = { 136 170 0 }', 'popType', 'poptypes/farmers.txt'), []);
    assert.deepStrictEqual(codes('color = { 0.5 0.2 0.1 }', 'popType', 'poptypes/farmers.txt'), []);
  });

  test('suffixed numbers, commas, and wrong counts are errors', () => {
    assert.ok(codes('color = { 136 170n 0 }', 'popType', 'poptypes/farmers.txt').includes('invalid-color'));
    assert.ok(codes('color = { 136, 170, 0 }', 'popType', 'poptypes/farmers.txt').includes('invalid-color'));
    assert.ok(codes('color = { 136 170 }', 'popType', 'poptypes/farmers.txt').includes('invalid-color'));
  });

  test('colors are checked in untyped common files (cultures, countries)', () => {
    const cultures = 'germanic = { bavarian = { color = { 1 2n 3 } } }';
    assert.ok(codes(cultures, 'commonOther', 'common/cultures.txt').includes('invalid-color'));
    assert.deepStrictEqual(
      codes('color = { 136 170 0 } graphical_culture = Generic', 'commonOther', 'common/countries/England.txt'),
      [],
    );
  });
});

suite('validationWalker — NCE scope rules', () => {
  test('any_core produces province from country and country from province', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('any_core = { is_coastal = yes }')), []);
    const provinceEvent =
      'province_event = { id = 2 title = "t" desc = "d" is_triggered_only = yes trigger = { any_core = { tag = ENG } } option = { name = "o" } }';
    assert.deepStrictEqual(codes(provinceEvent), []);
  });

  test('this_union is a valid country value', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('this_culture_union = this_union')), []);
  });

  test('hidden_tooltip keeps the current effect scope', () => {
    assert.deepStrictEqual(codes(eventWithOption('hidden_tooltip = { prestige = 5 }')), []);
  });

  test('region keys iterate provinces in triggers and effects', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('ENG_1 = { port = yes }')), []);
    assert.deepStrictEqual(codes(eventWithOption('ENG_1 = { life_rating = 5 }')), []);
  });
});
