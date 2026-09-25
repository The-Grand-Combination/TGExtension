import * as assert from 'node:assert';
import { describeError, guarded, logFailure } from '../../services/guarded.js';

suite('guarded — callbacks outside a request', () => {
  test('a throwing callback is logged under its label and does not throw', () => {
    const logged: string[] = [];
    const run = guarded('Validating', (message) => logged.push(message), (): void => {
      throw new Error('parser edge case');
    });
    assert.doesNotThrow(() => { run(); });
    assert.strictEqual(logged.length, 1);
    assert.ok(logged[0]?.startsWith('Validating failed: Error: parser edge case'), logged[0]);
  });

  test('arguments reach the callback and a quiet run logs nothing', () => {
    const logged: string[] = [];
    const seen: number[] = [];
    guarded('x', (message) => logged.push(message), (value: number): void => { seen.push(value); })(7);
    assert.deepStrictEqual(seen, [7]);
    assert.deepStrictEqual(logged, []);
  });

  test('logFailure ends a promise chain with a log line instead of an unhandled rejection', async () => {
    const logged: string[] = [];
    await Promise.reject(new Error('config')).catch(logFailure('Applying the configuration', (m) => logged.push(m)));
    assert.strictEqual(logged.length, 1);
    assert.ok(logged[0]?.startsWith('Applying the configuration failed: Error: config'));
  });

  test('a thrown non-Error is described too', () => {
    assert.strictEqual(describeError('plain'), 'plain');
  });
});
