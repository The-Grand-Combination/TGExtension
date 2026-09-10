import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateSemantics } from '../../services/semanticValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { buildTestIndex } from './testIndex.js';

const index = buildTestIndex();

function codes(text: string, fileType: FileType = 'event', currentFile = 'events/Test.txt'): string[] {
  const { document } = parseDocument(text);
  return validateSemantics(document, fileType, index, currentFile).map((item) => item.code);
}

suite('newsValidation', () => {
  test('news trigger blocks accept the news comparison triggers', () => {
    const text = `generator_selector = { type = "FAKE" name = "x"
      case = { value = 0 }
      case = { trigger = { date_greater = { 0 1836.1.1 } tags_eq = { 0 2 PLAYER } news_printing_count = 1 } value = 100 } }`;
    assert.deepStrictEqual(codes(text, 'newsScript', 'news/news_fake_default.txt'), []);
    assert.ok(
      codes('pattern = { case = { trigger = { date_greaterr = { } } } }', 'newsScript', 'news/news_x.txt').includes('unknown-trigger'),
    );
  });
});
