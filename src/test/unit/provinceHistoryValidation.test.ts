import * as assert from 'node:assert';
import type { Diagnostic } from '../../model/diagnostic.js';
import { loadLayeredFile, type LoadedLayeredFile } from '../../services/modLayers.js';
import {
  auditProvinceHistory,
  emptyAudit,
  provinceHistoryAuditUnits,
  type ProvinceHistoryAudit,
} from '../../services/provinceHistoryValidation.js';

const DEFINITION = [
  'province;red;green;blue;x;x',
  '1;10;0;0;Sitka;x',
  '2;0;10;0;Yakutat;x',
  '900;0;0;10;North Sea;x',
  ';1;222;200;A Lake;x',
].join('\n');

const COMPLETE = 'owner = ENG\nlife_rating = 35\ntrade_goods = cattle\n';

function file(relativePath: string, text: string, root = '/mod/'): LoadedLayeredFile {
  return loadLayeredFile(
    { relativePath: `history/provinces/${relativePath}`, absolutePath: `${root}history/provinces/${relativePath}` },
    text,
  );
}

function audit(files: readonly LoadedLayeredFile[], overrides: Partial<Parameters<typeof auditProvinceHistory>[0]> = {}): ProvinceHistoryAudit {
  return auditProvinceHistory({
    definitionText: DEFINITION,
    maxProvinces: 1000,
    seaProvinces: new Set(['900']),
    files,
    ...overrides,
  });
}

function codes(found: readonly Diagnostic[]): string[] {
  return found.map((item) => item.code);
}

/** Every finding the audit made, wherever it put it. */
function allCodes(result: ProvinceHistoryAudit): string[] {
  return [...codes(result.definition), ...[...result.byFile.values()].flatMap(codes)];
}

const BOTH_PROVINCES = [file('1 - Sitka.txt', COMPLETE), file('2 - Yakutat.txt', COMPLETE)];

suite('provinceHistoryValidation — which provinces are judged', () => {
  test('a complete pair of land provinces reports nothing', () => {
    assert.deepStrictEqual(allCodes(audit(BOTH_PROVINCES)), []);
  });

  test('a land province with no file at all is an error, at its row in definition.csv', () => {
    const result = audit([file('1 - Sitka.txt', COMPLETE)]);
    const [finding] = result.definition;
    assert.strictEqual(finding?.code, 'missing-province-history');
    assert.strictEqual(finding.severity, 'error');
    assert.match(finding.message, /Province 2 \(Yakutat\) has no file under history\/provinces/);
    assert.match(finding.message, /"2 - Yakutat\.txt"/);
    assert.strictEqual(DEFINITION.slice(finding.range.start, finding.range.end), '2');
  });

  test('a sea province needs no history, which is why none of them ships one', () => {
    // 900 is in sea_starts and has no file; only 2 is reported.
    const result = audit([file('1 - Sitka.txt', COMPLETE)]);
    assert.strictEqual(result.definition.length, 1);
    assert.match(result.definition[0]?.message ?? '', /Province 2/);
  });

  test('a row with no id is a lake, and lakes are not provinces', () => {
    assert.deepStrictEqual(allCodes(audit(BOTH_PROVINCES)), []);
  });

  test('an id the engine never loads is not asked for a file', () => {
    // max_provinces = 2 leaves only province 1 in play.
    const result = audit([file('1 - Sitka.txt', COMPLETE)], { maxProvinces: 2 });
    assert.deepStrictEqual(allCodes(result), []);
  });

  test('without a definition.csv there is no map to judge', () => {
    assert.deepStrictEqual(allCodes(audit([], { definitionText: undefined })), []);
  });
});

suite('provinceHistoryValidation — the two required keys', () => {
  test('a file with neither key names both', () => {
    const result = audit([file('1 - Sitka.txt', 'owner = ENG\n'), file('2 - Yakutat.txt', COMPLETE)]);
    const [finding] = result.byFile.get('history/provinces/1 - Sitka.txt') ?? [];
    assert.strictEqual(finding?.code, 'incomplete-province-history');
    assert.match(finding.message, /does not set "life_rating" or "trade_goods"/);
  });

  test('a file missing one key names only that one', () => {
    const result = audit([file('1 - Sitka.txt', 'life_rating = 35\n'), file('2 - Yakutat.txt', COMPLETE)]);
    const [finding] = result.byFile.get('history/provinces/1 - Sitka.txt') ?? [];
    assert.match(finding?.message ?? '', /does not set "trade_goods"\./);
  });

  test('an empty file fails like any other: the province still exists on the map', () => {
    const result = audit([file('1 - Sitka.txt', ''), file('2 - Yakutat.txt', COMPLETE)]);
    assert.deepStrictEqual(allCodes(result), ['incomplete-province-history']);
  });

  test('a key set only inside a dated block does not count: the province starts without it', () => {
    const dated = 'owner = ENG\nlife_rating = 35\n1861.1.1 = { trade_goods = coal }\n';
    const result = audit([file('1 - Sitka.txt', dated), file('2 - Yakutat.txt', COMPLETE)]);
    assert.match(result.byFile.get('history/provinces/1 - Sitka.txt')?.[0]?.message ?? '', /does not set "trade_goods"/);
  });

  test('the engine reads the id from the digits, so the rest of the name is free', () => {
    const renamed = [file('1 - anything at all.txt', COMPLETE), file('2.txt', COMPLETE)];
    assert.deepStrictEqual(allCodes(audit(renamed)), []);
  });

  test('a file in a subfolder counts the same', () => {
    const nested = [file('usa/1 - Sitka.txt', COMPLETE), file('canada/2 - Yakutat.txt', COMPLETE)];
    assert.deepStrictEqual(allCodes(audit(nested)), []);
  });

  test('a file whose name starts with no digits belongs to no province', () => {
    const result = audit([file('README.txt', COMPLETE), file('1 - Sitka.txt', COMPLETE), file('2 - Yakutat.txt', COMPLETE)]);
    assert.deepStrictEqual(allCodes(result), []);
  });
});

