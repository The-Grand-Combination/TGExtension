import * as assert from 'node:assert';
import type { ModDescriptor } from '../../model/modDescriptor.js';
import { settingsHtml, settingsState, type CurrentSettings } from '../../providers/settingsHtml.js';

function mod(name: string, folder: string, dependencies: readonly string[] = []): ModDescriptor {
  return { name, path: `mod/${folder}`, folder: `/game/mod/${folder}`, replacePaths: [], dependencies, descriptorPath: '' };
}

const tgc = mod('TGC', 'TGC');
const sub = mod('TGC Sub', 'TGCSub', ['TGC']);
const gfm = mod('GFM', 'GFM');
const orphan = mod('Lost', 'Lost', ['Nobody']);

function current(
  gamePathSetting: string,
  selected: readonly string[],
  locKeyPattern = '^EVT',
  flagNamePattern = '',
  nullTagPattern = '^(QQQ|---|null)$',
  ignoreMarker = '#VT - Skip Validation',
  countryColorsTint = 82,
  provinceFolderPattern = '',
  nullTagSuppress = true,
): CurrentSettings {
  return {
    gamePathSetting,
    selected,
    locKeyPattern,
    flagNamePattern,
    nullTagPattern,
    nullTagSuppress,
    ignoreMarker,
    provinceFolderPattern,
    countryColorsTint,
  };
}

suite('settingsState', () => {
  test('groups submods under their base mod and orphans last, and orders the selection for loading', () => {
    const state = settingsState({ gameRoot: 'F:/game', mods: [sub, tgc, gfm, orphan] }, current('', ['TGC Sub', 'GFM']));
    assert.deepStrictEqual(
      state.groups.map((group) => [group.base?.name, group.submods.map((entry) => entry.name)]),
      [
        ['GFM', []],
        ['TGC', ['TGC Sub']],
        [undefined, ['Lost']],
      ],
    );
    assert.deepStrictEqual(state.order, ['GFM', 'TGC', 'TGC Sub'], 'a selected submod pulls its base in first');
    assert.strictEqual(state.warning, undefined);
    assert.strictEqual(state.gamePathSetting, '');
  });

  test('warns about a selected mod whose dependency is not installed', () => {
    const state = settingsState({ gameRoot: 'F:/game', mods: [tgc, orphan] }, current('F:/game', ['Lost']));
    assert.strictEqual(state.warning, 'Dependency not installed: Nobody');
    assert.deepStrictEqual(state.order, ['Lost']);
    assert.strictEqual(state.gamePathSetting, 'F:/game');
  });

  test('carries an undefined game root through, so the page can ask for the folder', () => {
    const state = settingsState({ gameRoot: undefined, mods: [] }, current('D:/wrong', []));
    assert.strictEqual(state.gameRoot, undefined);
    assert.deepStrictEqual(state.groups, []);
  });

  test('carries the localisation key pattern through, empty included', () => {
    assert.strictEqual(settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [])).locKeyPattern, '^EVT');
    assert.strictEqual(
      settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [], '')).locKeyPattern,
      '',
      'empty is a real setting: check every value',
    );
    assert.strictEqual(
      settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [], '^(EVT|DBG)')).locKeyPattern,
      '^(EVT|DBG)',
    );
  });

  test('carries the flag name pattern through, empty being the default', () => {
    assert.strictEqual(settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [])).flagNamePattern, '');
    assert.strictEqual(
      settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [], '^EVT', '^tgc_')).flagNamePattern,
      '^tgc_',
    );
  });

  test('carries the null tag pattern through, empty included', () => {
    assert.strictEqual(
      settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [])).nullTagPattern,
      '^(QQQ|---|null)$',
    );
    assert.strictEqual(
      settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [], '^EVT', '', '')).nullTagPattern,
      '',
      'empty is a real setting: no exception',
    );
  });

  test('the null tag suppression is carried through, and defaults to on', () => {
    assert.strictEqual(settingsState({ gameRoot: 'F:/game', mods: [] }, current('', [])).nullTagSuppress, true);
    const off = current('', [], '^EVT', '', '^(QQQ)$', '#VT - Skip Validation', 82, '', false);
    assert.strictEqual(settingsState({ gameRoot: 'F:/game', mods: [] }, off).nullTagSuppress, false);
  });

  test('every regex field sits in the Regex Patterns tab, and the rest in Extension', () => {
    const html = settingsHtml('vscode-webview:');
    const panes = html.split('<section id="patternsPane"');
    assert.strictEqual(panes.length, 2, 'the page has the two tab panes');
    const [extension, patterns] = panes as [string, string];
    for (const id of ['locPattern', 'flagPattern', 'nullTagPattern', 'nullTagSuppress', 'provinceFolderPattern']) {
      assert.ok(patterns.includes(`id="${id}"`), `${id} belongs to Regex Patterns`);
    }
    // The marker is literal text, not a regex, so it stays with the rest.
    for (const id of ['gamePath', 'ignoreMarker', 'tint', 'mods']) {
      assert.ok(extension.includes(`id="${id}"`), `${id} belongs to Extension`);
    }
  });

  test('the page carries a nonce-locked CSP and no external resources', () => {
    const html = settingsHtml('vscode-webview:');
    const nonce = /nonce-([A-Za-z0-9+/=]+)/.exec(html)?.[1];
    assert.ok(nonce, 'a nonce is generated');
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.ok(!html.includes('src="http'));
  });
});
