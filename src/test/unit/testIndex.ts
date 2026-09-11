import type { ModIndex } from '../../model/modIndex.js';
import { buildModIndex, type ModFileProvider } from '../../services/modIndex.js';

/** In-memory mod file provider for tests. Keys are forward-slash relative paths. */
export function fakeProvider(files: Readonly<Record<string, string>>): ModFileProvider {
  return {
    readFile: (relativePath: string): string | undefined => files[relativePath.replace(/\\/g, '/')],
    listFiles: (relativeDirectory: string, extension: string): string[] => {
      const prefix = `${relativeDirectory.replace(/\\/g, '/')}/`;
      return Object.keys(files)
        .filter((key) => key.startsWith(prefix) && key.endsWith(extension) && !key.slice(prefix.length).includes('/'))
        .map((key) => key.slice(prefix.length));
    },
    listFilesRecursive: (relativeFolder: string): string[] => {
      const prefix = `${relativeFolder.replace(/\\/g, '/')}/`;
      return Object.keys(files).filter((key) => key.startsWith(prefix));
    },
  };
}

/** A small but complete mod used across the semantic tests. */
export function buildTestIndex(extraFiles: Readonly<Record<string, string>> = {}): ModIndex {
  return buildModIndex(
    fakeProvider({
      'common/countries.txt': 'ENG = "countries/England.txt"\nFRA = "countries/France.txt"\nREB = "countries/Rebels.txt"\n',
      'common/cultures.txt': 'germanic = { north_german = { color = { 1 2 3 } } south_german = { color = { 1 2 3 } } }\n',
      'common/religion.txt': 'christian = { catholic = { icon = 1 } protestant = { icon = 2 } }\n',
      'common/goods.txt': 'military_goods = { small_arms = { cost = 32 } } raw = { grain = { cost = 1 } }\n',
      'common/ideologies.txt': 'conservative_group = { conservative = { color = { 1 1 1 } } liberal = { color = { 2 2 2 } } }\n',
      'common/governments.txt': 'democracy = { flagType = republic }\nabsolute_monarchy = { flagType = monarchy }\n',
      'common/buildings.txt': 'fort = { type = fort }\nsteel_factory = { type = factory }\n',
      'common/nationalvalues.txt': 'nv_order = { }\nnv_liberty = { }\n',
      'common/cb_types.txt': 'acquire_all_cores = { }\n',
      'common/crime.txt': 'machine_politics = { }\n',
      'common/rebel_types.txt': 'jacobin = { icon = 1 }\n',
      'common/graphicalculturetype.txt': 'Generic\nBritishGC\n',
      'common/event_modifiers.txt': 'the_great_modifier = { icon = 5 }\n',
      'common/triggered_modifiers.txt': 'triggered_thing = { trigger = { } }\n',
      'common/issues.txt':
        'party_issues = { trade_policy = { protectionism = { } free_trade = { } } }\n' +
        'political_reforms = { slavery = { yes_slavery = { } no_slavery = { } } }\n' +
        'economic_reforms = { land_reform = { no_land_reform = { } yes_land_reform = { } } }\n',
      'common/traits.txt': 'personality = { earnest = { } } background = { school_of_defense = { } }\n',
      'poptypes/farmers.txt': 'strata = poor\n',
      'poptypes/soldiers.txt': 'strata = poor\n',
      'map/default.map': 'max_provinces = 1000\nsea_starts = { 900 901 }\n',
      'map/definition.csv':
        ';r;g;b;x;x\n1;1;1;1;One;x\n2;1;1;2;Two;x\n3;1;1;3;Three;x\n619;2;2;2;Milan;x\n' +
        '900;3;3;3;Sea One;x\n901;3;3;4;Sea Two;x\n',
      'map/region.txt': 'ENG_1 = { 1 2 }\nITA_619 = { 619 }\n',
      'map/super_region.txt': 'BIG_META = { 1 2 619 }\n',
      'map/continent.txt': 'europe = { provinces = { 1 2 619 } }\n',
      'map/climate.txt': 'temperate_climate = { farm_rgo_size = 0 }\ntemperate_climate = { 1 2 }\n',
      'map/terrain.txt':
        'terrain = 64\ncategories = { arctic = { color = { 1 2 3 } } desert = { color = { 4 5 6 } } }\n' +
        'text_0 = { type = arctic color = { 0 } priority = 0 }\n',
      'technologies/army_tech.txt': 'flintlock_rifles = { year = 1836 }\n',
      'inventions/army_inventions.txt': 'field_fortifications = { limit = { } }\n',
      'units/infantry.txt': 'infantry = { type = land }\n',
      'events/Existing.txt':
        'country_event = { id = 100 title = "t" desc = "d" option = { name = "o" set_country_flag = known_flag set_global_flag = known_global } }\n',
      'decisions/Existing.txt': 'political_decisions = { taken_name = { potential = { } effect = { } } }\n',
      'localisation/00_test.csv':
        'CODE;ENGLISH;x\n' +
        't;Title;x\nd;Description;x\no;Okay;x\n' +
        'EVTNAME100;The Event;x\n' +
        'my_decision_title;My Decision;x\nmy_decision_desc;Does things;x\n' +
        'taken_name_title;Taken;x\ntaken_name_desc;Taken desc;x\n',
      'gfx/pictures/events/Slaves.tga': '',
      'gfx/pictures/decisions/cavours_diplomacy.dds': '',
      ...extraFiles,
    }),
  );
}
