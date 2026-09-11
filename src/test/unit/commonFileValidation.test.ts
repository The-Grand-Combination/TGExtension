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

suite('common/ file validators — common/ files', () => {
  test('cb_types: peace_order entries must be defined CBs', () => {
    const text = 'peace_order = { acquire_all_cores missing_cb }';
    assert.deepStrictEqual(codes(text, 'cbType', 'common/cb_types.txt'), ['unknown-cbtype']);
  });

  test('cb_types: body fields, triggers, and effects validate in engine scopes', () => {
    const text = `my_cb = {
      sprite_index = 1 months = 12 war_name = WAR_NAME
      can_use = { war = no }
      allowed_states = { is_slave = yes }
      on_add = { prestige = 5 }
    }`;
    assert.deepStrictEqual(codes(text, 'cbType', 'common/cb_types.txt'), []);
  });

  test('cb_types: unknown body field errors with a suggestion', () => {
    assert.ok(
      codes('my_cb = { sprite_indexx = 1 }', 'cbType', 'common/cb_types.txt').includes('unknown-cb-field'),
    );
  });

  test('rebel_types: spawn_chance is pop scope, movement_evaluation is province scope', () => {
    const valid = `reb = { icon = 1
      movement_evaluation = { factor = 1 modifier = { factor = 2 is_capital = yes } }
    }`;
    assert.deepStrictEqual(codes(valid, 'rebelType', 'common/rebel_types.txt'), []);
    const invalid = `reb = { icon = 1
      spawn_chance = { factor = 1 modifier = { factor = 0 units_in_province = 1 } }
    }`;
    assert.ok(codes(invalid, 'rebelType', 'common/rebel_types.txt').includes('wrong-scope'));
  });

  test('rebel_types: independence scopes to the rebel nation in triggers', () => {
    const text = `reb = { icon = 1
      demands_enforced_trigger = { independence = { war = no } }
    }`;
    assert.deepStrictEqual(codes(text, 'rebelType', 'common/rebel_types.txt'), []);
  });

  test('rebel_types: government map values must be governments', () => {
    const text = 'reb = { icon = 1 government = { democracy = absolute_monarchy dictatorship = democracy } }';
    assert.deepStrictEqual(codes(text, 'rebelType', 'common/rebel_types.txt'), ['unknown-government']);
  });

  test('on_actions: unknown hooks and unknown event ids error', () => {
    assert.deepStrictEqual(codes('on_yearly_pulse = { 30 = 100 }', 'onActions', 'common/on_actions.txt'), []);
    assert.ok(
      codes('on_daily_pulse = { 30 = 100 }', 'onActions', 'common/on_actions.txt').includes('unknown-on-action'),
    );
    assert.ok(
      codes('on_yearly_pulse = { 30 = 999 }', 'onActions', 'common/on_actions.txt').includes('unknown-event-id'),
    );
  });

  test('issues: allow and on_execute validate as country triggers/effects', () => {
    const text = `political_reforms = { slavery = { no_slavery = {
      allow = { war = no }
      on_execute = { trigger = { money = 100 } effect = { prestige = 1 } }
    } } }`;
    assert.deepStrictEqual(codes(text, 'issues', 'common/issues.txt'), []);
    const badKey = `political_reforms = { slavery = { no_slavery = {
      on_execute = { effects = { prestige = 1 } }
    } } }`;
    assert.ok(codes(badKey, 'issues', 'common/issues.txt').includes('unknown-field'));
  });

  test('national_focus: limit is evaluated per province of the state', () => {
    const text = 'focus_group = { my_focus = { ideology = liberal limit = { port = yes } } }';
    assert.deepStrictEqual(codes(text, 'nationalFocus', 'common/national_focus.txt'), []);
  });

  test('crime and triggered_modifiers walk trigger in their scopes', () => {
    assert.deepStrictEqual(
      codes('crime_x = { trigger = { is_coastal = yes } }', 'crime', 'common/crime.txt'),
      [],
    );
    assert.deepStrictEqual(
      codes('mod_x = { trigger = { war = yes } }', 'triggeredModifier', 'common/triggered_modifiers.txt'),
      [],
    );
  });
});

