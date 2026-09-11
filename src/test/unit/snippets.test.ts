import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileType } from '../../model/fileType.js';
import { validateFileText } from '../../services/fileValidation.js';
import { buildTestIndex } from './testIndex.js';

interface Snippet {
  readonly prefix: string | string[];
  readonly body: string | string[];
  readonly description?: string;
}

const SNIPPET_DIRECTORY = path.join(__dirname, '..', '..', '..', 'snippets');

function loadSnippets(file: string): Record<string, Snippet> {
  const raw = fs.readFileSync(path.join(SNIPPET_DIRECTORY, file), 'utf8');
  // Strict JSON on purpose: VS Code would accept JSONC, but keeping the files
  // parseable by anything means this test can read them too.
  return JSON.parse(raw) as Record<string, Snippet>;
}

const script = loadSnippets('victoria2.code-snippets');
const localisation = loadSnippets('victoria2-csv.code-snippets');

function bodyOf(snippet: Snippet): string {
  return [snippet.body].flat().join('\n');
}

function prefixesOf(snippet: Snippet): string[] {
  return [snippet.prefix].flat();
}

suite('snippets — file health', () => {
  for (const [file, snippets] of [
    ['victoria2.code-snippets', script],
    ['victoria2-csv.code-snippets', localisation],
  ] as const) {
    test(`${file}: every entry has a prefix, a body, and a description`, () => {
      const entries = Object.entries(snippets);
      assert.ok(entries.length > 0);
      for (const [name, snippet] of entries) {
        assert.ok(prefixesOf(snippet).every((prefix) => prefix.length > 0), `${name} needs a prefix`);
        assert.ok(bodyOf(snippet).length > 0, `${name} needs a body`);
        assert.ok(snippet.description !== undefined && snippet.description.length > 0, `${name} needs a description`);
      }
    });

    test(`${file}: prefixes are unique`, () => {
      const owner = new Map<string, string>();
      for (const [name, snippet] of Object.entries(snippets)) {
        for (const prefix of prefixesOf(snippet)) {
          const existing = owner.get(prefix);
          assert.strictEqual(existing, undefined, `'${prefix}' is used by both ${existing ?? ''} and ${name}`);
          owner.set(prefix, name);
        }
      }
    });

    test(`${file}: at most one final tab stop per snippet`, () => {
      for (const [name, snippet] of Object.entries(snippets)) {
        const finals = bodyOf(snippet).match(/\$\{?0\}?/g) ?? [];
        assert.ok(finals.length <= 1, `${name} has ${String(finals.length)} occurrences of $0`);
      }
    });

    // Anything VS Code cannot parse as a tab stop, a placeholder or a choice is
    // inserted as literal text, which is never what a snippet wants. A bare name
    // parses, but as a snippet *variable*: VS Code rewrites it into a placeholder
    // and warns that the extension confuses the two. Tab stops are ${1:name}.
    test(`${file}: every \${...} is a numbered tab stop`, () => {
      for (const [name, snippet] of Object.entries(snippets)) {
        for (const match of bodyOf(snippet).matchAll(/\$\{([^}]*)\}/g)) {
          const inner = match[1] ?? '';
          const valid = /^\d+$/.test(inner) || /^\d+:/.test(inner) || /^\d+\|.*\|$/.test(inner);
          assert.ok(valid, `${name} should write '\${${inner}}' as a numbered tab stop`);
        }
      }
    });

    test(`${file}: numbered tab stops run 1..n with no gaps or conflicts`, () => {
      for (const [name, snippet] of Object.entries(snippets)) {
        const body = bodyOf(snippet);
        const defaults = new Map<string, string>();
        for (const match of body.matchAll(/\$\{(\d+):([^}]*)\}/g)) {
          const [, number = '', text = ''] = match;
          const previous = defaults.get(number);
          assert.ok(
            previous === undefined || previous === text,
            `${name} gives $${number} two different defaults: '${previous ?? ''}' and '${text}'`,
          );
          defaults.set(number, text);
        }
        const used = [...new Set([...body.matchAll(/\$\{?(\d+)/g)].map((match) => Number(match[1])))]
          .filter((number) => number > 0)
          .sort((left, right) => left - right);
        used.forEach((number, position) => {
          assert.strictEqual(number, position + 1, `${name} has a gap in its tab stops: ${used.join(', ')}`);
        });
      }
    });
  }

  test('victoria2: every script snippet has balanced braces', () => {
    for (const [name, snippet] of Object.entries(script)) {
      const text = expand(snippet);
      const opens = (text.match(/\{/g) ?? []).length;
      const closes = (text.match(/\}/g) ?? []).length;
      assert.strictEqual(opens, closes, `${name} inserts ${String(opens)} '{' against ${String(closes)} '}'`);
    }
  });

  // Localisation rows are key + 13 languages + the trailing marker; the two map
  // CSVs have six columns each.
  test('victoria2-csv: rows carry the column count the engine reads', () => {
    for (const [name, snippet] of Object.entries(localisation)) {
      const expected = name.includes('Province Definitions') || name.includes('Province Adjacencies') ? 6 : 15;
      for (const line of [snippet.body].flat()) {
        const columns = line.split(';').length;
        assert.strictEqual(columns, expected, `${name} row has ${String(columns)} columns: ${line}`);
      }
    }
  });
});

