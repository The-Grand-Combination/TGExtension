import * as assert from 'node:assert';
import { classifyFile } from '../../model/fileType.js';

suite('fileType — classifyFile', () => {
  test('classifies mod-root-relative paths', () => {
    assert.strictEqual(classifyFile('events/Flavor.txt'), 'event');
    assert.strictEqual(classifyFile('decisions/GEF.txt'), 'decision');
    assert.strictEqual(classifyFile('common/cb_types.txt'), 'cbType');
    assert.strictEqual(classifyFile('common/countries/England.txt'), 'countryDefinition');
    assert.strictEqual(classifyFile('common/graphicalculturetype.txt'), 'graphicalCulture');
    assert.strictEqual(classifyFile('common/country_colors.txt'), 'countryColors');
    assert.strictEqual(classifyFile('common/cultures.txt'), 'cultures');
    assert.strictEqual(classifyFile('common/pop_types.txt'), 'popChances');
    assert.strictEqual(classifyFile('common/technology.txt'), 'techFolders');
    assert.strictEqual(classifyFile('f:/steamapps/common/V2/mod/X/common/countries/England.txt'), 'countryDefinition');
    assert.strictEqual(classifyFile('poptypes/farmers.txt'), 'popType');
    assert.strictEqual(classifyFile('technologies/army_tech.txt'), 'technology');
    assert.strictEqual(classifyFile('inventions/army_inventions.txt'), 'invention');
    assert.strictEqual(classifyFile('news/news_battle_over.txt'), 'newsScript');
    assert.strictEqual(classifyFile('history/countries/ENG - England.txt'), 'historyCountry');
    assert.strictEqual(classifyFile('history/diplomacy/Alliances.txt'), 'historyDiplomacy');
    assert.strictEqual(classifyFile('history/pops/1836.1.1/africa.txt'), 'historyPops');
  });

  test('classifies map files by name', () => {
    assert.strictEqual(classifyFile('map/default.map'), 'mapDefault');
    assert.strictEqual(classifyFile('map/definition.csv'), 'mapDefinition');
    assert.strictEqual(classifyFile('map/adjacencies.csv'), 'mapAdjacencies');
    assert.strictEqual(classifyFile('map/region.txt'), 'mapRegion');
    assert.strictEqual(classifyFile('map/region_sea.txt'), 'mapRegion');
    assert.strictEqual(classifyFile('map/super_region.txt'), 'mapRegion');
    assert.strictEqual(classifyFile('map/continent.txt'), 'mapContinent');
    assert.strictEqual(classifyFile('map/climate.txt'), 'mapClimate');
    assert.strictEqual(classifyFile('map/terrain.txt'), 'mapTerrain');
    assert.strictEqual(classifyFile('map/positions.txt'), 'mapPositions');
    assert.strictEqual(classifyFile('map/province_flag_sprites/suez_canal.txt'), 'mapOther');
    assert.strictEqual(classifyFile('map/trees.txt'), 'mapOther');
    assert.strictEqual(classifyFile('map/other.csv'), 'unknown');
    assert.strictEqual(classifyFile('map/provinces.bmp'), 'unknown');
    assert.strictEqual(classifyFile('f:/SteamLibrary/steamapps/common/Victoria 2/mod/TGC/map/Region.txt'), 'mapRegion');
  });

  test('ignores files that are not .txt, .csv, or .map even inside mod folders', () => {
    assert.strictEqual(classifyFile('history/pops/pops-updator.vbs'), 'unknown');
    assert.strictEqual(classifyFile('events/notes.md'), 'unknown');
    assert.strictEqual(classifyFile('decisions/backup.txt.bak'), 'unknown');
    assert.strictEqual(classifyFile('common/defines.lua'), 'unknown');
    assert.strictEqual(classifyFile('history/pops/1836.1.1/africa.csv'), 'unknown');
    assert.strictEqual(classifyFile('map/definition.csv'), 'mapDefinition');
  });

  test('an unrelated common/ segment (steamapps) does not win over the mod folder', () => {
    const root = 'f:/SteamLibrary/steamapps/common/Victoria 2/mod/TGC';
    assert.strictEqual(classifyFile(`${root}/history/diplomacy/Alliances.txt`), 'historyDiplomacy');
    assert.strictEqual(classifyFile(`${root}/poptypes/farmers.txt`), 'popType');
    assert.strictEqual(classifyFile(`${root}/news/news_fake_default.txt`), 'newsScript');
    assert.strictEqual(classifyFile(`${root}/common/cb_types.txt`), 'cbType');
    assert.strictEqual(classifyFile(`${root}/common/countries/England.txt`), 'countryDefinition');
  });

  test('classifies file URIs with percent-encoded segments', () => {
    assert.strictEqual(
      classifyFile('file:///f%3A/SteamLibrary/steamapps/common/Victoria%202/mod/TGC/history/wars/civil.txt'),
      'historyWars',
    );
    assert.strictEqual(
      classifyFile('file:///f%3A/SteamLibrary/steamapps/common/Victoria%202/mod/TGC/events/ACW.txt'),
      'event',
    );
  });
});
