import * as assert from 'node:assert';
import { analyze, DocumentAnalysisCache } from '../../services/documentAnalysis.js';

const TEXT = 'country_event = { id = 1 title = "t" }\n';

suite('documentAnalysis', () => {
  test('an analysis carries the text and its tokens', () => {
    const analysis = analyze(TEXT);
    assert.strictEqual(analysis.text, TEXT);
    assert.ok(analysis.tokens.length > 0);
    assert.strictEqual(analysis.tokens[0]?.value, 'country_event');
  });

  test('the AST is built once and reused', () => {
    const analysis = analyze(TEXT);
    assert.strictEqual(analysis.parse(), analysis.parse());
  });

  test('parsing an analysis gives the same result as parsing the text', () => {
    const analysis = analyze('a = { b = 1 }\n');
    assert.deepStrictEqual(analysis.parse().document.entries.length, 1);
    assert.deepStrictEqual(analysis.parse().diagnostics, []);
  });

  test('a syntax error is reported through the analysis, not thrown', () => {
    const codes = analyze('a = { b = 1\n').parse().diagnostics.map((item) => item.code);
    assert.ok(codes.length > 0);
  });
});

suite('DocumentAnalysisCache', () => {
  test('the same document at the same version is analysed once', () => {
    const cache = new DocumentAnalysisCache();
    const first = cache.of('file:///a.txt', 1, TEXT);
    assert.strictEqual(cache.of('file:///a.txt', 1, TEXT), first);
  });

  test('an edit replaces the entry', () => {
    const cache = new DocumentAnalysisCache();
    const first = cache.of('file:///a.txt', 1, TEXT);
    const second = cache.of('file:///a.txt', 2, `${TEXT}b = 2\n`);
    assert.notStrictEqual(second, first);
    assert.strictEqual(cache.of('file:///a.txt', 2, `${TEXT}b = 2\n`), second);
  });

  test('only one document is held, so the other one is analysed again', () => {
    const cache = new DocumentAnalysisCache();
    const first = cache.of('file:///a.txt', 1, TEXT);
    cache.of('file:///b.txt', 1, TEXT);
    assert.notStrictEqual(cache.of('file:///a.txt', 1, TEXT), first);
  });

  test('forget drops the held document, and leaves another one alone', () => {
    const cache = new DocumentAnalysisCache();
    const held = cache.of('file:///a.txt', 1, TEXT);
    cache.forget('file:///other.txt');
    assert.strictEqual(cache.of('file:///a.txt', 1, TEXT), held);
    cache.forget('file:///a.txt');
    assert.notStrictEqual(cache.of('file:///a.txt', 1, TEXT), held);
  });

  test('clear drops everything', () => {
    const cache = new DocumentAnalysisCache();
    const held = cache.of('file:///a.txt', 1, TEXT);
    cache.clear();
    assert.notStrictEqual(cache.of('file:///a.txt', 1, TEXT), held);
  });
});
