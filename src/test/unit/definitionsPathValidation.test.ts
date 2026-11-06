import * as assert from 'node:assert';
import { DEFAULT_VALIDATION_OPTIONS } from '../../model/validationOptions.js';
import { validateDefinitionsPath } from '../../services/definitionsPathValidation.js';
import { analyze } from '../../services/documentAnalysis.js';
import { validateAnalyzed } from '../../services/fileValidation.js';

function findingsFor(definitions: string, modPath = 'mod/Peace For Our Time'): string[] {
  const document = analyze(`max_provinces = 4244\ndefinitions = "${definitions}"\nprovinces = "provinces.bmp"\n`).parse().document;
  return validateDefinitionsPath(document, modPath).map((item) => item.code);
}

suite('definitionsPathValidation — default.map definitions names the mod folder', () => {
  test("accepts the mod's own definition.csv", () => {
    assert.deepStrictEqual(findingsFor('../mod/Peace For Our Time/map/definition.csv'), []);
  });

  test('compares case-insensitively', () => {
    assert.deepStrictEqual(findingsFor('../MOD/peace for our time/MAP/Definition.csv'), []);
  });

  test("reports another mod's folder", () => {
    const document = analyze('definitions = "../mod/GFM/map/definition.csv"\n').parse().document;
    const [finding] = validateDefinitionsPath(document, 'mod/Peace For Our Time');
    assert.strictEqual(finding?.code, 'definitions-outside-mod');
    assert.strictEqual(finding.severity, 'error');
    assert.match(finding.message, /another mod \(mod\/GFM\)/);
    assert.match(finding.message, /"\.\.\/mod\/Peace For Our Time\/map\/definition\.csv"/);
  });

  test("reports a plain file name: the game reads the base game's copy", () => {
    assert.deepStrictEqual(findingsFor('definition.csv'), ['definitions-outside-mod']);
  });

  test('reports a path that stops at the map folder', () => {
    assert.deepStrictEqual(findingsFor('../mod/Peace For Our Time/map/'), ['definitions-outside-mod']);
  });

  test('says nothing without a definitions line', () => {
    assert.deepStrictEqual(validateDefinitionsPath(analyze('max_provinces = 10\n').parse().document, 'mod/X'), []);
  });

  test('runs in the per-file pipeline only for default.map with a known mod path', () => {
    const analysis = analyze('max_provinces = 10\ndefinitions = "../mod/GFM/map/definition.csv"\n');
    const codes = (modPath?: string, fileType: 'mapDefault' | 'mapRegion' = 'mapDefault'): string[] =>
      validateAnalyzed(analysis, fileType, undefined, 'map/default.map', DEFAULT_VALIDATION_OPTIONS, modPath).map(
        (item) => item.code,
      );
    assert.deepStrictEqual(codes('mod/TGC'), ['definitions-outside-mod']);
    assert.deepStrictEqual(codes(undefined), []);
    assert.deepStrictEqual(codes('mod/TGC', 'mapRegion'), []);
  });
});
