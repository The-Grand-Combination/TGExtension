import * as assert from 'node:assert';
import { auditEssentialTags } from '../../services/essentialTagsValidation.js';

const REBELS = 'common/countries/rebels.txt';

const COUNTRIES = [
  'REB\t\t= "countries/rebels.txt"',
  'ENG\t\t= "countries/United Kingdom.txt"',
  'FRA\t\t= "countries/France.txt"',
  'dynamic_tags = yes',
  'D01\t\t= "countries/D01.txt"',
].join('\n');

type DefinitionExists = (relativePath: string) => boolean;

/** The stack has every definition the list points at. */
const everything: DefinitionExists = () => true;

function codes(text: string | undefined, exists: DefinitionExists = everything): string[] {
  return auditEssentialTags(text, exists).map((item) => item.code);
}

suite('essentialTagsValidation', () => {
  test('REB declared with a definition in the stack reports nothing', () => {
    assert.deepStrictEqual(codes(COUNTRIES), []);
  });

  test('REB missing from the list is an error naming what it is for', () => {
    const without = COUNTRIES.split('\n').filter((line) => !line.startsWith('REB')).join('\n');
    const [finding] = auditEssentialTags(without, everything);
    assert.strictEqual(finding?.code, 'missing-essential-tag');
    assert.strictEqual(finding.severity, 'error');
    assert.match(finding.message, /does not declare 'REB'/);
    assert.match(finding.message, /every rebel army in the game belongs to it/);
    assert.match(finding.message, /Add 'REB = "countries\/<file>\.txt"'/);
  });

  test('with no tag to point at, the finding sits at the start of the file', () => {
    const [finding] = auditEssentialTags('ENG = "countries/United Kingdom.txt"\n', everything);
    assert.deepStrictEqual(finding?.range, { start: 0, end: 0 });
  });

  test('REB below dynamic_tags is an error: there it is a tag to hand out, not a country', () => {
    const demoted = [
      'ENG\t\t= "countries/United Kingdom.txt"',
      'dynamic_tags = yes',
      'REB\t\t= "countries/rebels.txt"',
    ].join('\n');
    const [finding] = auditEssentialTags(demoted, everything);
    assert.strictEqual(finding?.code, 'missing-essential-tag');
    assert.match(finding.message, /below 'dynamic_tags = yes'/);
    assert.strictEqual(demoted.slice(finding.range.start, finding.range.end), 'REB');
  });

  test('a definition no layer of the stack has is its own error, on the tag', () => {
    const [finding] = auditEssentialTags(COUNTRIES, (relativePath) => relativePath !== REBELS);
    assert.strictEqual(finding?.code, 'missing-country-definition');
    assert.match(finding.message, /'REB' points at 'common\/countries\/rebels\.txt', which no layer of the stack has/);
    assert.strictEqual(COUNTRIES.slice(finding.range.start, finding.range.end), 'REB');
  });

  test('the definition is looked for under common/, not under history/', () => {
    const asked: string[] = [];
    auditEssentialTags(COUNTRIES, (relativePath) => {
      asked.push(relativePath);
      return true;
    });
    assert.deepStrictEqual(asked, [REBELS]);
  });

  test('a mod is free to name the file whatever it likes', () => {
    const renamed = 'REB = "countries/Uprising.txt"\n';
    assert.deepStrictEqual(codes(renamed, (relativePath) => relativePath === 'common/countries/Uprising.txt'), []);
  });

  test('the tag is matched however it is cased', () => {
    assert.deepStrictEqual(codes('reb = "countries/rebels.txt"\n'), []);
  });

  test('a stack with no country list at all is not judged', () => {
    assert.deepStrictEqual(codes(undefined), []);
  });

  test('only the tag itself is essential; the rest of the list is not this check\'s business', () => {
    const [finding] = auditEssentialTags(COUNTRIES, (relativePath) => relativePath === REBELS);
    // ENG and FRA point at definitions the stack does not have, and that is not reported here.
    assert.strictEqual(finding, undefined);
  });
});
