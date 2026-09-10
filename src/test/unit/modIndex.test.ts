import * as assert from 'node:assert';
import { duplicateDiagnosticsByFile } from '../../services/duplicateDiagnostics.js';
import { hasIdentifier } from '../../services/modIndex.js';
import { buildTestIndex } from './testIndex.js';

suite('modIndex', () => {
  const index = buildTestIndex();

  test('indexes country tags plus THIS/FROM', () => {
    assert.ok(hasIdentifier(index, 'country', 'ENG'));
    assert.ok(hasIdentifier(index, 'country', 'this'));
    assert.ok(hasIdentifier(index, 'country', 'FROM'));
    assert.ok(!hasIdentifier(index, 'country', 'XYZ'));
    assert.ok(!hasIdentifier(index, 'country', 'dynamic_tags'));
  });

  test('indexes group-then-item categories', () => {
    assert.ok(hasIdentifier(index, 'culture', 'north_german'));
    assert.ok(hasIdentifier(index, 'cultureGroup', 'germanic'));
    assert.ok(!hasIdentifier(index, 'culture', 'germanic'));
    assert.ok(hasIdentifier(index, 'religion', 'catholic'));
    assert.ok(hasIdentifier(index, 'good', 'grain'));
    assert.ok(hasIdentifier(index, 'ideology', 'liberal'));
    assert.ok(hasIdentifier(index, 'trait', 'earnest'));
  });

  test('indexes top-level categories and merges modifiers', () => {
    assert.ok(hasIdentifier(index, 'government', 'democracy'));
    assert.ok(hasIdentifier(index, 'building', 'steel_factory'));
    assert.ok(hasIdentifier(index, 'nationalValue', 'nv_order'));
    assert.ok(hasIdentifier(index, 'cbType', 'acquire_all_cores'));
    assert.ok(hasIdentifier(index, 'modifier', 'the_great_modifier'));
    assert.ok(hasIdentifier(index, 'modifier', 'triggered_thing'));
  });

  test('indexes issues into classes, options, and party issues', () => {
    assert.ok(hasIdentifier(index, 'reformClass', 'slavery'));
    assert.ok(hasIdentifier(index, 'reformClass', 'trade_policy'));
    assert.ok(hasIdentifier(index, 'reformOption', 'yes_slavery'));
    assert.ok(hasIdentifier(index, 'issue', 'protectionism'));
    // Reform positions double as issues (pop support triggers, dominant_issue).
    assert.ok(hasIdentifier(index, 'issue', 'yes_slavery'));
    assert.deepStrictEqual(
      [...(index.reformOptionsByClass.get('slavery') ?? [])].sort(),
      ['no_slavery', 'yes_slavery'],
    );
  });

  test('option pools follow NCE: issues share one pool, economic/military reforms another', () => {
    assert.deepStrictEqual(
      [...(index.optionPoolByClass.get('slavery') ?? [])].sort(),
      ['free_trade', 'no_slavery', 'protectionism', 'yes_slavery'],
    );
    assert.strictEqual(index.optionPoolByClass.get('trade_policy'), index.optionPoolByClass.get('slavery'));
    assert.deepStrictEqual(
      [...(index.optionPoolByClass.get('land_reform') ?? [])].sort(),
      ['no_land_reform', 'yes_land_reform'],
    );
  });

  test('indexes pop types from file names', () => {
    assert.ok(hasIdentifier(index, 'popType', 'farmers'));
    assert.ok(!hasIdentifier(index, 'popType', 'aristocrats'));
  });

  test('indexes map data', () => {
    assert.ok(hasIdentifier(index, 'province', '619'));
    assert.ok(!hasIdentifier(index, 'province', '9999'));
    assert.ok(hasIdentifier(index, 'stateRegion', 'eng_1'));
    assert.ok(hasIdentifier(index, 'continent', 'europe'));
    assert.ok(hasIdentifier(index, 'terrain', 'arctic'));
  });

  test('reads max_provinces and sea_starts from default.map', () => {
    assert.strictEqual(index.maxProvinces, 1000);
    assert.deepStrictEqual([...index.seaProvinces].sort(), ['900', '901']);
    const without = buildTestIndex({ 'map/default.map': '' });
    assert.strictEqual(without.maxProvinces, undefined);
    assert.strictEqual(without.seaProvinces.size, 0);
  });

  test('meta-regions from super_region.txt are valid region names', () => {
    assert.ok(hasIdentifier(index, 'stateRegion', 'big_meta'));
  });

  test('a region name shared by region.txt and super_region.txt is not a duplicate', () => {
    const mirrored = buildTestIndex({ 'map/super_region.txt': 'ENG_1 = { 1 2 }\n' });
    assert.deepStrictEqual(mirrored.duplicates, []);
    const doubled = buildTestIndex({ 'map/region.txt': 'ENG_1 = { 1 }\nENG_1 = { 2 }\n' });
    assert.strictEqual(doubled.duplicates.find((entry) => entry.category === 'stateRegion')?.name, 'eng_1');
  });

  test('replays state assignment: meta-regions claim nothing, mixed blocks claim the rest', () => {
    assert.strictEqual(index.stateOfProvince.get('1'), 'eng_1');
    assert.strictEqual(index.stateOfProvince.get('619'), 'ita_619');
    const mixed = buildTestIndex({ 'map/super_region.txt': 'MIXED = { 1 3 }\n' });
    assert.strictEqual(mixed.stateOfProvince.get('1'), 'eng_1');
    assert.strictEqual(mixed.stateOfProvince.get('3'), 'mixed');
  });

  test('indexes technologies, inventions, and units', () => {
    assert.ok(hasIdentifier(index, 'technology', 'flintlock_rifles'));
    assert.ok(hasIdentifier(index, 'invention', 'field_fortifications'));
    assert.ok(hasIdentifier(index, 'unit', 'infantry'));
  });

  test('indexes event ids with their occurrences', () => {
    assert.ok(index.eventOccurrences.has('100'));
    assert.strictEqual(index.eventOccurrences.get('100')?.length, 1);
    assert.strictEqual(index.eventOccurrences.get('100')?.[0]?.filePath, 'events/Existing.txt');
  });

  test('indexes decision names with their occurrences', () => {
    assert.strictEqual(index.decisionOccurrences.get('taken_name')?.[0]?.filePath, 'decisions/Existing.txt');
  });

  test('indexes localisation keys with definition sites', () => {
    assert.ok(hasIdentifier(index, 'locKey', 'EVTNAME100'));
    const definition = index.locKeyDefinitions.get('evtname100');
    assert.ok(definition, 'expected a loc key definition');
    assert.strictEqual(definition.filePath, 'localisation/00_test.csv');
    assert.strictEqual(definition.line, 4);
    assert.strictEqual(definition.length, 'EVTNAME100'.length);
  });

  test('indexes event and decision pictures without extensions', () => {
    assert.ok(hasIdentifier(index, 'eventPicture', 'Slaves'));
    assert.ok(hasIdentifier(index, 'decisionPicture', 'cavours_diplomacy'));
    assert.ok(!hasIdentifier(index, 'eventPicture', 'cavours_diplomacy'));
  });

  test('collects duplicate identifiers with all occurrences', () => {
    const withDuplicate = buildTestIndex({
      'common/buildings.txt': 'fort = { type = fort }\nsteel_factory = { }\nfort = { again = yes }\n',
    });
    const duplicate = withDuplicate.duplicates.find(
      (entry) => entry.category === 'building' && entry.name === 'fort',
    );
    assert.ok(duplicate, 'expected a duplicate for fort');
    assert.strictEqual(duplicate.occurrences.length, 2);
  });

  test('has no duplicates in the clean fixture', () => {
    assert.deepStrictEqual(index.duplicates, []);
  });

  test('modifier shared across files is a warning about localization', () => {
    const shared = buildTestIndex({
      'common/event_modifiers.txt': 'the_great_modifier = { icon = 5 }\nshared_name = { icon = 1 }\n',
      'common/triggered_modifiers.txt': 'shared_name = { trigger = { } }\n',
    });
    const byFile = duplicateDiagnosticsByFile(shared);
    const first = byFile.get('common/event_modifiers.txt')?.[0];
    assert.ok(first, 'expected a diagnostic on event_modifiers.txt');
    assert.strictEqual(first.severity, 'warning');
    assert.strictEqual(first.code, 'duplicate-modifier-name');
    assert.ok(first.message.includes('localization may be confused'), first.message);
  });

  test('modifier duplicated inside one file is still an error', () => {
    const doubled = buildTestIndex({
      'common/event_modifiers.txt': 'twice = { icon = 1 }\ntwice = { icon = 2 }\n',
    });
    const first = duplicateDiagnosticsByFile(doubled).get('common/event_modifiers.txt')?.[0];
    assert.ok(first, 'expected a diagnostic');
    assert.strictEqual(first.severity, 'error');
    assert.strictEqual(first.code, 'duplicate-identifier');
  });

  test('non-modifier duplicates stay errors', () => {
    const withDuplicate = buildTestIndex({
      'common/buildings.txt': 'fort = { }\nfort = { }\n',
    });
    const byFile = duplicateDiagnosticsByFile(withDuplicate);
    assert.strictEqual(byFile.get('common/buildings.txt')?.[0]?.severity, 'error');
  });

  test('tolerates missing files with empty categories', () => {
    const sparse = buildTestIndex();
    assert.ok(!hasIdentifier(sparse, 'crime', 'nonexistent'));
  });
});
