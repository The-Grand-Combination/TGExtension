import * as assert from 'node:assert';
import type { ModDescriptor } from '../../model/modDescriptor.js';
import { settingsHtml, settingsState } from '../../providers/settingsHtml.js';

function mod(name: string, folder: string, dependencies: readonly string[] = []): ModDescriptor {
  return { name, path: `mod/${folder}`, folder: `/game/mod/${folder}`, replacePaths: [], dependencies, descriptorPath: '' };
}

const tgc = mod('TGC', 'TGC');
const sub = mod('TGC Sub', 'TGCSub', ['TGC']);
const gfm = mod('GFM', 'GFM');
const orphan = mod('Lost', 'Lost', ['Nobody']);

suite('settingsState', () => {
  test('groups submods under their base mod and orphans last, and orders the selection for loading', () => {
    const state = settingsState({ gameRoot: 'F:/game', mods: [sub, tgc, gfm, orphan] }, '', ['TGC Sub', 'GFM']);
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
    const state = settingsState({ gameRoot: 'F:/game', mods: [tgc, orphan] }, 'F:/game', ['Lost']);
    assert.strictEqual(state.warning, 'Dependency not installed: Nobody');
    assert.deepStrictEqual(state.order, ['Lost']);
    assert.strictEqual(state.gamePathSetting, 'F:/game');
  });

  test('carries an undefined game root through, so the page can ask for the folder', () => {
    const state = settingsState({ gameRoot: undefined, mods: [] }, 'D:/wrong', []);
    assert.strictEqual(state.gameRoot, undefined);
    assert.deepStrictEqual(state.groups, []);
  });

  test('the page carries a nonce-locked CSP and no external resources', () => {
    const html = settingsHtml('vscode-webview:');
    const nonce = /nonce-([A-Za-z0-9+/=]+)/.exec(html)?.[1];
    assert.ok(nonce, 'a nonce is generated');
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.ok(!html.includes('src="http'));
  });
});