/** Fill every tab stop and named placeholder with a value the test mod defines. */
const PLACEHOLDER_VALUES: Readonly<Record<string, string>> = {
  TAG: 'ENG',
  CB_TYPE: 'acquire_all_cores',
  MONTHS: '12',
  LETTER: 'A',
  ID: '101',
  CB_NAME: 'my_cb',
  SPRITE_INDEX: '1',
  WAR_NAME: 'MY_WAR_NAME',
};

function expand(snippet: Snippet): string {
  return bodyOf(snippet)
    .replace(/\$\{\d+\|([^,|]*)[^|]*\|\}/g, '$1')
    .replace(/\$\{\d+:([A-Z_]+)\}/g, (whole, name: string) => PLACEHOLDER_VALUES[name] ?? whole)
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{?\d+\}?/g, '');
}

// Names and localisation keys the shared fixture does not already use, so the
// expansions are judged on their own content and not on fixture collisions.
const index = buildTestIndex({
  'localisation/01_snippets.csv':
    'CODE;ENGLISH;x\nEVTNAME101;Snippet event;x\nEVTDESC101;Snippet desc;x\nEVTOPTA101;Snippet option;x\n' +
    'snippet_decision_title;Snippet decision;x\nsnippet_decision_desc;Snippet decision desc;x\n',
});

function codesFor(text: string, fileType: FileType, currentFile: string): string[] {
  return validateFileText(text, fileType, index, currentFile).map((item) => item.code);
}

function bodyFor(name: string): string {
  const snippet = script[name];
  assert.ok(snippet, `the snippet '${name}' should exist`);
  return expand(snippet);
}

suite('snippets — expanded bodies validate', () => {
  for (const name of ['Add Casus Belli - Effect', 'Casus Belli - Effect', 'AI_chance statement']) {
    test(`${name} expands to valid event content`, () => {
      const text =
        'country_event = { id = 101 title = "EVTNAME101" desc = "EVTDESC101" is_triggered_only = yes ' +
        `option = { name = "EVTOPTA101" ${bodyFor(name)} } }`;
      assert.deepStrictEqual(codesFor(text, 'event', 'events/Snippet.txt'), [], text);
    });
  }

  test('Option statement for events expands to a valid event option', () => {
    const text =
      'country_event = { id = 101 title = "EVTNAME101" desc = "EVTDESC101" is_triggered_only = yes ' +
      `${bodyFor('Option statement for events')} }`;
    assert.deepStrictEqual(codesFor(text, 'event', 'events/Snippet.txt'), [], text);
  });

  test('ai_will_do statement expands to valid decision content', () => {
    const text = `political_decisions = { snippet_decision = { potential = { } allow = { } effect = { } ${bodyFor('ai_will_do statement')} } }`;
    assert.deepStrictEqual(codesFor(text, 'decision', 'decisions/Snippet.txt'), [], text);
  });

  test('Casus Belli - Defining expands to a valid cb_types.txt entry', () => {
    const body = bodyFor('Casus Belli - Defining');
    assert.deepStrictEqual(codesFor(body, 'cbType', 'common/cb_types.txt'), [], body);
  });

  test('the two casus belli snippets insert the two different effects', () => {
    assert.ok(bodyFor('Add Casus Belli - Effect').startsWith('add_casus_belli = {'));
    assert.ok(bodyFor('Casus Belli - Effect').startsWith('casus_belli = {'));
  });
});
