import * as assert from 'node:assert';
import type { ModDescriptor } from '../../model/modDescriptor.js';
import { modSelectionItems } from '../../services/modSelectionItems.js';

function mod(name: string, folder: string, dependencies: readonly string[] = []): ModDescriptor {
  return { name, path: `mod/${folder}`, folder: `/game/mod/${folder}`, replacePaths: [], dependencies, descriptorPath: '' };
}

const tgc = mod('TGC', 'TGC');
const sub = mod('TGC Sub', 'TGCSub', ['TGC']);
const gfm = mod('GFM', 'GFM');
const orphan = mod('Lost', 'Lost', ['Nobody']);

suite('modSelectionItems', () => {
  test('one family per base mod: heading, base, its submods; orphans last; current picks marked', () => {
    const items = modSelectionItems([sub, tgc, gfm, orphan], ['TGC Sub', 'GFM']);
    assert.deepStrictEqual(
      items.map((item) => (item.kind === 'separator' ? `--- ${item.label}` : [item.label, item.description, item.picked])),
      [
        '--- GFM',
        ['$(package) GFM', 'base mod', true],
        '--- TGC',
        ['$(package) TGC', 'base mod', false],
        ['$(arrow-small-right) TGC Sub', 'submod of TGC', true],
        '--- Dependency not installed',
        ['$(warning) Lost', 'needs Nobody', false],
      ],
    );
  });

  test('no orphan heading when every dependency is installed', () => {
    const items = modSelectionItems([tgc, sub], []);
    assert.ok(!items.some((item) => item.kind === 'separator' && item.label === 'Dependency not installed'));
  });
});
