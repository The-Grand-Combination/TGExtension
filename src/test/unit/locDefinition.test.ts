import * as assert from 'node:assert';
import { locKeyHoverMarkdown, resolveLocKeyAt } from '../../services/locDefinition.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

suite('locDefinition', () => {
  test('resolves the loc key under the cursor inside a quoted string', () => {
    const text = 'country_event = { id = 1 title = "EVTNAME100" }';
    const offset = text.indexOf('EVTNAME100') + 3;
    const resolved = resolveLocKeyAt(text, offset, index);
    assert.ok(resolved, 'expected a resolved key');
    assert.strictEqual(resolved.definition.filePath, 'localisation/00_test.csv');
    assert.strictEqual(resolved.definition.line, 4);
    assert.strictEqual(resolved.definition.text, 'The Event');
  });

  test('reports the token range for hover highlighting', () => {
    const text = 'name = o';
    const resolved = resolveLocKeyAt(text, text.length - 1, index);
    assert.ok(resolved, 'expected a resolved key');
    assert.deepStrictEqual(resolved.tokenRange, { start: 7, end: 8 });
  });

  test('returns undefined for unknown words and non-word positions', () => {
    const text = 'title = "UNKNOWN_KEY" }';
    assert.strictEqual(resolveLocKeyAt(text, text.indexOf('UNKNOWN') + 2, index), undefined);
    assert.strictEqual(resolveLocKeyAt(text, text.length - 1, index), undefined);
  });

  test('hover markdown shows the text and the source line', () => {
    const text = 'title = "EVTNAME100"';
    const resolved = resolveLocKeyAt(text, 12, index);
    assert.ok(resolved, 'expected a resolved key');
    const markdown = locKeyHoverMarkdown(resolved);
    assert.ok(markdown.includes('The Event'), markdown);
    assert.ok(markdown.includes('localisation/00_test.csv:5'), markdown);
  });

  test('hover markdown marks empty translations', () => {
    const emptyIndex = buildTestIndex({
      'localisation/01_extra.csv': 'EMPTY_KEY;;x\n',
    });
    const resolved = resolveLocKeyAt('title = EMPTY_KEY', 12, emptyIndex);
    assert.ok(resolved, 'expected a resolved key');
    assert.ok(locKeyHoverMarkdown(resolved).includes('(empty text)'));
  });
});
