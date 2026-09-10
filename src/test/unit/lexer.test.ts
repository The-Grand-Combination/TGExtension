import * as assert from 'node:assert';
import { tokenize, type TokenKind } from '../../parser/lexer.js';
import { nth } from './support.js';

suite('lexer', () => {
  test('tokenizes key = value', () => {
    const { tokens, diagnostics } = tokenize('id = 1836');
    assert.strictEqual(diagnostics.length, 0);
    assert.deepStrictEqual(
      tokens.map((token) => token.kind),
      ['word', 'equals', 'word'],
    );
    assert.strictEqual(nth(tokens, 0).value, 'id');
    assert.strictEqual(nth(tokens, 2).value, '1836');
  });

  test('skips comments and whitespace', () => {
    const { tokens } = tokenize('# comment\n  a = b # trailing\n');
    assert.deepStrictEqual(
      tokens.map((token) => token.value),
      ['a', '=', 'b'],
    );
  });

  test('reads quoted strings without the surrounding quotes', () => {
    const { tokens } = tokenize('title = "EVTNAME1"');
    assert.strictEqual(nth(tokens, 2).kind, 'string');
    assert.strictEqual(nth(tokens, 2).value, 'EVTNAME1');
  });

  test('reports unterminated strings', () => {
    const { diagnostics } = tokenize('desc = "oops');
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(nth(diagnostics, 0).code, 'unterminated-string');
  });

  test('recognizes comparison operators', () => {
    const { tokens } = tokenize('a <= 1 b >= 2 c < 3 d > 4');
    const operatorKinds: TokenKind[] = ['le', 'ge', 'lt', 'gt'];
    const seen = tokens.map((token) => token.kind).filter((kind) => operatorKinds.includes(kind));
    assert.deepStrictEqual(seen, ['le', 'ge', 'lt', 'gt']);
  });

  test('records token ranges as source offsets', () => {
    const { tokens } = tokenize('id = 1');
    assert.deepStrictEqual(nth(tokens, 0).range, { start: 0, end: 2 });
    assert.deepStrictEqual(nth(tokens, 2).range, { start: 5, end: 6 });
  });
});