suite('provinceHistoryValidation — provinces described by more than one file', () => {
  // The engine loads every file claiming an id; vanilla itself ships two for 1396.
  // These sit in different mods: two with content in one mod is its own finding.
  const twice = (first: string, second: string): LoadedLayeredFile[] => [
    file('a/1 - Sitka.txt', first, '/game/'),
    file('b/1 - Sitka again.txt', second),
    file('2 - Yakutat.txt', COMPLETE),
  ];

  test('what one file leaves out, another may supply', () => {
    assert.deepStrictEqual(allCodes(audit(twice('life_rating = 35\n', 'trade_goods = cattle\n'))), []);
  });

  test('when none of them supplies it, the finding goes on the last one', () => {
    const result = audit(twice('owner = ENG\n', 'controller = ENG\n'));
    assert.deepStrictEqual([...result.byFile.keys()], ['history/provinces/b/1 - Sitka again.txt']);
  });

  test('and it says the others were read too, so the fix is not tried in the wrong file', () => {
    const result = audit(twice('owner = ENG\n', 'controller = ENG\n'));
    const message = result.byFile.get('history/provinces/b/1 - Sitka again.txt')?.[0]?.message ?? '';
    assert.match(message, /reads 1 more file/);
    assert.match(message, /"history\/provinces\/a\/1 - Sitka\.txt"/);
  });

  test('one file alone says nothing about others', () => {
    const result = audit([file('1 - Sitka.txt', 'owner = ENG\n'), file('2 - Yakutat.txt', COMPLETE)]);
    assert.ok(!(result.byFile.get('history/provinces/1 - Sitka.txt')?.[0]?.message ?? '').includes('more file'));
  });
});

suite('provinceHistoryValidation — two files with content in one mod', () => {
  const yakutat = file('2 - Yakutat.txt', COMPLETE);

  test('two files with content for one id in the same mod is an error, on the last one', () => {
    const result = audit([file('a/1 - Sitka.txt', COMPLETE), file('b/1 - Sitka.txt', 'owner = ENG\n'), yakutat]);
    const [finding] = result.byFile.get('history/provinces/b/1 - Sitka.txt') ?? [];
    assert.strictEqual(finding?.code, 'duplicate-province-history');
    assert.strictEqual(finding.severity, 'error');
    assert.match(finding.message, /2 files with content in the same mod/);
    assert.match(finding.message, /"history\/provinces\/a\/1 - Sitka\.txt"/);
  });

  test('an empty twin is the neutralising idiom and is allowed', () => {
    const result = audit([file('a/1 - Sitka.txt', COMPLETE), file('b/1 - Sitka.txt', ''), yakutat]);
    assert.deepStrictEqual(allCodes(result), []);
  });

  test('a file of only comments is empty', () => {
    const result = audit([file('a/1 - Sitka.txt', COMPLETE), file('b/1 - Sitka.txt', '# nothing\n'), yakutat]);
    assert.deepStrictEqual(allCodes(result), []);
  });

  test('the same id with content in two different mods is the layering the game expects', () => {
    const result = audit([file('a/1 - Sitka.txt', COMPLETE), file('b/1 - Sitka.txt', COMPLETE, '/game/'), yakutat]);
    assert.deepStrictEqual(allCodes(result), []);
  });

  test('three files with content in one mod is one finding naming the other two', () => {
    const result = audit([
      file('a/1 - Sitka.txt', COMPLETE),
      file('b/1 - Sitka.txt', COMPLETE),
      file('c/1 - Sitka.txt', COMPLETE),
      yakutat,
    ]);
    assert.deepStrictEqual(allCodes(result), ['duplicate-province-history']);
    const message = result.byFile.get('history/provinces/c/1 - Sitka.txt')?.[0]?.message ?? '';
    assert.match(message, /3 files with content/);
    assert.match(message, /"history\/provinces\/a\/1 - Sitka\.txt", "history\/provinces\/b\/1 - Sitka\.txt"/);
  });

  test('a province declared nowhere is not judged, however many files it has', () => {
    const result = audit([...BOTH_PROVINCES, file('a/5 - Nowhere.txt', COMPLETE), file('b/5 - Nowhere.txt', COMPLETE)]);
    assert.deepStrictEqual(allCodes(result), []);
  });
});

suite('provinceHistoryAuditUnits — the audit as work units', () => {
  test('one unit per declared land province, sized by the files claiming it, with the same findings', () => {
    const files = [file('1 - Sitka.txt', 'owner = ENG\n'), file('2 - Yakutat.txt', COMPLETE)];
    const into = emptyAudit();
    const sizes = [...provinceHistoryAuditUnits({ definitionText: DEFINITION, maxProvinces: 1000, seaProvinces: new Set(['900']), files }, into)];
    assert.deepStrictEqual(sizes, ['owner = ENG\n'.length, COMPLETE.length]);
    assert.deepStrictEqual(into, audit(files));
  });

  test('a file is parsed once however many audits walk it', () => {
    const loaded = file('1 - Sitka.txt', COMPLETE);
    assert.strictEqual(loaded.document(), loaded.document());
    audit([loaded]);
    assert.strictEqual(loaded.document(), loaded.document());
  });
});
