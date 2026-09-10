import * as assert from 'node:assert';
import type { Value } from '../../model/ast.js';
import { tokenize } from '../../parser/lexer.js';
import { parse, type ParseResult } from '../../parser/parser.js';
import { expectAssignment, expectBlock, nth } from './support.js';

function parseText(text: string): ParseResult {
  const lex = tokenize(text);
  return parse(lex.tokens, text.length, lex.diagnostics);
}

function firstValue(text: string): Value {
  return expectAssignment(nth(parseText(text).document.entries, 0)).value;
}

suite('parser', () => {
  test('parses a scalar assignment', () => {
    const { document, diagnostics } = parseText('id = 1836');
    assert.strictEqual(diagnostics.length, 0);
    assert.strictEqual(document.entries.length, 1);
    const assignment = expectAssignment(nth(document.entries, 0));
    assert.strictEqual(assignment.key.value, 'id');
    assert.strictEqual(assignment.operator, '=');
    assert.strictEqual(assignment.value.kind, 'scalar');
  });

  test('parses nested blocks', () => {
    const { document, diagnostics } = parseText('country_event = { id = 1 }');
    assert.strictEqual(diagnostics.length, 0);
    const event = expectAssignment(nth(document.entries, 0));
    const inner = expectAssignment(nth(expectBlock(event.value).entries, 0));
    assert.strictEqual(inner.key.value, 'id');
  });

  test('parses bare list items inside a block', () => {
    const block = expectBlock(firstValue('color = { 255 0 0 }'));
    assert.strictEqual(block.entries.length, 3);
    assert.ok(block.entries.every((entry) => entry.kind === 'scalar'));
  });

  test('classifies scalar value types', () => {
    const date = firstValue('a = 1836.1.1');
    assert.strictEqual(date.kind === 'scalar' && date.type, 'date');
    const number = firstValue('a = 0.5');
    assert.strictEqual(number.kind === 'scalar' && number.type, 'number');
    const boolean = firstValue('a = yes');
    assert.strictEqual(boolean.kind === 'scalar' && boolean.type, 'boolean');
    const identifier = firstValue('a = liberal');
    assert.strictEqual(identifier.kind === 'scalar' && identifier.type, 'identifier');
  });

  test('recovers from an unclosed block', () => {
    const { diagnostics } = parseText('country_event = { id = 1');
    assert.ok(diagnostics.some((item) => item.code === 'unbalanced-brace'));
  });

  test('reports a stray closing brace', () => {
    const { diagnostics } = parseText('a = b }');
    assert.ok(diagnostics.some((item) => item.code === 'unexpected-brace'));
  });

  test('keeps parsing after an error', () => {
    const { document } = parseText('a = b } c = d');
    const keys = document.entries
      .filter((entry) => entry.kind === 'assignment')
      .map((entry) => entry.key.value);
    assert.deepStrictEqual(keys, ['a', 'c']);
  });
});
