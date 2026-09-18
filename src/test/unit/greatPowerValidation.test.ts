import * as assert from 'node:assert';
import {
  auditGreatPowers,
  collectGreatPowerCandidates,
  historyValueAtStart,
  startDateOf,
  type GreatPowerCandidate,
  type StartStateReader,
} from '../../services/greatPowerValidation.js';

const DEFINES = [
  'defines = {',
  "\tstart_date = '1836.1.1',",
  '\tcountry = {',
  '\t\tGREAT_NATIONS_COUNT = 8,',
  '\t\tBADBOY_LIMIT = 25,',
  '\t},',
  '}',
].join('\n');

function power(tag: string, civilized: boolean, stateCount: number): GreatPowerCandidate {
  return { tag, civilized, stateCount };
}

const EIGHT_POWERS = ['ENG', 'FRA', 'RUS', 'AUS', 'PRU', 'USA', 'TUR', 'SPA'].map((tag) => power(tag, true, 4));

suite('greatPowerValidation — the count against the world', () => {
  test('enough qualifying countries reports nothing', () => {
    assert.deepStrictEqual(auditGreatPowers(DEFINES, EIGHT_POWERS), []);
  });

  test('one country short is an error, on the count itself', () => {
    const found = auditGreatPowers(DEFINES, EIGHT_POWERS.slice(0, 7));
    assert.deepStrictEqual(found.map((item) => item.code), ['too-few-great-powers']);
    assert.match(found[0]?.message ?? '', /seats 8 great powers, but only 7 countries qualify at 1836\.1\.1/);
    assert.strictEqual(DEFINES.slice(found[0]?.range.start, found[0]?.range.end), '8');
  });

  test('an uncivilized giant does not qualify, however many states it owns', () => {
    const found = auditGreatPowers(DEFINES, [...EIGHT_POWERS.slice(0, 7), power('CHI', false, 90)]);
    assert.deepStrictEqual(found.map((item) => item.code), ['too-few-great-powers']);
    assert.match(found[0]?.message ?? '', /CHI \(uncivilized, 90 states\)/);
  });

  test('a civilized country with one state does not qualify either', () => {
    const found = auditGreatPowers(DEFINES, [...EIGHT_POWERS.slice(0, 7), power('LUX', true, 1)]);
    assert.match(found[0]?.message ?? '', /LUX \(civilized, 1 state\)/);
  });

  test('the fix is named both ways: lower the count, or make a country qualify', () => {
    const found = auditGreatPowers(DEFINES, EIGHT_POWERS.slice(0, 3));
    assert.match(found[0]?.message ?? '', /Lower GREAT_NATIONS_COUNT to 3 or make another country qualify/);
  });

  test('a lowered count is judged against the world it asks for', () => {
    const lowered = DEFINES.replace('GREAT_NATIONS_COUNT = 8', 'GREAT_NATIONS_COUNT = 3');
    assert.deepStrictEqual(auditGreatPowers(lowered, EIGHT_POWERS.slice(0, 3)), []);
  });

  test('defines without the count, or a world that was never read, is not judged', () => {
    assert.deepStrictEqual(auditGreatPowers('defines = { country = { BADBOY_LIMIT = 25 } }', []), []);
    assert.deepStrictEqual(auditGreatPowers(DEFINES, []), []);
    assert.deepStrictEqual(auditGreatPowers(undefined, EIGHT_POWERS), []);
  });

  test('the start date comes from defines, and falls back to the engine default', () => {
    assert.strictEqual(startDateOf(DEFINES), '1836.1.1');
    assert.strictEqual(startDateOf("defines = { start_date = '1821.1.1' }"), '1821.1.1');
    assert.strictEqual(startDateOf(undefined), '1836.1.1');
  });
});

suite('greatPowerValidation — history at the start date', () => {
  test('a plain value is read straight off the top of the file', () => {
    assert.strictEqual(historyValueAtStart('civilized = yes\ncapital = 300\n', 'civilized', '1836.1.1'), 'yes');
  });

  test('a dated block up to the start date overrides the top of the file', () => {
    const text = 'civilized = no\n1820.1.1 = { civilized = yes }\n';
    assert.strictEqual(historyValueAtStart(text, 'civilized', '1836.1.1'), 'yes');
  });

  test('a dated block after the start date does not', () => {
    const text = 'civilized = no\n1861.1.1 = { civilized = yes }\n';
    assert.strictEqual(historyValueAtStart(text, 'civilized', '1836.1.1'), 'no');
  });

  test('blocks apply in date order, not in the order they are written', () => {
    const text = 'owner = AAA\n1835.1.1 = { owner = CCC }\n1830.1.1 = { owner = BBB }\n';
    assert.strictEqual(historyValueAtStart(text, 'owner', '1836.1.1'), 'CCC');
  });

  test('a key the file never sets is undefined, not a guess', () => {
    assert.strictEqual(historyValueAtStart('capital = 300\n', 'civilized', '1836.1.1'), undefined);
  });
});

