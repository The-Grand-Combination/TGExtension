import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateMapCsv } from '../../services/mapCsvValidation.js';
import { validateSemantics } from '../../services/semanticValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

function codes(text: string, fileType: FileType, currentFile = 'map/region.txt'): string[] {
  const { document } = parseDocument(text);
  return validateSemantics(document, fileType, index, currentFile).map((item) => item.code);
}

function csvCodes(text: string, fileType: FileType): string[] {
  return validateMapCsv(text, fileType, index).map((item) => item.code);
}

suite('mapValidation — default.map', () => {
  test('accepts the vanilla shape', () => {
    const text =
      'max_provinces = 1000\nsea_starts = { 900 901 }\ndefinitions = "definition.csv"\nprovinces = "provinces.bmp"\n' +
      'border_heights = { 500 800 }\nterrain_sheet_heights = { 500 }\ntree = 350\nborder_cutoff = 2200.0\n';
    assert.deepStrictEqual(codes(text, 'mapDefault', 'map/default.map'), []);
  });

  test('flags unknown fields, missing max_provinces, and sea ids out of range', () => {
    assert.deepStrictEqual(codes('max_provinces = 1000\ntrees = 1\n', 'mapDefault'), ['unknown-field']);
    assert.deepStrictEqual(codes('sea_starts = { 900 }\n', 'mapDefault'), ['missing-field']);
    assert.deepStrictEqual(
      codes('max_provinces = 900\nsea_starts = { 900 }\n', 'mapDefault'),
      ['province-id-too-large'],
    );
    assert.deepStrictEqual(codes('max_provinces = 1000\nsea_starts = { 900 900 }\n', 'mapDefault'), ['duplicate-province']);
    assert.deepStrictEqual(codes('max_provinces = 1000\nsea_starts = { 999 }\n', 'mapDefault'), ['unknown-province']);
  });
});

suite('mapValidation — region files', () => {
  test('accepts states, empty meta-regions, and pure meta-regions', () => {
    assert.deepStrictEqual(codes('ENG_1 = { 1 2 }\nITA_619 = { 619 }\nEMPTY = { }\n', 'mapRegion'), []);
    assert.deepStrictEqual(codes('BIG_META = { 1 2 619 }\n', 'mapRegion', 'map/super_region.txt'), []);
  });

  test('flags unknown provinces, duplicates, and non-id entries', () => {
    assert.deepStrictEqual(codes('ENG_1 = { 1 999 }\n', 'mapRegion'), ['unknown-province']);
    assert.deepStrictEqual(codes('ENG_1 = { 1 9999 }\n', 'mapRegion'), ['province-id-too-large']);
    assert.deepStrictEqual(codes('ENG_1 = { 1 1 }\n', 'mapRegion'), ['duplicate-province']);
    assert.deepStrictEqual(codes('ENG_1 = { provinces = { 1 } }\n', 'mapRegion'), ['unknown-field']);
    assert.deepStrictEqual(codes('ENG_1 = { 1 }\n5\n', 'mapRegion'), ['stray-value']);
  });

  test('warns when a block mixes provinces already in a state with unassigned ones', () => {
    assert.deepStrictEqual(codes('MIXED = { 1 3 }\n', 'mapRegion', 'map/super_region.txt'), ['state-mixes-provinces']);
  });

  test('warns about sea zones inside a state, except in region_sea.txt', () => {
    assert.deepStrictEqual(codes('SEA_1 = { 900 }\n', 'mapRegion'), ['sea-province-in-state']);
    assert.deepStrictEqual(codes('SEA_1 = { 900 }\n', 'mapRegion', 'map/region_sea.txt'), []);
  });
});

