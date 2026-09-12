import * as assert from 'node:assert';
import type { ProvinceHistory } from '../../model/mapEditor.js';
import {
  EMPTY_PROVINCE_HISTORY,
  filterHistoryFolders,
  findHistoryFile,
  historyFoldersOf,
  parseProvinceHistory,
  planHistoryEdit,
  provinceIdOfHistoryFile,
  renderProvinceHistory,
} from '../../services/provinceHistoryEdit.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { applyPatches } from '../../services/textPatch.js';

const FREDERICKSBURG = [
  'owner = USA',
  'controller = USA',
  'add_core = USA',
  'trade_goods = tobacco',
  'life_rating = 35',
  '#terrain = farmlands',
  'is_slave = yes',
  '',
  'university = 1',
  '',
  'party_loyalty = {',
  '\tideology = conservative',
  '\tloyalty_value = 13',
  '}',
  'party_loyalty = {',
  '\tideology = liberal',
  '\tloyalty_value = 12',
  '}',
].join('\r\n');

const BIELSKO = [
  'owner = AUS',
  'controller = AUS',
  'add_core = AUS',
  'add_core = BOH',
  'trade_goods = coal',
  'life_rating = 40',
  '1861.1.1 = { railroad = 2 }',
  '#terrain = farmland',
].join('\n');

function edit(text: string, change: (before: ProvinceHistory) => ProvinceHistory): string {
  const document = parseDocument(text).document;
  const before = parseProvinceHistory(document);
  return applyPatches(text, planHistoryEdit(text, document, change(before)));
}

