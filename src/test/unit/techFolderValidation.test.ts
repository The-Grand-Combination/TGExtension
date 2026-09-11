import * as assert from 'node:assert';
import type { FileType } from '../../model/fileType.js';
import { validateSemantics } from '../../services/semanticValidation.js';
import { parseDocument } from '../../services/syntaxValidation.js';
import { buildTestIndex } from './testIndex.js';

const TECHNOLOGY_TXT = 'common/technology.txt';

const VANILLA_FOLDERS =
  'folders = { army_tech = { a } navy_tech = { b } commerce_tech = { c } culture_tech = { d } industry_tech = { e } }\n';

function codes(text: string, fileType: FileType, currentFile: string, extraFiles = {}): string[] {
  const { document } = parseDocument(text);
  return validateSemantics(document, fileType, buildTestIndex(extraFiles), currentFile).map((item) => item.code);
}

suite('techFolderValidation — required folders', () => {
  test('army_tech and navy_tech satisfy the requirement', () => {
    assert.deepStrictEqual(codes(VANILLA_FOLDERS, 'techFolders', TECHNOLOGY_TXT), []);
  });

  test('a missing required folder is an error', () => {
    const text = 'folders = { army_tech = { a } commerce_tech = { c } }\n';
    assert.deepStrictEqual(codes(text, 'techFolders', TECHNOLOGY_TXT), ['missing-tech-folder']);
  });

  test('both missing are reported once', () => {
    const text = 'folders = { population_tech = { a } }\n';
    assert.deepStrictEqual(codes(text, 'techFolders', TECHNOLOGY_TXT), ['missing-tech-folder']);
  });

  test('a file with no folders section at all is an error', () => {
    assert.deepStrictEqual(codes('schools = { traditional_academic = { } }\n', 'techFolders', TECHNOLOGY_TXT), [
      'missing-tech-folder',
    ]);
  });
});

suite('techFolderValidation — research bonus modifier keys', () => {
  const withFolders = {
    [TECHNOLOGY_TXT]: `${VANILLA_FOLDERS}schools = { traditional_academic = { } }\n`,
  };
  const withCustomFolder = {
    [TECHNOLOGY_TXT]: 'folders = { army_tech = { a } navy_tech = { b } population_tech = { c } }\n',
  };

  test('a custom folder grants its research bonus key', () => {
    const modifier = 'my_modifier = { population_tech_research_bonus = 0.1 }';
    assert.deepStrictEqual(codes(modifier, 'eventModifiers', 'common/event_modifiers.txt', withCustomFolder), []);
  });

  test('a bonus key with no matching folder is unknown', () => {
    const modifier = 'my_modifier = { population_tech_research_bonus = 0.1 }';
    assert.deepStrictEqual(codes(modifier, 'eventModifiers', 'common/event_modifiers.txt', withFolders), [
      'unknown-modifier-key',
    ]);
  });

  test('vanilla bonus keys stay valid in technologies', () => {
    const tech = 'tech_a = { year = 1836 cost = 100 army_tech_research_bonus = 0.05 }';
    assert.deepStrictEqual(codes(tech, 'technology', 'technologies/army_tech.txt', withCustomFolder), []);
  });

  test('a custom bonus key is valid in a technology body', () => {
    const tech = 'tech_a = { year = 1836 cost = 100 population_tech_research_bonus = 0.05 }';
    assert.deepStrictEqual(codes(tech, 'technology', 'technologies/army_tech.txt', withCustomFolder), []);
  });
});

suite('has_pop_religion / has_pop_culture accept THIS', () => {
  function eventCodes(trigger: string): string[] {
    const text = `country_event = { id = 1 title = "t" desc = "d" is_triggered_only = yes trigger = { ${trigger} } option = { name = "o" } }`;
    return codes(text, 'event', 'events/Test.txt');
  }

  test('THIS compares the pop against the scoped country', () => {
    assert.deepStrictEqual(eventCodes('has_pop_religion = THIS'), []);
    assert.deepStrictEqual(eventCodes('has_pop_culture = THIS'), []);
  });

  test('a named religion still resolves', () => {
    assert.deepStrictEqual(eventCodes('has_pop_religion = catholic'), []);
    assert.ok(eventCodes('has_pop_religion = zoroastrian').includes('unknown-religion'));
  });
});