const PROVINCES: Readonly<Record<string, string>> = {
  'history/provinces/europe/1 - London.txt': 'owner = ENG\ncontroller = ENG\n',
  'history/provinces/europe/2 - York.txt': 'owner = ENG\n',
  'history/provinces/europe/3 - Paris.txt': 'owner = FRA\n',
  'history/provinces/europe/4 - Lyon.txt': 'owner = FRA\n',
  'history/provinces/europe/5 - Luxembourg.txt': 'owner = LUX\n',
  // Owned only after the start date: it belongs to nobody at 1836.
  'history/provinces/europe/6 - Nice.txt': '1860.1.1 = { owner = FRA }\n',
};

const COUNTRY_HISTORY: Readonly<Record<string, string>> = {
  'history/countries/ENG - United Kingdom.txt': 'civilized = yes\ncapital = 1\n',
  'history/countries/FRA - France.txt': 'civilized = yes\ncapital = 3\n',
  'history/countries/LUX - Luxembourg.txt': 'civilized = yes\n',
  'history/countries/ZUL - Zululand.txt': 'civilized = no\n',
};

// London and York sit in different states; Paris and Lyon share one.
const STATE_OF_PROVINCE = new Map([
  ['1', 'LONDON'],
  ['2', 'YORKSHIRE'],
  ['3', 'ILE_DE_FRANCE'],
  ['4', 'ILE_DE_FRANCE'],
  ['5', 'LUXEMBOURG'],
  ['6', 'PROVENCE'],
]);

const COUNTRIES = [
  'ENG = "countries/United Kingdom.txt"',
  'FRA = "countries/France.txt"',
  'LUX = "countries/Luxembourg.txt"',
  'ZUL = "countries/Zululand.txt"',
].join('\n');

function reader(): StartStateReader {
  const files: Readonly<Record<string, string>> = { ...PROVINCES, ...COUNTRY_HISTORY };
  return {
    startDate: '1836.1.1',
    readFile: (relativePath) => Promise.resolve(files[relativePath]),
    provinceFiles: Object.keys(PROVINCES),
    countryFiles: Object.keys(COUNTRY_HISTORY),
    stateOfProvince: STATE_OF_PROVINCE,
  };
}

suite('greatPowerValidation — the world at the start date', () => {
  let candidates: readonly GreatPowerCandidate[];

  suiteSetup(async () => {
    candidates = await collectGreatPowerCandidates(COUNTRIES, reader());
  });

  function find(tag: string): GreatPowerCandidate | undefined {
    return candidates.find((candidate) => candidate.tag === tag);
  }

  test('a tag is matched to its history file by the three letters the name starts with', () => {
    // `common/countries.txt` points at `common/countries/`, not at history.
    assert.strictEqual(find('ENG')?.civilized, true);
    assert.strictEqual(find('ZUL')?.civilized, false);
  });

  test('two provinces in two states count as two; two in one state count as one', () => {
    assert.strictEqual(find('ENG')?.stateCount, 2);
    assert.strictEqual(find('FRA')?.stateCount, 1);
  });

  test('a province owned only after the start date is owned by nobody at start', () => {
    assert.strictEqual(find('FRA')?.stateCount, 1);
  });

  test('so only the country with two states qualifies', () => {
    const found = auditGreatPowers('GREAT_NATIONS_COUNT = 2', candidates);
    assert.deepStrictEqual(found.map((item) => item.code), ['too-few-great-powers']);
    assert.match(found[0]?.message ?? '', /only 1 country qualifies/);
    assert.match(found[0]?.message ?? '', /FRA \(civilized, 1 state\)/);
  });

  test('a province file the highest layer replaces is read once, from that layer', async () => {
    const mine = 'history/provinces/europe/3 - Paris.txt';
    const theirs = 'history/provinces/france/3 - Paris.txt';
    const files: Readonly<Record<string, string>> = {
      ...COUNTRY_HISTORY,
      [mine]: 'owner = ENG\n',
      [theirs]: 'owner = FRA\n',
    };
    const found = await collectGreatPowerCandidates(COUNTRIES, {
      ...reader(),
      readFile: (relativePath) => Promise.resolve(files[relativePath]),
      // Highest layer first, as the layered listing returns it.
      provinceFiles: [mine, theirs],
    });
    assert.strictEqual(found.find((candidate) => candidate.tag === 'ENG')?.stateCount, 1);
    assert.strictEqual(found.find((candidate) => candidate.tag === 'FRA')?.stateCount, 0);
  });

  test('without a country list there is no world to judge', async () => {
    assert.deepStrictEqual(await collectGreatPowerCandidates(undefined, reader()), []);
  });
});