suite('provinceHistoryEdit', () => {
  test('parses scalar fields, cores, buildings, loyalty blocks and dated blocks', () => {
    const history = parseProvinceHistory(parseDocument(FREDERICKSBURG).document);
    assert.strictEqual(history.owner, 'USA');
    assert.strictEqual(history.lifeRating, '35');
    assert.strictEqual(history.isSlave, 'yes');
    assert.deepStrictEqual(history.cores, ['USA']);
    assert.deepStrictEqual(history.buildings, [{ key: 'university', value: '1' }]);
    assert.deepStrictEqual(history.partyLoyalty, [
      { ideology: 'conservative', loyaltyValue: '13' },
      { ideology: 'liberal', loyaltyValue: '12' },
    ]);
    const dated = parseProvinceHistory(parseDocument(BIELSKO).document).dated;
    assert.deepStrictEqual(
      dated.map((block) => [block.date, block.entries.buildings]),
      [['1861.1.1', [{ key: 'railroad', value: '2' }]]],
    );
  });

  test('an unchanged model produces no patch', () => {
    for (const text of [FREDERICKSBURG, BIELSKO]) {
      const document = parseDocument(text).document;
      assert.deepStrictEqual(planHistoryEdit(text, document, parseProvinceHistory(document)), []);
    }
  });

  test('rewrites a changed scalar in place and keeps comments', () => {
    const result = edit(FREDERICKSBURG, (before) => ({ ...before, lifeRating: '30', owner: 'CSA' }));
    assert.ok(result.includes('owner = CSA\r\ncontroller = USA'));
    assert.ok(result.includes('life_rating = 30\r\n#terrain = farmlands\r\nis_slave = yes'));
  });

  test('drops a removed core line and adds new cores after the last one', () => {
    const removed = edit(BIELSKO, (before) => ({ ...before, cores: ['AUS'] }));
    assert.strictEqual(removed, BIELSKO.replace('add_core = BOH\n', ''));
    const added = edit(BIELSKO, (before) => ({ ...before, cores: [...before.cores, 'CZH', 'SLS'] }));
    assert.ok(added.includes('add_core = BOH\nadd_core = CZH\nadd_core = SLS\ntrade_goods = coal'));
  });

  test('a field that never existed goes after the last plain entry, before dated blocks', () => {
    const result = edit(BIELSKO, (before) => ({ ...before, terrain: 'hills', isSlave: 'no' }));
    assert.ok(
      result.includes('life_rating = 40\nterrain = hills\nis_slave = no\n1861.1.1 = { railroad = 2 }\n#terrain = farmland'),
      result,
    );
  });

  test('a changed dated block is rewritten whole, a new one goes at the end', () => {
    const result = edit(BIELSKO, (before) => ({
      ...before,
      dated: [
        {
          date: '1861.1.1',
          entries: { ...EMPTY_PROVINCE_HISTORY, buildings: [{ key: 'railroad', value: '3' }], owner: 'PRU' },
        },
        { date: '1870.1.1', entries: { ...EMPTY_PROVINCE_HISTORY, controller: 'PRU' } },
      ],
    }));
    assert.ok(result.includes('life_rating = 40\n1861.1.1 = {\n\towner = PRU\n\trailroad = 3\n}\n#terrain = farmland\n'), result);
    assert.ok(result.endsWith('#terrain = farmland\n1870.1.1 = {\n\tcontroller = PRU\n}\n'), result);
  });

  test('loyalty blocks are edited, dropped and added in place', () => {
    const result = edit(FREDERICKSBURG, (before) => ({
      ...before,
      partyLoyalty: [{ ideology: 'conservative', loyaltyValue: '20' }],
      stateBuildings: [{ building: 'steel_factory', level: '1', upgrade: 'yes' }],
    }));
    assert.ok(result.includes('party_loyalty = {\r\n\tideology = conservative\r\n\tloyalty_value = 20\r\n}'), result);
    assert.ok(!result.includes('liberal'));
    assert.ok(
      result.includes('state_building = {\r\n\tlevel = 1\r\n\tbuilding = steel_factory\r\n\tupgrade = yes\r\n}'),
      result,
    );
  });

  test('renders a whole file for a new province', () => {
    const text = renderProvinceHistory({ ...EMPTY_PROVINCE_HISTORY, owner: 'USA', cores: ['USA'], lifeRating: '30' }, '\n');
    assert.strictEqual(text, 'owner = USA\nadd_core = USA\nlife_rating = 30\n');
  });

  test('finds history files by their id prefix and lists their folders', () => {
    const paths = [
      'history/provinces/usa/213 - Fredericksburg.txt',
      'history/provinces/2130 - Other.txt',
      'history/provinces/asia/x.txt',
    ];
    assert.strictEqual(findHistoryFile(paths, 213), paths[0]);
    assert.strictEqual(findHistoryFile(paths, 2130), paths[1]);
    assert.strictEqual(findHistoryFile(paths, 5), undefined);
    assert.strictEqual(provinceIdOfHistoryFile('213-Fredericksburg.txt'), 213);
    assert.deepStrictEqual(historyFoldersOf(paths), ['', 'asia', 'usa']);
  });

  test('a folder pattern keeps the real files of a mod that fills the vanilla set with placeholders', () => {
    // The TTA layout: every vanilla province declared empty, the mod's own
    // provinces in one folder, and the same ids in both.
    const paths = [
      'history/provinces/africa/1 - Fez.txt',
      'history/provinces/middle earth/1 - Healleah.txt',
      'history/provinces/2 - Loose.txt',
    ];
    assert.deepStrictEqual(filterHistoryFolders(paths, undefined), paths, 'no pattern keeps everything');
    assert.strictEqual(findHistoryFile(paths, 1), paths[0], 'the walk order decides without a pattern');

    const kept = filterHistoryFolders(paths, /^middle.*/i);
    assert.deepStrictEqual(kept, [paths[1]]);
    assert.strictEqual(findHistoryFile(kept, 1), paths[1]);
    assert.deepStrictEqual(historyFoldersOf(kept), ['middle earth']);
    // Folder names are matched case-insensitively, and the root is a folder too.
    assert.deepStrictEqual(filterHistoryFolders(paths, /^MIDDLE/i), [paths[1]]);
    assert.deepStrictEqual(filterHistoryFolders(paths, /^$/), [paths[2]]);
    assert.deepStrictEqual(filterHistoryFolders(paths, /^nowhere$/), []);
  });
});