suite('mapValidation — continent.txt and climate.txt', () => {
  test('accepts provinces lists with modifier values', () => {
    const text = 'europe = { provinces = { 1 2 } assimilation_rate = -0.25 farm_rgo_size = 10 }\nasia = { 619 }\n';
    assert.deepStrictEqual(codes(text, 'mapContinent', 'map/continent.txt'), []);
  });

  test('flags unknown modifiers and double assignment', () => {
    assert.deepStrictEqual(codes('europe = { provinces = { 1 } assimilate = 1 }\n', 'mapContinent'), ['unknown-modifier-key']);
    assert.deepStrictEqual(
      codes('europe = { provinces = { 1 } }\nasia = { provinces = { 1 } }\n', 'mapContinent'),
      ['province-already-assigned'],
    );
    assert.deepStrictEqual(codes('europe = { provinces = { 1 1 } }\n', 'mapContinent'), ['duplicate-province']);
    assert.deepStrictEqual(codes('europe = { provinces = { x = 1 } }\n', 'mapContinent'), ['unknown-field']);
  });

  test('climate blocks may be split between values and provinces', () => {
    const text = 'temperate_climate = { farm_rgo_size = 0 max_attrition = 5 }\ntemperate_climate = { 1 2 }\narid_climate = { 3 }\n';
    assert.deepStrictEqual(codes(text, 'mapClimate', 'map/climate.txt'), []);
    assert.deepStrictEqual(codes('a = { 1 }\nb = { 1 }\n', 'mapClimate'), ['province-already-assigned']);
    assert.deepStrictEqual(codes('a = { bogus = 1 }\n', 'mapClimate'), ['unknown-modifier-key']);
  });
});

suite('mapValidation — terrain.txt', () => {
  const categories =
    'terrain = 64\ncategories = {\n ocean = { movement_cost = 1.0 is_water = yes color = { 0 0 255 } }\n' +
    ' plains = { attrition = 0 defence = 0 farm_rgo_size = 0.2 min_build_fort = 0 color = { 1 2 3 } }\n}\n';

  test('accepts categories and palette entries', () => {
    const text = `${categories}ocean1 = { type = ocean color = { 254 } }\ntext_0 = { type = plains color = { 0 } priority = 0 }\npti = { type = plains color = { 64 65 } has_texture = no }\n`;
    assert.deepStrictEqual(codes(text, 'mapTerrain', 'map/terrain.txt'), []);
  });

  test('flags bad category fields, unknown palette types, and duplicate indices', () => {
    assert.deepStrictEqual(codes('categories = { plains = { colour = { 1 2 3 } } }\n', 'mapTerrain'), ['unknown-modifier-key']);
    assert.deepStrictEqual(codes('categories = { plains = { color = { 1 2 } } }\n', 'mapTerrain'), ['invalid-color']);
    assert.deepStrictEqual(codes(`${categories}t = { type = plain color = { 0 } }\n`, 'mapTerrain'), ['unknown-terrain']);
    assert.deepStrictEqual(
      codes(`${categories}a = { type = plains color = { 0 } }\nb = { type = plains color = { 0 } }\n`, 'mapTerrain'),
      ['duplicate-palette-index'],
    );
    assert.deepStrictEqual(codes(`${categories}a = { type = plains color = { 300 } }\n`, 'mapTerrain'), ['invalid-value']);
    assert.deepStrictEqual(codes(`${categories}a = { type = plains colour = { 1 } }\n`, 'mapTerrain'), ['unknown-field']);
  });
});

suite('mapValidation — positions.txt', () => {
  test('accepts province position blocks', () => {
    const text =
      '1 = { text_position = { x = 1.5 y = 2 } text_rotation = 0.1 text_scale = 6 unit = { x = 1 y = 2 } ' +
      'building_position = { fort = { x = 1 y = 2 } } city = { x = 1 y = 1 } }\n';
    assert.deepStrictEqual(codes(text, 'mapPositions', 'map/positions.txt'), []);
  });

  test('flags unknown provinces, unknown fields, and repeated blocks', () => {
    assert.deepStrictEqual(codes('999 = { text_scale = 1 }\n', 'mapPositions'), ['unknown-province']);
    assert.deepStrictEqual(codes('sitka = { text_scale = 1 }\n', 'mapPositions'), ['unknown-field']);
    assert.deepStrictEqual(codes('1 = { text_scale = big }\n', 'mapPositions'), ['invalid-value']);
    assert.deepStrictEqual(codes('1 = { text_position = { z = 1 } }\n', 'mapPositions'), ['unknown-field']);
    assert.deepStrictEqual(codes('1 = { label = { } }\n', 'mapPositions'), ['unknown-field']);
    assert.deepStrictEqual(codes('1 = { }\n1 = { }\n', 'mapPositions'), ['duplicate-province']);
  });
});

