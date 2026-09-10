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

function eventWithOption(effects: string): string {
  return `country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" ${effects} } }`;
}

suite('eventValidation — event ids', () => {
  test('firing an unknown event id is an error', () => {
    assert.ok(codes(eventWithOption('country_event = 99999')).includes('unknown-event-id'));
  });

  test('firing an indexed or local event id passes', () => {
    assert.deepStrictEqual(codes(eventWithOption('country_event = 100')), []);
    const local =
      eventWithOption('country_event = { id = 555 days = 10 }') +
      '\ncountry_event = { id = 555 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.deepStrictEqual(codes(local), []);
  });

  test('duplicate event id across files is an error', () => {
    // id 100 exists in events/Existing.txt; defining it again in another file collides.
    const text = 'country_event = { id = 100 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.ok(codes(text, 'event', 'events/Another.txt').includes('duplicate-event-id'));
  });

  test('same file re-validation is not a duplicate', () => {
    const text = 'country_event = { id = 100 title = "t" desc = "d" is_triggered_only = yes option = { name = "o" } }';
    assert.deepStrictEqual(codes(text, 'event', 'events/Existing.txt'), []);
  });
});
