import * as assert from 'node:assert';
import { auditFlags, type FlagAudit } from '../../services/flagValidation.js';

const GOVERNMENTS = [
  'absolute_monarchy = { election = no flagType = monarchy }',
  'democracy = { election = yes flagType = republic }',
  // The engine reads the key case-insensitively, and the mod spells it both ways.
  'dominion = { election = yes flagtype = dominion }',
  'colonial_company = { election = no }',
].join('\n');

const COUNTRIES = [
  'ENG = "countries/England.txt"',
  'FRA = "countries/France.txt"',
  'dynamic_tags = yes',
  'D01 = "countries/D01.txt"',
].join('\n');

const COMPLETE = [
  'ENG.tga', 'ENG_monarchy.tga', 'ENG_republic.tga', 'ENG_dominion.tga',
  'FRA.tga', 'FRA_monarchy.tga', 'FRA_republic.tga', 'FRA_dominion.tga',
];

function audit(flagFileNames: readonly string[]): FlagAudit {
  return auditFlags({ governmentsText: GOVERNMENTS, countriesText: COUNTRIES, flagFileNames });
}

function codes(diagnostics: FlagAudit['countries']): string[] {
  return diagnostics.map((item) => item.code);
}

suite('flagValidation', () => {
  test('a complete set of flags reports nothing', () => {
    const found = audit(COMPLETE);
    assert.deepStrictEqual(found.countries, []);
    assert.deepStrictEqual(found.governments, []);
  });

  test('a tag missing one flag type is reported once, on its tag', () => {
    const found = audit(COMPLETE.filter((name) => name !== 'FRA_republic.tga'));
    assert.deepStrictEqual(codes(found.countries), ['missing-flag']);
    const finding = found.countries[0];
    assert.match(finding?.message ?? '', /'FRA' has no flag: gfx\/flags\/FRA_republic\.tga/);
    assert.strictEqual(finding?.severity, 'error');
  });

  test('every flag a tag lacks is listed in one finding, the default flag included', () => {
    const found = audit(COMPLETE.filter((name) => !name.startsWith('ENG')));
    assert.deepStrictEqual(codes(found.countries), ['missing-flag']);
    assert.match(
      found.countries[0]?.message ?? '',
      /'ENG' has no 4 flags: gfx\/flags\/ENG\.tga, gfx\/flags\/ENG_monarchy\.tga, gfx\/flags\/ENG_republic\.tga, gfx\/flags\/ENG_dominion\.tga/,
    );
  });

  test('a flag type no tag has art for is reported once, on the government that names it', () => {
    const found = auditFlags({
      governmentsText: `${GOVERNMENTS}\ntheocracy = { election = no flagType = theocracy }`,
      countriesText: COUNTRIES,
      flagFileNames: COMPLETE,
    });
    assert.deepStrictEqual(codes(found.governments), ['flag-type-without-art']);
    assert.match(found.governments[0]?.message ?? '', /flag type 'theocracy'.*2 tags/);
    // Reported once there, not once per tag.
    assert.deepStrictEqual(found.countries, []);
  });

  test('a flag whose name is spelled differently is a warning, not a missing flag', () => {
    const found = audit([...COMPLETE.filter((name) => name !== 'ENG_monarchy.tga'), 'ENG_Monarchy.tga']);
    assert.deepStrictEqual(codes(found.countries), ['flag-name-case']);
    assert.match(found.countries[0]?.message ?? '', /ENG_Monarchy\.tga should be ENG_monarchy\.tga/);
    assert.strictEqual(found.countries[0]?.severity, 'warning');
  });

  test('dynamic tags are left out: a released dominion flies the flag of its releaser', () => {
    const found = audit(COMPLETE);
    assert.deepStrictEqual(found.countries, []);
  });

  test('a government without a flagType only asks for the default flag', () => {
    const found = auditFlags({
      governmentsText: 'colonial_company = { election = no }',
      countriesText: 'ENG = "countries/England.txt"',
      flagFileNames: ['ENG.tga'],
    });
    assert.deepStrictEqual(found.countries, []);
  });

  test('the same flagType in two governments is one requirement', () => {
    const found = auditFlags({
      governmentsText: `${GOVERNMENTS}\npresidential_dictatorship = { election = no flagType = republic }`,
      countriesText: COUNTRIES,
      flagFileNames: COMPLETE.filter((name) => name !== 'ENG_republic.tga'),
    });
    assert.deepStrictEqual(codes(found.countries), ['missing-flag']);
    assert.match(found.countries[0]?.message ?? '', /has no flag: gfx\/flags\/ENG_republic\.tga/);
  });

  test('an incomplete stack is not judged: no tags, or no flag folder at all', () => {
    assert.deepStrictEqual(audit([]), { governments: [], countries: [] });
    assert.deepStrictEqual(
      auditFlags({ governmentsText: GOVERNMENTS, countriesText: undefined, flagFileNames: COMPLETE }),
      { governments: [], countries: [] },
    );
  });

  test('a finding points at the tag, not at the start of the file', () => {
    const found = audit(COMPLETE.filter((name) => name !== 'FRA_republic.tga'));
    const range = found.countries[0]?.range;
    assert.strictEqual(COUNTRIES.slice(range?.start, range?.end), 'FRA');
  });
});
