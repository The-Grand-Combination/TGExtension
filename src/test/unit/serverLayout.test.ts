import * as assert from 'node:assert';
import * as path from 'node:path';
import { singleRootLayers } from '../../services/modLayers.js';
import type { FileLocation, ModLayout } from '../../services/modLayout.js';
import {
  loadLayout,
  reportTargets,
  samePath,
  selectionLayers,
  type LayoutFileSystem,
} from '../../services/serverLayout.js';

const GAME = path.resolve('/game');
const CHECKOUT = path.resolve('/work');
const OPTIONS = { caseInsensitivePaths: true };

/** An install with one mod, plus a separate checkout laid out like `mod/`. */
function fileSystem(files: Readonly<Record<string, string>>): LayoutFileSystem {
  const byPath = new Map(Object.entries(files).map(([key, text]) => [path.resolve(key), text]));
  const directories = new Set<string>();
  for (const key of byPath.keys()) {
    for (let at = path.dirname(key); at !== path.dirname(at); at = path.dirname(at)) {
      directories.add(at);
    }
  }
  return {
    listFiles: (directory, extension): string[] =>
      [...byPath.keys()]
        .filter((key) => path.dirname(key) === path.resolve(directory) && key.toLowerCase().endsWith(extension))
        .map((key) => path.basename(key)),
    readFile: (absolutePath): string | undefined => byPath.get(path.resolve(absolutePath)),
    isDirectory: (directoryPath): boolean => directories.has(path.resolve(directoryPath)),
  };
}

const INSTALL = fileSystem({
  '/game/mod/TGC.mod': 'name = "TGC"\npath = "mod/TGC"\n',
  '/game/mod/TGC/common/countries.txt': '',
  '/work/TGC.mod': 'name = "TGC"\npath = "mod/TGC"\n',
  '/work/TGC/common/countries.txt': '',
  '/work/Other.mod': 'name = "Other"\npath = "mod/Other"\n',
  '/work/Other/common/countries.txt': '',
});

suite('serverLayout — loading the install', () => {
  test('a configured game path with a mod/ folder is the install', () => {
    const loaded = loadLayout(
      { gamePath: GAME, activeMods: [], workspaceFolders: [], options: OPTIONS },
      INSTALL,
    );
    assert.strictEqual(loaded.layout.gameRoot, GAME);
    assert.strictEqual(loaded.ignoredGamePath, undefined);
    assert.deepStrictEqual(loaded.layout.mods.map((entry) => entry.name), ['TGC']);
  });

  test('a configured game path without one is reported and then ignored', () => {
    const loaded = loadLayout(
      { gamePath: path.resolve('/nowhere'), activeMods: [], workspaceFolders: [], options: OPTIONS },
      INSTALL,
    );
    assert.strictEqual(loaded.layout.gameRoot, undefined);
    // Reported rather than logged here: the caller owns the output channel.
    assert.strictEqual(loaded.ignoredGamePath, path.resolve('/nowhere'));
  });

  test('a checkout shadows the installed copy of the same name', () => {
    const loaded = loadLayout(
      { gamePath: GAME, activeMods: [], workspaceFolders: [path.join(CHECKOUT, 'TGC')], options: OPTIONS },
      INSTALL,
    );
    const tgc = loaded.layout.mods.find((entry) => entry.name === 'TGC');
    assert.strictEqual(tgc?.descriptorPath, path.join(CHECKOUT, 'TGC.mod'), 'the checked-out descriptor wins');
    assert.deepStrictEqual(loaded.layout.mods.map((entry) => entry.name).sort(), ['Other', 'TGC']);
  });

  test('the selection is the configured mods that exist', () => {
    const loaded = loadLayout(
      { gamePath: GAME, activeMods: ['TGC', 'Ghost'], workspaceFolders: [], options: OPTIONS },
      INSTALL,
    );
    assert.deepStrictEqual(loaded.layout.selection.map((entry) => entry.name), ['TGC']);
  });
});

suite('serverLayout — samePath', () => {
  test('case-insensitive layers treat two spellings of a folder as one', () => {
    assert.ok(samePath(path.resolve('/A/B'), path.resolve('/a/b'), { caseInsensitivePaths: true }));
    assert.ok(!samePath(path.resolve('/A/B'), path.resolve('/a/b'), { caseInsensitivePaths: false }));
  });

  test('nothing is the same path as undefined', () => {
    assert.ok(!samePath(path.resolve('/A'), undefined, OPTIONS));
  });
});

function layoutOf(activeMods: readonly string[]): ModLayout {
  return loadLayout({ gamePath: GAME, activeMods, workspaceFolders: [], options: OPTIONS }, INSTALL).layout;
}

suite('serverLayout — report targets', () => {
  const nothingLocated = (): undefined => undefined;

  test('the mods a request names are each a target, over one shared stack', () => {
    const targets = reportTargets(layoutOf([]), { mods: ['TGC'], workspaceFolders: [] }, [], OPTIONS, nothingLocated);
    assert.deepStrictEqual(targets.map((target) => target.root), [path.join(GAME, 'mod', 'TGC')]);
  });

  test('with nothing named, the mods set in Settings are the targets', () => {
    const targets = reportTargets(layoutOf(['TGC']), { mods: [], workspaceFolders: [] }, [], OPTIONS, nothingLocated);
    assert.deepStrictEqual(targets.map((target) => target.root), [path.join(GAME, 'mod', 'TGC')]);
    assert.strictEqual(targets[0]?.layers.key, selectionLayers(layoutOf(['TGC']), OPTIONS)?.key);
  });

  test('with neither, each workspace folder contributes the mod it belongs to, once', () => {
    const root = path.join(GAME, 'mod', 'TGC');
    const layers = singleRootLayers(root, OPTIONS);
    const targets = reportTargets(
      layoutOf([]),
      { mods: [], workspaceFolders: [] },
      ['/one', '/two'],
      OPTIONS,
      (): FileLocation => ({ root, layers }),
    );
    assert.deepStrictEqual(targets.map((target) => target.root), [root], 'two folders of one mod are one target');
  });

  test('the folders the request carries win over the server\'s own', () => {
    const seen: string[] = [];
    reportTargets(
      layoutOf([]),
      { mods: [], workspaceFolders: ['/from-request'] },
      ['/from-server'],
      OPTIONS,
      (folder): undefined => {
        seen.push(folder);
        return undefined;
      },
    );
    assert.deepStrictEqual(seen, ['/from-request']);
  });
});
