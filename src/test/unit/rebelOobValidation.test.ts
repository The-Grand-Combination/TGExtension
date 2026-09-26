import * as assert from 'node:assert';
import { auditRebelOob } from '../../services/rebelOobValidation.js';

const RANGE = { start: 5, end: 9 };

suite('rebelOobValidation', () => {
  test('a mod that ships the file reports nothing', () => {
    assert.deepStrictEqual(auditRebelOob(true, RANGE), []);
  });

  test('a stack whose only copy is the base game one is an error on the given range', () => {
    const [finding] = auditRebelOob(false, RANGE);
    assert.strictEqual(finding?.code, 'missing-rebel-oob');
    assert.strictEqual(finding.severity, 'error');
    assert.deepStrictEqual(finding.range, RANGE);
    assert.match(finding.message, /history\/units\/REB_oob\.txt/);
    assert.match(finding.message, /provinces 493 to 501/);
    assert.match(finding.message, /an empty one is enough/);
  });
});
