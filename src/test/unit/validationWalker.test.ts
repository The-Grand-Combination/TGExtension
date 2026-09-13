import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateSemantics } from '../../services/semanticValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationOptions } from '../../model/validationOptions.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

function codes(
  text: string,
  fileType: FileType = 'event',
  currentFile = 'events/Test.txt',
  overrides?: ValidationOptions,
): string[] {
  const { document } = parseDocument(text);
  return validateSemantics(document, fileType, index, currentFile, overrides).map((item) => item.code);
}

function eventWithTrigger(trigger: string): string {
  return `country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes trigger = { ${trigger} } option = { name = "o" } }`;
}

/** Default options with one rule overridden, so a new option does not break every test. */
function options(overrides: Partial<ValidationOptions>): ValidationOptions {
  return { ...DEFAULT_VALIDATION_OPTIONS, ...overrides };
}

function eventWithOption(effects: string): string {
  return `country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" ${effects} } }`;
}

/** Null tag warnings are off by default, so a rule about them has to ask for them. */
const REPORTING_NULL_TAGS = options({ suppressNullTagWarnings: false });

/** `codes` with those warnings turned back on. */
function nullTagCodes(text: string, fileType: FileType = 'event', currentFile = 'events/Test.txt'): string[] {
  return codes(text, fileType, currentFile, REPORTING_NULL_TAGS);
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
        nullTagCodes(eventWithOption(`any_owned = { secede_province = ${target} }`)),
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

  test('a building declared by the mod changes level like fort does', () => {
    // steel_factory and fort are both in the test index's common/buildings.txt.
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { fort = 1 }')), []);
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { steel_factory = -1 }')), []);
    assert.ok(codes(eventWithOption('any_owned = { steel_factory = lots }')).includes('invalid-value'));
    assert.ok(codes(eventWithOption('steel_factory = -1')).includes('wrong-scope'), 'province scope only');
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { not_a_building = -1 }')), ['unknown-effect']);
  });

  test('scaled_militancy names the issue by class as well as by issue', () => {
    // The test index has the class `slavery` with `yes_slavery` / `no_slavery`.
    assert.deepStrictEqual(codes(eventWithOption('scaled_militancy = { factor = -10 slavery = yes_slavery }')), []);
    assert.deepStrictEqual(codes(eventWithOption('scaled_consciousness = { factor = 1 issue = yes_slavery }')), []);
    assert.deepStrictEqual(codes(eventWithOption('scaled_militancy = { factor = 1 ideology = liberal }')), []);
    assert.ok(
      codes(eventWithOption('scaled_militancy = { factor = -10 slavery = maybe_slavery }')).includes('unknown-reform-option'),
      'the position is still checked against the class',
    );
    assert.deepStrictEqual(
      codes(eventWithOption('scaled_militancy = { factor = -10 not_a_class = x }')),
      ['unknown-field'],
      'a key that is not a class is still unknown',
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

suite('validationWalker — effects the engine does not run', () => {
  test('set_province_flag is an error in an effect block', () => {
    const found = codes(eventWithOption('any_owned = { set_province_flag = my_flag }'));
    assert.deepStrictEqual(found, ['broken-effect']);
  });

  test('set_province_flag is an error in province history', () => {
    const found = codes('set_province_flag = my_flag', 'historyProvince', 'history/provinces/europe/1.txt');
    assert.deepStrictEqual(found, ['broken-effect']);
  });

  test('the message names the effect as written', () => {
    const diagnostics = validateSemantics(
      parseDocument(eventWithOption('any_owned = { SET_PROVINCE_FLAG = my_flag }')).document,
      'event',
      index,
      'events/Test.txt',
    );
    const first = diagnostics[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.severity, 'error');
    assert.ok(first.message.includes("'SET_PROVINCE_FLAG'"), first.message);
  });

  test('the other province flag keys are untouched', () => {
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { clr_province_flag = my_flag }')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('any_owned_province = { has_province_flag = my_flag }')), []);
  });
});

suite('validationWalker — localisation and pictures', () => {
  test('warns on a missing localisation key in title/desc/name', () => {
    const text =
      'country_event = { id = 1 title = "EVTNAME_NOPE" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.deepStrictEqual(codes(text), ['missing-localisation']);
  });

  test('a value outside the key pattern is literal display text, not a missing key', () => {
    const hardcoded =
      'country_event = { id = 1 title = "t" desc = "Death of Dom Pedro II" is_triggered_only = yes option = { name = "o" } }';
    assert.deepStrictEqual(codes(hardcoded), []);
  });

  test('an empty key pattern checks every value', () => {
    const text =
      'country_event = { id = 1 title = "NOPE_TITLE" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    const found = validateSemantics(
      parseDocument(text).document,
      'event',
      index,
      'events/Test.txt',
      options({ locKeyPattern: undefined }),
    );
    assert.deepStrictEqual(found.map((item) => item.code), ['missing-localisation']);
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

  test('a picture in a subfolder resolves by its path under the folder', () => {
    const nested = buildTestIndex({ 'gfx/pictures/events/Brasil/Dom Pedro.tga': '' });
    const event = (picture: string): string[] =>
      validateSemantics(
        parseDocument(
          `country_event = { id = 1 title = "EVTNAME100" desc = "d" picture = "${picture}" is_triggered_only = yes option = { name = "o" } }`,
        ).document,
        'event',
        nested,
        'events/Test.txt',
      ).map((item) => item.code);
    assert.deepStrictEqual(event('Brasil/Dom Pedro'), []);
    assert.deepStrictEqual(event('Brasil/Nobody'), ['missing-picture']);
    assert.deepStrictEqual(event('Dom Pedro'), ['missing-picture']);
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

suite('validationWalker — symbols the wiki does not list', () => {
  test('the capital builders take a level as well as yes/no', () => {
    assert.deepStrictEqual(codes(eventWithOption('build_fort_in_capital = 4')), []);
    assert.deepStrictEqual(codes(eventWithOption('build_railway_in_capital = 4')), []);
    assert.deepStrictEqual(codes(eventWithOption('build_fort_in_capital = yes')), []);
    assert.ok(codes(eventWithOption('build_fort_in_capital = tall')).includes('invalid-value'));
  });

  test('the two crisis checks are country-scope yes/no triggers', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('is_colonial_crisis = yes')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('is_influence_crisis = yes')), []);
  });

  test('has_flashpoint reads in province scope as well as state', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('any_owned_province = { has_flashpoint = yes }')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('any_state = { has_flashpoint = yes }')), []);
  });
});

suite('validationWalker — null country tags', () => {
  test('war = { target = --- } warns about the AI-join exploit by name', () => {
    const war = 'war = { attacker_goal = { casus_belli = acquire_all_cores } call_ally = yes target = --- }';
    const found = validateSemantics(
      parseDocument(eventWithOption(war)).document,
      'event',
      index,
      'events/Test.txt',
      REPORTING_NULL_TAGS,
    );
    const first = found[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.code, 'null-tag-exploit');
    assert.strictEqual(first.severity, 'warning');
    assert.ok(first.message.includes('Tricking the AI into joining your war'), first.message);
    assert.strictEqual(found.length, 1, 'the exploit note replaces the generic null-tag warning');
  });

  test('a null tag elsewhere keeps the generic warning', () => {
    const found = validateSemantics(
      parseDocument(eventWithOption('add_casus_belli = { target = --- type = acquire_all_cores }')).document,
      'event',
      index,
      'events/Test.txt',
      REPORTING_NULL_TAGS,
    );
    assert.deepStrictEqual(found.map((item) => item.code), ['null-country-tag']);
  });

  test('the three conventional spellings are covered, in any case', () => {
    for (const tag of ['QQQ', 'qqq', '---', 'null', 'NULL']) {
      assert.deepStrictEqual(nullTagCodes(eventWithOption('war = ' + tag)), ['null-country-tag'], tag);
    }
  });

  test('a tag that is merely undefined is still an error', () => {
    assert.deepStrictEqual(codes(eventWithOption('war = ZZZ')), ['unknown-country']);
    assert.deepStrictEqual(codes(eventWithTrigger('tag = ZZZ')), ['unknown-country']);
  });

  test('it applies in triggers and in block fields alike', () => {
    assert.deepStrictEqual(nullTagCodes(eventWithTrigger('tag = ---')), ['null-country-tag']);
    assert.deepStrictEqual(nullTagCodes(eventWithOption('relation = { who = --- value = -20 }')), ['null-country-tag']);
  });

  test('an empty pattern allows no exception at all', () => {
    const found = validateSemantics(
      parseDocument(eventWithOption('war = ---')).document,
      'event',
      index,
      'events/Test.txt',
      options({ nullTagPattern: undefined }),
    );
    assert.deepStrictEqual(found.map((item) => item.code), ['unknown-country']);
  });

  test('secede_province keeps its own message about uncolonizing', () => {
    assert.deepStrictEqual(
      nullTagCodes(eventWithOption('any_owned = { secede_province = --- }')),
      ['uncolonize-province'],
    );
  });

  test('defined tags are unaffected', () => {
    assert.deepStrictEqual(codes(eventWithOption('war = FRA')), []);
  });

  test('by default the mod hears none of it: a null tag is silent everywhere', () => {
    const war = 'war = { attacker_goal = { casus_belli = acquire_all_cores } call_ally = yes target = --- }';
    for (const script of [
      'war = ---',
      war,
      'add_casus_belli = { target = --- type = acquire_all_cores }',
      'relation = { who = QQQ value = -20 }',
      'any_owned = { secede_province = QQQ }',
    ]) {
      assert.deepStrictEqual(codes(eventWithOption(script)), [], script);
    }
    assert.deepStrictEqual(codes(eventWithTrigger('tag = ---')), []);
  });

  test('suppressing is not a mute button: a tag the pattern misses is still reported', () => {
    // ZZZ is undefined, not null. secede_province keeps its own warning for it,
    // and everywhere else it stays the error it always was.
    assert.deepStrictEqual(codes(eventWithOption('any_owned = { secede_province = ZZZ }')), ['uncolonize-province']);
    assert.deepStrictEqual(codes(eventWithOption('war = ZZZ')), ['unknown-country']);
    assert.deepStrictEqual(codes(eventWithTrigger('tag = ZZZ')), ['unknown-country']);
  });

  test('with no pattern there is nothing to suppress, so unknown tags stay errors', () => {
    const none = options({ nullTagPattern: undefined, suppressNullTagWarnings: true });
    assert.deepStrictEqual(codes(eventWithOption('war = ---'), 'event', 'events/Test.txt', none), ['unknown-country']);
    assert.deepStrictEqual(
      codes(eventWithOption('any_owned = { secede_province = QQQ }'), 'event', 'events/Test.txt', none),
      ['uncolonize-province'],
    );
  });
});

suite('validationWalker — THIS/FROM as a culture or religion value', () => {
  test('religion = THIS compares a pop against the scope it came from', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('any_pop = { religion = THIS }')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('any_pop = { religion = this }')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('any_pop = { religion = FROM }')), []);
  });

  test('it works inside a weight block, where the idiom appears', () => {
    const weight = 'ai_chance = { factor = 1 modifier = { factor = -0.1 NOT = { religion = THIS } } }';
    assert.deepStrictEqual(codes(eventWithOption(weight)), []);
  });

  test('it works in a pop_types.txt weight, where the scope is the pop itself', () => {
    const weight = 'promotion_chance = { factor = 1 modifier = { factor = -0.1 NOT = { religion = this } } }';
    assert.deepStrictEqual(codes(weight, 'popChances', 'common/pop_types.txt'), []);
  });

  test('named religions still resolve and unknown ones are errors', () => {
    assert.deepStrictEqual(codes(eventWithTrigger('any_pop = { religion = catholic }')), []);
    assert.deepStrictEqual(codes(eventWithTrigger('any_pop = { religion = zoroastrian }')), ['unknown-religion']);
  });
});

suite('validationWalker — flag name pattern', () => {
  function flagCodes(flagNamePattern: RegExp | undefined): string[] {
    const text = eventWithTrigger('has_country_flag = never_set_anywhere');
    return validateSemantics(
      parseDocument(text).document,
      'event',
      index,
      'events/Test.txt',
      options({ flagNamePattern }),
    ).map((item) => item.code);
  }

  test('no pattern checks every flag, as before', () => {
    assert.deepStrictEqual(flagCodes(undefined), ['flag-never-set']);
  });

  test('a flag whose name is outside the pattern is not reported', () => {
    assert.deepStrictEqual(flagCodes(/^tgc_/), []);
  });

  test('a flag whose name matches is still reported', () => {
    assert.deepStrictEqual(flagCodes(/^never_/), ['flag-never-set']);
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
