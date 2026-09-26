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

/** Null tag warnings are off by default, so a rule about them has to ask for them. */
const REPORTING_NULL_TAGS: ValidationOptions = { ...DEFAULT_VALIDATION_OPTIONS, suppressNullTagWarnings: false };

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
    // owner/controller take it silently; elsewhere a null tag is the warning, not
    // an error — and that warning is suppressed by default.
    assert.deepStrictEqual(codes('add_core = ---', 'historyProvince', 'history/provinces/x.txt'), []);
    assert.deepStrictEqual(
      codes('add_core = ---', 'historyProvince', 'history/provinces/x.txt', REPORTING_NULL_TAGS),
      ['null-country-tag'],
    );
    assert.deepStrictEqual(codes('add_core = ZZZ', 'historyProvince', 'history/provinces/x.txt'), ['unknown-country']);
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
    const reparations = 'reparations = { first = ENG second = FRA start_date = 1830.1.1 end_date = 1834.1.1 }';
    assert.deepStrictEqual(codes(reparations, 'historyDiplomacy', 'history/diplomacy/Reparations.txt'), []);
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
      codes('1861.1.1 = { add_attacker = ZZZ }', 'historyWars', 'history/wars/x.txt').includes('unknown-country'),
    );
    assert.ok(
      codes('1861.1.1 = { add_attacker = QQQ }', 'historyWars', 'history/wars/x.txt', REPORTING_NULL_TAGS)
        .includes('null-country-tag'),
    );
  });
});

suite('historyValidation — a capital the country does not own', () => {
  const PROVINCES = {
    'history/provinces/1 - One.txt': 'owner = ENG\n',
    'history/provinces/2 - Two.txt': 'owner = FRA\n',
    'history/provinces/3 - Three.txt': 'owner = ---\n',
  };
  const ENG = 'history/countries/ENG - England.txt';

  function found(text: string, file: string, extra: Readonly<Record<string, string>> = PROVINCES): string[] {
    const { document } = parseDocument(text);
    return validateSemantics(document, 'historyCountry', buildTestIndex(extra), file).map((item) => item.code);
  }

  test('a capital the tag owns is fine', () => {
    assert.deepStrictEqual(found('capital = 1', ENG), []);
  });

  test('a capital another tag owns is an error, on the value', () => {
    const { document } = parseDocument('capital = 2');
    const [finding] = validateSemantics(document, 'historyCountry', buildTestIndex(PROVINCES), ENG);
    assert.strictEqual(finding?.code, 'capital-not-owned');
    assert.strictEqual(finding.severity, 'error');
    assert.match(finding.message, /ENG does not own its capital: province 2 is owned by FRA/);
    assert.strictEqual('capital = 2'.slice(finding.range.start, finding.range.end), '2');
  });

  test('a capital nobody owns is an error too', () => {
    assert.deepStrictEqual(found('capital = 3', ENG), ['capital-not-owned']);
  });

  test('a tag that owns no province is a releasable country, and its capital is left alone', () => {
    assert.deepStrictEqual(found('capital = 2', 'history/countries/SCO - Scotland.txt'), []);
  });

  test('a capital inside a dated block is a later change, not the start', () => {
    assert.deepStrictEqual(found('capital = 1\n1861.1.1 = { capital = 2 }', ENG), []);
  });

  test('the tag comes from the file name, whatever the case', () => {
    assert.deepStrictEqual(found('capital = 2', 'history/countries/eng - England.txt'), ['capital-not-owned']);
  });

  test('without province history in the stack there is nothing to check against', () => {
    assert.deepStrictEqual(found('capital = 2', ENG, {}), []);
  });
});

suite('historyValidation — a war the game cannot load', () => {
  const WAR = 'history/wars/x.txt';
  const war = (text: string): string[] => codes(text, 'historyWars', WAR);

  test('an empty file is an error: the game crashes over it', () => {
    assert.deepStrictEqual(war(''), ['empty-war-history']);
    assert.deepStrictEqual(war('# only a comment\n'), ['empty-war-history']);
  });

  test('a war without an attacker, a defender or a goal is an error naming what is missing', () => {
    assert.deepStrictEqual(war('name = "x"\n1861.1.1 = { add_attacker = ENG }'), ['broken-war-history']);
    const { document } = parseDocument('1861.1.1 = { add_attacker = ENG }');
    const [finding] = validateSemantics(document, 'historyWars', index, WAR);
    assert.match(finding?.message ?? '', /never sets 'add_defender', 'war_goal'/);
    assert.deepStrictEqual(finding?.range, { start: 0, end: 0 });
  });

  test('a name alone is not a war', () => {
    assert.deepStrictEqual(war('name = "The Empty War"'), ['broken-war-history']);
  });

  test('the essentials may be spread over several dated blocks', () => {
    const text = `1861.1.1 = { add_attacker = ENG }
      1861.2.1 = { add_defender = FRA }
      1861.3.1 = { war_goal = { casus_belli = acquire_all_cores actor = ENG receiver = FRA } }`;
    assert.deepStrictEqual(war(text), []);
  });

  test('an attacker at the top level does not count: the engine reads it inside a date', () => {
    assert.deepStrictEqual(
      war('add_attacker = ENG\n1861.1.1 = { add_defender = FRA war_goal = { casus_belli = acquire_all_cores } }'),
      ['broken-war-history', 'unknown-war-key'],
    );
  });
});
