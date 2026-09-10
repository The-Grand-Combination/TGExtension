import * as assert from 'node:assert';
import { didYouMean, suggestClosest } from '../../services/suggestions.js';

/** Textbook Levenshtein, the reference the banded implementation must agree with. */
function referenceDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(substitution, (current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** Deterministic pseudo-random strings, so a failure is reproducible. */
function randomStrings(count: number): string[] {
  const alphabet = 'abcd_';
  let seed = 12345;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };
  return Array.from({ length: count }, () => {
    const length = next() % 13;
    return Array.from({ length }, () => alphabet[next() % alphabet.length] ?? 'a').join('');
  });
}

suite('suggestions', () => {
  test('suggests the closest candidate within the allowed distance', () => {
    assert.strictEqual(suggestClosest('prestge', ['prestige', 'plurality', 'war']), 'prestige');
    assert.strictEqual(suggestClosest('tags', ['tag', 'has_flag', 'war']), 'tag');
  });

  test('allows one edit for short names and two for longer ones', () => {
    assert.strictEqual(suggestClosest('wr', ['war']), 'war');
    assert.strictEqual(suggestClosest('wxx', ['war']), undefined);
    assert.strictEqual(suggestClosest('civilised', ['civilized']), 'civilized');
    assert.strictEqual(suggestClosest('civilisd', ['civilized']), 'civilized');
    assert.strictEqual(suggestClosest('civlsd', ['civilized']), undefined);
  });

  test('prefers the nearest of several candidates and stops at an exact match', () => {
    assert.strictEqual(suggestClosest('liberal', ['liberals', 'liberal', 'libera']), 'liberal');
    assert.strictEqual(suggestClosest('libera', ['liberals', 'liberal']), 'liberal');
  });

  test('didYouMean formats a suffix and stays silent for an exact or missing match', () => {
    assert.strictEqual(didYouMean('prestge', ['prestige']), " Did you mean 'prestige'?");
    assert.strictEqual(didYouMean('prestige', ['prestige']), '');
    assert.strictEqual(didYouMean('zzzz', ['prestige']), '');
  });

  test('the banded distance agrees with the reference on random pairs', () => {
    const inputs = randomStrings(400);
    const candidates = randomStrings(400);
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i] ?? '';
      const candidate = candidates[i] ?? '';
      const max = input.length <= 4 ? 1 : 2;
      const expected = referenceDistance(input, candidate) <= max;
      const actual = suggestClosest(input, [candidate]) !== undefined;
      assert.strictEqual(actual, expected, `'${input}' vs '${candidate}' (max ${String(max)})`);
    }
  });

  test('handles names longer than the initial row buffers', () => {
    const long = 'a'.repeat(300);
    assert.strictEqual(suggestClosest(`${long}b`, [long]), long);
    assert.strictEqual(suggestClosest(`${long}bbb`, [long]), undefined);
  });
});
