import * as assert from 'node:assert';
import { countryColorOf, countryFilesOf, provinceOwnerOf } from '../../services/countryColors.js';
import { parseDocument } from '../../services/syntaxValidation.js';

const COUNTRIES = [
  '# Please keep tags sorted alphabetically #',
  '',
  '\t## France ##',
  '\t\tFRA\t\t= "countries/France.txt"',
  '\t\tVFR\t\t= "countries/Nationalist France.txt"',
  'dynamic_tags = yes',
  'usa = "countries/USA.txt"',
  '',
].join('\r\n');

suite('countryColors', () => {
  test('maps every tag of common/countries.txt to its file under common/', () => {
    const files = countryFilesOf(parseDocument(COUNTRIES).document);
    assert.deepStrictEqual(
      [...files.entries()],
      [
        ['FRA', 'common/countries/France.txt'],
        ['VFR', 'common/countries/Nationalist France.txt'],
        ['USA', 'common/countries/USA.txt'],
      ],
    );
  });

  test('reads a country colour', () => {
    const text = 'graphical_culture = EuropeanGC\ncolor = { 20 50 210 }\nparty = {\n\tname = "FRA_conservative"\n}\n';
    assert.deepStrictEqual(countryColorOf(parseDocument(text).document), [20, 50, 210]);
  });

  test('rounds and clamps colour components', () => {
    assert.deepStrictEqual(countryColorOf(parseDocument('color = { 20.4 300 -3 }').document), [20, 255, 0]);
  });

  test('gives no colour when the block is missing or malformed', () => {
    assert.strictEqual(countryColorOf(parseDocument('graphical_culture = EuropeanGC').document), undefined);
    assert.strictEqual(countryColorOf(parseDocument('color = { 20 50 }').document), undefined);
    assert.strictEqual(countryColorOf(parseDocument('color = { 20 50 red }').document), undefined);
    assert.strictEqual(countryColorOf(parseDocument('color = 20').document), undefined);
  });

  test('reads the start-date owner of a province history file', () => {
    const text = 'owner = fra\ncontroller = FRA\nadd_core = FRA\n1861.1.1 = {\n\towner = ITA\n}\n';
    assert.strictEqual(provinceOwnerOf(parseDocument(text).document), 'FRA');
  });

  test('treats ---, null and a dated-only owner as no owner', () => {
    assert.strictEqual(provinceOwnerOf(parseDocument('owner = ---\nlife_rating = 30').document), undefined);
    assert.strictEqual(provinceOwnerOf(parseDocument('owner = null').document), undefined);
    assert.strictEqual(provinceOwnerOf(parseDocument('1861.1.1 = {\n\towner = ITA\n}\n').document), undefined);
    assert.strictEqual(provinceOwnerOf(parseDocument('life_rating = 30').document), undefined);
  });
});
