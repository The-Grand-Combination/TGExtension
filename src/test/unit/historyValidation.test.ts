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

suite('historyValidation — history files', () => {
  test('country history: fields, reforms, techs, and dated blocks', () => {
    const text = `capital = 619 primary_culture = north_german government = democracy
      slavery = yes_slavery flintlock_rifles = 1
      political_reform = no_slavery economic_reform = yes_land_reform
      1836.1.1 = { military_reform = yes_land_reform }
      1834.1.1 = { clr_country_flag = fathalishah set_country_flag = mohammadshah clr_global_flag = old_era }
      upper_house = { conservative = 0.6 liberal = 0.4 }
      foreign_investment = { ENG = 1000 }
      oob = "ENG_oob.txt"
      1861.1.1 = { government = absolute_monarchy prestige = 5 }`;
    assert.deepStrictEqual(codes(text, 'historyCountry', 'history/countries/ENG - England.txt'), []);
    assert.ok(codes('capitall = 619', 'historyCountry', 'history/countries/E.txt').includes('unknown-country-history-key'));
    assert.ok(codes('slavery = maybe_slavery', 'historyCountry', 'history/countries/E.txt').includes('unknown-reform-option'));
    assert.ok(
      codes('military_reform = nonsense', 'historyCountry', 'history/countries/E.txt').includes('unknown-reformoption'),
    );
  });

  test('province history: fields, buildings, and dated blocks', () => {
    const text = `owner = ENG controller = ENG add_core = FRA trade_goods = grain
      life_rating = 35 fort = 1 terrain = arctic
      state_building = { level = 1 building = steel_factory upgrade = yes }
      1861.1.1 = { owner = FRA }`;
    assert.deepStrictEqual(codes(text, 'historyProvince', 'history/provinces/e/619 - Test.txt'), []);
    assert.ok(codes('trade_goods = graain', 'historyProvince', 'history/provinces/x.txt').includes('unknown-good'));
    assert.ok(codes('fart = 1', 'historyProvince', 'history/provinces/x.txt').includes('unknown-province-history-key'));
  });

  test('province history: --- and null mean no owner', () => {
    assert.deepStrictEqual(codes('owner = ---\ncontroller = ---', 'historyProvince', 'history/provinces/x.txt'), []);
    assert.deepStrictEqual(codes('owner = null', 'historyProvince', 'history/provinces/x.txt'), []);
    assert.deepStrictEqual(codes('add_core = ---', 'historyProvince', 'history/provinces/x.txt'), ['unknown-country']);
  });

  test('pops history: province ids, pop types, and pop fields', () => {
    const text = '619 = { farmers = { culture = north_german religion = catholic size = 100 rebel_type = jacobin } }';
    assert.deepStrictEqual(codes(text, 'historyPops', 'history/pops/1836.1.1/x.txt'), []);
    assert.ok(codes('9999 = { }', 'historyPops', 'history/pops/1836.1.1/x.txt').includes('unknown-province'));
    assert.ok(
      codes('619 = { farmerss = { size = 1 } }', 'historyPops', 'history/pops/1836.1.1/x.txt').includes('unknown-poptype'),
    );
  });

  test('diplomacy history: relation kinds and fields', () => {
    const text = 'alliance = { first = ENG second = FRA start_date = 1836.1.1 end_date = 1936.1.1 }';
    assert.deepStrictEqual(codes(text, 'historyDiplomacy', 'history/diplomacy/Alliances.txt'), []);
    assert.ok(
      codes('guarantee = { first = ENG second = FRA }', 'historyDiplomacy', 'history/diplomacy/x.txt').includes('unknown-diplomacy-key'),
    );
  });

  test('units history: relationships, leaders, and armies', () => {
    const text = `ENG = { value = 50 }
      leader = { name = "X" type = land date = 1836.1.1 personality = earnest background = school_of_defense prestige = 0.1 }
      army = { name = "A" location = 619 regiment = { name = "R" type = infantry home = 619 } }`;
    assert.deepStrictEqual(codes(text, 'historyUnits', 'history/units/ENG_oob.txt'), []);
    assert.ok(codes('blah = { value = 1 }', 'historyUnits', 'history/units/x.txt').includes('unknown-oob-key'));
  });

  test('wars history: date blocks and war goals', () => {
    const text = `name = "A War"
      1861.1.1 = { add_attacker = ENG add_defender = FRA war_goal = { casus_belli = acquire_all_cores actor = ENG receiver = FRA } }`;
    assert.deepStrictEqual(codes(text, 'historyWars', 'history/wars/x.txt'), []);
    assert.ok(
      codes('1861.1.1 = { add_attacker = QQQ }', 'historyWars', 'history/wars/x.txt').includes('unknown-country'),
    );
  });
});