suite('common/ file validators — common data files', () => {
  test('cultures: groups, cultures, colors, and name lists', () => {
    const text = 'germanic = { leader = european union = ENG north_german = { color = { 1 2 3 } radicalism = 2 primary = ENG first_names = { Hans Otto } } }';
    assert.deepStrictEqual(codes(text, 'cultures', 'common/cultures.txt'), []);
    assert.ok(codes('germanic = { north_german = { colour = { 1 2 3 } } }', 'cultures', 'common/cultures.txt').includes('unknown-culture-field'));
  });

  test('religions and goods: typed fields plus color', () => {
    assert.deepStrictEqual(codes('christian = { catholic = { icon = 1 color = { 0.5 0.5 0.5 } } }', 'religions', 'common/religion.txt'), []);
    assert.deepStrictEqual(codes('raw = { grain = { cost = 1 color = { 1 2 3 } available_from_start = yes } }', 'goods', 'common/goods.txt'), []);
    assert.ok(codes('raw = { grain = { price = 1 } }', 'goods', 'common/goods.txt').includes('unknown-good-field'));
  });

  test('ideologies: reform desires are country weight blocks', () => {
    const text = 'group = { liberal = { color = { 1 2 3 } uncivilized = no add_political_reform = { base = 0 group = { modifier = { factor = 1 militancy = 3 } } } } }';
    assert.deepStrictEqual(codes(text, 'ideologies', 'common/ideologies.txt'), []);
    assert.ok(codes('group = { liberal = { add_political_reform = { modifier = { factor = 1 is_coastal = yes } } } }', 'ideologies', 'common/ideologies.txt').includes('wrong-scope'));
  });

  test('governments: fixed fields plus ideology toggles', () => {
    assert.deepStrictEqual(codes('democracy = { flagType = republic election = yes duration = 48 liberal = yes }', 'governments', 'common/governments.txt'), []);
    assert.ok(codes('democracy = { fascist = yes }', 'governments', 'common/governments.txt').includes('unknown-government-field'));
  });

  test('buildings: typed fields, modifiers, goods cost, colonial points', () => {
    const text = 'fort = { type = fort cost = 100 time = 90 max_level = 6 goods_cost = { grain = 10 } colonial_points = { 30 50 } supply_limit = 1 }';
    assert.deepStrictEqual(codes(text, 'buildings', 'common/buildings.txt'), []);
    assert.ok(codes('fort = { tipe = fort }', 'buildings', 'common/buildings.txt').includes('unknown-building-field'));
  });

  test('modifier bodies: national values, event and static modifiers', () => {
    assert.deepStrictEqual(codes('nv_order = { supply_limit = 1 icon = 2 }', 'nationalValues', 'common/nationalvalues.txt'), []);
    assert.ok(codes('m = { supply_limitt = 1 }', 'eventModifiers', 'common/event_modifiers.txt').includes('unknown-modifier-key'));
    assert.ok(codes('not_a_static = { war_exhaustion = 1 }', 'staticModifiers', 'common/static_modifiers.txt').includes('unknown-static-modifier'));
    assert.deepStrictEqual(codes('war = { war_exhaustion = 0.1 }', 'staticModifiers', 'common/static_modifiers.txt'), []);
  });

  test('traits: personality/background sets of leader stats', () => {
    assert.deepStrictEqual(codes('personality = { earnest = { attack = 1 morale = 0.1 } }', 'traits', 'common/traits.txt'), []);
    assert.ok(codes('personality = { earnest = { atack = 1 } }', 'traits', 'common/traits.txt').includes('unknown-trait-stat'));
    assert.ok(codes('quirks = { }', 'traits', 'common/traits.txt').includes('unknown-field'));
  });

  test('production types: bare employee blocks and state-scope bonus triggers', () => {
    const text = 'factory_template = { efficiency = { grain = 0.25 } owner = { poptype = farmers effect = input } employees = { { poptype = farmers amount = 0.8 } } bonus = { trigger = { is_slave = yes } value = 0.1 } workforce = 10000 }';
    assert.deepStrictEqual(codes(text, 'productionTypes', 'common/production_types.txt'), []);
    assert.ok(codes('x = { employees = { { poptipe = farmers } } }', 'productionTypes', 'common/production_types.txt').includes('unknown-field'));
  });

  test('pop chances, bookmarks, and technology folders/schools', () => {
    assert.deepStrictEqual(codes('promotion_chance = { factor = 1 modifier = { factor = 2 literacy = 0.5 } }', 'popChances', 'common/pop_types.txt'), []);
    assert.ok(codes('promotion_chanse = { factor = 1 }', 'popChances', 'common/pop_types.txt').includes('unknown-pop-chance'));
    assert.deepStrictEqual(codes('bookmark = { name = "GC" date = 1836.1.1 }', 'bookmarks', 'common/bookmarks.txt'), []);
    assert.deepStrictEqual(codes('folders = { army_tech = { army_doctrine } navy_tech = { naval_doctrine } } schools = { s = { supply_limit = 1 } }', 'techFolders', 'common/technology.txt'), []);
    assert.ok(codes('schools = { s = { nope = 1 } }', 'techFolders', 'common/technology.txt').includes('unknown-modifier-key'));
  });

  test('country definitions: color, graphical culture, parties, unit names', () => {
    const text = 'color = { 1 2 3 } graphical_culture = Generic party = { name = "x" start_date = 1836.1.1 end_date = 1936.1.1 ideology = liberal slavery = yes_slavery } unit_names = { infantry = { "1st" "2nd" } }';
    assert.deepStrictEqual(codes(text, 'countryDefinition', 'common/countries/England.txt'), []);
    assert.ok(codes('graphical_culture = Martian', 'countryDefinition', 'common/countries/E.txt').includes('unknown-graphicalculture'));
    assert.ok(codes('party = { slavery = maybe }', 'countryDefinition', 'common/countries/E.txt').includes('unknown-reform-option'));
    // `<issue> = no_position_set`-style cross-class values are legal in party bodies.
    assert.deepStrictEqual(codes('party = { trade_policy = no_slavery }', 'countryDefinition', 'common/countries/E.txt'), []);
    assert.ok(codes('unit_names = { tanks = { } }', 'countryDefinition', 'common/countries/E.txt').includes('unknown-unit'));
  });

  test('crime and issue option bodies validate modifier keys and rules', () => {
    assert.deepStrictEqual(codes('crime = { active = yes supply_limit = -1 trigger = { is_coastal = yes } }', 'crime', 'common/crime.txt'), []);
    assert.ok(codes('crime = { suply_limit = -1 }', 'crime', 'common/crime.txt').includes('unknown-modifier-key'));
    const issue = 'political_reforms = { slavery = { no_slavery = { rules = { slavery_allowed = no } is_jingoism = no max_tax = 0.1 } } }';
    assert.deepStrictEqual(codes(issue, 'issues', 'common/issues.txt'), []);
    assert.ok(codes('political_reforms = { slavery = { no_slavery = { rules = { slaverry = no } } } }', 'issues', 'common/issues.txt').includes('unknown-rule'));
  });
});