suite('mapCsvValidation — definition.csv', () => {
  test('accepts rows, dead lake rows, and comments', () => {
    const text = 'province;red;green;blue;x;x\n1;204;229;152;Sitka;x\r\n2;204;179;153;Juneau;x\n;1;222;200;Unnamed Lakes;x\n# note\n\n';
    assert.deepStrictEqual(csvCodes(text, 'mapDefinition'), []);
  });

  test('flags short rows, bad ids, bad colors, and duplicate colors', () => {
    assert.deepStrictEqual(csvCodes('h\n1;2;3\n', 'mapDefinition'), ['csv-too-few-fields']);
    assert.deepStrictEqual(csvCodes('h\nabc;1;2;3;x;x\n', 'mapDefinition'), ['invalid-value']);
    assert.deepStrictEqual(csvCodes('h\n1000;1;2;3;x;x\n', 'mapDefinition'), ['province-id-too-large']);
    assert.deepStrictEqual(csvCodes('h\n1;256;2;3;x;x\n', 'mapDefinition'), ['invalid-color']);
    assert.deepStrictEqual(csvCodes('h\n1;1;2;3;x;x\n2;1;2;3;y;x\n', 'mapDefinition'), ['duplicate-color']);
  });
});

suite('mapCsvValidation — adjacencies.csv', () => {
  const header = 'From;To;Type;Through;Data;Comment\n';

  test('accepts sea, land, impassable, and canal rows', () => {
    const text = `${header}1;2;sea;900;0;Strait\n1;619;land;0;0;Bridge\n2;619;impassable;0;0;Wall\n1;3;canal;619;1;Canal\n3;-1;impassable;0;0;Solo\n#1;2;sea;900;0;off\n`;
    assert.deepStrictEqual(csvCodes(text, 'mapAdjacencies'), []);
  });

  test('flags unknown provinces, types, and canal data', () => {
    assert.deepStrictEqual(csvCodes(`${header}1;999;sea;900;0;x\n`, 'mapAdjacencies'), ['unknown-province']);
    assert.deepStrictEqual(csvCodes(`${header}1;9999;sea;900;0;x\n`, 'mapAdjacencies'), ['province-id-too-large']);
    assert.deepStrictEqual(csvCodes(`${header}1;2;strait;900;0;x\n`, 'mapAdjacencies'), ['unknown-adjacency-type']);
    assert.deepStrictEqual(csvCodes(`${header}1;2;sea;619;0;x\n`, 'mapAdjacencies'), ['expected-sea-province']);
    assert.deepStrictEqual(csvCodes(`${header}1;2;sea;999;0;x\n`, 'mapAdjacencies'), ['unknown-province']);
    assert.deepStrictEqual(csvCodes(`${header}1;3;canal;619;0;x\n`, 'mapAdjacencies'), ['invalid-canal']);
    assert.deepStrictEqual(csvCodes(`${header}1;3;canal;0;1;x\n`, 'mapAdjacencies'), ['invalid-canal']);
    assert.deepStrictEqual(csvCodes(`${header}1;0;sea;900;0;x\n`, 'mapAdjacencies'), ['ignored-adjacency']);
    assert.deepStrictEqual(csvCodes(`${header}1;2;sea\n`, 'mapAdjacencies'), ['csv-too-few-fields']);
    assert.deepStrictEqual(csvCodes(`${header}a;2;sea;900;0;x\n`, 'mapAdjacencies'), ['invalid-value']);
  });
});
