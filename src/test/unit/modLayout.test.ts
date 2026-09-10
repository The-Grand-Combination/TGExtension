import * as assert from 'node:assert';
import * as path from 'node:path';
import type { ModDescriptor } from '../../model/modDescriptor.js';
import {
  baseMods,
  detectGameRoot,
  detectModDirectory,
  loadModDescriptors,
  loadOrder,
  locateFile,
  locateLoneMod,
  mergeDescriptors,
  missingDependencies,
  resolveSelection,
  submodsOf,
  type ModLayout,
} from '../../services/modLayout.js';

const GAME = path.resolve('/game');

function mod(name: string, folder: string, extra: Partial<ModDescriptor> = {}): ModDescriptor {
  return {
    name,
    path: `mod/${folder}`,
    folder: path.join(GAME, 'mod', folder),
    replacePaths: [],
    dependencies: [],
    descriptorPath: path.join(GAME, 'mod', `${folder}.mod`),
    ...extra,
  };
}

const tgc = mod('TGC - The Grand Combination', 'TGC', { replacePaths: ['events'] });
const apocalypse = mod('TGC Submod - Apocalypse 1836', 'TGCApocalypse1836', {
  dependencies: ['TGC - The Grand Combination'],
});
const performance = mod('TGC Submod - Performance Addon', 'TGCPerformanceAddon', {
  dependencies: ['TGC - The Grand Combination'],
});
const nested = mod('Apocalypse Tweaks', 'ApocalypseTweaks', { dependencies: ['TGC Submod - Apocalypse 1836'] });
const gfm = mod('Greater Flavor Mod', 'GFM');
const gfmNews = mod('GFM Newspapers Submod', 'GFM Newspapers', { dependencies: ['Greater Flavor Mod'] });
const orphan = mod('TGC Streamer Mode', 'TGCStreamerMode', { dependencies: ['The Grand Combination'] });
const mods = [tgc, apocalypse, performance, nested, gfm, gfmNews, orphan];

suite('modLayout — descriptors', () => {
  test('baseMods are the mods that depend on nothing, by name', () => {
    assert.deepStrictEqual(
      baseMods(mods).map((item) => item.name),
      ['Greater Flavor Mod', 'TGC - The Grand Combination'],
    );
  });

  test('submodsOf follows dependencies transitively and leaves unrelated mods out', () => {
    assert.deepStrictEqual(
      submodsOf(mods, tgc.name).map((item) => item.name),
      ['Apocalypse Tweaks', 'TGC Submod - Apocalypse 1836', 'TGC Submod - Performance Addon'],
    );
    assert.deepStrictEqual(
      submodsOf(mods, gfm.name).map((item) => item.name),
      ['GFM Newspapers Submod'],
    );
    assert.deepStrictEqual(submodsOf(mods, orphan.name), []);
  });

  test('loadOrder puts every dependency before the mod that needs it', () => {
    assert.deepStrictEqual(
      loadOrder(mods, [nested, performance]).map((item) => item.name),
      [tgc.name, apocalypse.name, nested.name, performance.name],
    );
    assert.deepStrictEqual(loadOrder(mods, [orphan]), [orphan], 'a missing dependency is skipped');
  });

  test('resolveSelection keeps only installed mods, in load order, whatever the combination', () => {
    const order = resolveSelection(mods, [
      'TGC Submod - Performance Addon',
      'Not Installed',
      'Apocalypse Tweaks',
      tgc.name,
    ]);
    assert.deepStrictEqual(
      order.map((item) => item.name),
      [tgc.name, apocalypse.name, nested.name, performance.name],
    );
    assert.deepStrictEqual(resolveSelection(mods, ['Nope']), []);
    assert.deepStrictEqual(
      resolveSelection(mods, [tgc.name, gfm.name]).map((item) => item.name),
      [gfm.name, tgc.name],
      'two base mods stack by name',
    );
    assert.deepStrictEqual(
      resolveSelection(mods, [apocalypse.name]).map((item) => item.name),
      [tgc.name, apocalypse.name],
      'a submod pulls its dependency in',
    );
  });

  test('missingDependencies names what the launcher would refuse to load', () => {
    assert.deepStrictEqual(missingDependencies(mods, [orphan, apocalypse]), ['The Grand Combination']);
    assert.deepStrictEqual(missingDependencies(mods, [tgc]), []);
  });

  test('loadModDescriptors reads the top-level .mod files, sorted by name', () => {
    const modDirectory = path.join(GAME, 'mod');
    const texts: Readonly<Record<string, string>> = {
      [path.join(modDirectory, 'TGC.mod')]: 'name = "TGC"\npath = "mod/TGC"\n',
      [path.join(modDirectory, 'Broken.mod')]: 'name = "No path here"\n',
      [path.join(modDirectory, 'A.mod')]: 'name = "Alpha"\npath = "mod/A"\ndependencies = { "TGC" }\n',
    };
    const loaded = loadModDescriptors(modDirectory, {
      listFiles: (directory, extension): string[] =>
        directory === modDirectory ? ['TGC.mod', 'Broken.mod', 'A.mod'].filter((name) => name.endsWith(extension)) : [],
      readFile: (absolutePath): string | undefined => texts[absolutePath],
    });
    assert.deepStrictEqual(
      loaded.map((item) => [item.name, item.path, item.dependencies]),
      [
        ['Alpha', 'mod/A', ['TGC']],
        ['TGC', 'mod/TGC', []],
      ],
    );
    assert.strictEqual(loaded[1]?.descriptorPath, path.join(modDirectory, 'TGC.mod'));
    assert.strictEqual(loaded[1].folder, path.join(modDirectory, 'TGC'));
  });

  test('mergeDescriptors keeps one mod per name, the earlier list winning', () => {
    const checkout = mod('Greater Flavor Mod', 'GFM', { folder: path.resolve('/repo/GFM') });
    const merged = mergeDescriptors([checkout], [gfm, gfmNews]);
    assert.deepStrictEqual(merged.map((item) => item.folder), [gfmNews.folder, path.resolve('/repo/GFM')]);
  });

  test('detectModDirectory walks up to the folder holding .mod files', () => {
    const listFiles = (directory: string, extension: string): string[] =>
      directory === path.resolve('/repo') && extension === '.mod' ? ['GFM.mod'] : [];
    assert.strictEqual(detectModDirectory(path.resolve('/repo/GFM/events'), listFiles), path.resolve('/repo'));
    assert.strictEqual(detectModDirectory(path.resolve('/elsewhere/x'), listFiles), undefined);
  });
});

suite('modLayout — game root and file location', () => {
  const directories = new Set(
    ['mod', 'common', 'map', 'mod/TGC', 'mod/TGC/common', 'mod/TGC/events'].map((folder) => path.join(GAME, folder)),
  );
  const isDirectory = (directory: string): boolean => directories.has(path.resolve(directory));

  test('detectGameRoot walks up to the folder holding mod/, common/ and map/', () => {
    assert.strictEqual(detectGameRoot(path.join(GAME, 'mod', 'TGC', 'events'), isDirectory), GAME);
    assert.strictEqual(detectGameRoot(GAME, isDirectory), GAME);
    assert.strictEqual(detectGameRoot(path.resolve('/elsewhere/mod/TGC'), isDirectory), undefined);
  });

  const layout: ModLayout = { gameRoot: GAME, mods, selection: resolveSelection(mods, [tgc.name, performance.name]) };

  test('a file of a selected mod is read with the whole selection', () => {
    const location = locateFile(layout, path.join(GAME, 'mod', 'TGCPerformanceAddon', 'decisions', 'X.txt'));
    assert.strictEqual(location?.root, path.join(GAME, 'mod', 'TGCPerformanceAddon'));
    assert.deepStrictEqual(location.layers.roots, [GAME, path.join(GAME, 'mod', 'TGC'), path.join(GAME, 'mod', 'TGCPerformanceAddon')]);
    assert.strictEqual(
      locateFile(layout, path.join(GAME, 'mod', 'TGC', 'events', 'E.txt'))?.layers.key,
      location.layers.key,
      'the base mod shares the selection stack',
    );
  });

  test('a file of an unselected mod is read with that mod and its dependencies only', () => {
    const location = locateFile(layout, path.join(GAME, 'mod', 'GFM Newspapers', 'news', 'N.txt'));
    assert.strictEqual(location?.root, path.join(GAME, 'mod', 'GFM Newspapers'));
    assert.deepStrictEqual(location.layers.roots, [GAME, path.join(GAME, 'mod', 'GFM'), path.join(GAME, 'mod', 'GFM Newspapers')]);
  });

  test('a mod folder without a descriptor is read on top of the game alone', () => {
    const location = locateFile(layout, path.join(GAME, 'mod', 'Scratch', 'events', 'E.txt'));
    assert.strictEqual(location?.root, path.join(GAME, 'mod', 'Scratch'));
    assert.deepStrictEqual(location.layers.roots, [GAME, path.join(GAME, 'mod', 'Scratch')]);
  });

  test('a checkout outside the install is read over the game and its installed dependencies', () => {
    const checkout = mod('GFM Newspapers Submod', 'GFM Newspapers', {
      folder: path.resolve('/repo/GFM Newspapers'),
      dependencies: ['Greater Flavor Mod'],
    });
    const withCheckout: ModLayout = { gameRoot: GAME, mods: mergeDescriptors([checkout], mods), selection: [] };
    const location = locateFile(withCheckout, path.resolve('/repo/GFM Newspapers/news/N.txt'));
    assert.strictEqual(location?.root, checkout.folder);
    assert.deepStrictEqual(location.layers.roots, [GAME, gfm.folder, checkout.folder]);
  });

  test('a lone folder with common/ is read over the game when there is an install, alone otherwise', () => {
    const root = path.resolve('/repo/MyMod');
    assert.deepStrictEqual(locateLoneMod(layout, root).layers.roots, [GAME, root]);
    assert.deepStrictEqual(locateLoneMod({ gameRoot: undefined, mods: [], selection: [] }, root).layers.roots, [root]);
  });

  test('without an install, mods around the workspace are still read over their dependencies', () => {
    const withoutGame: ModLayout = { gameRoot: undefined, mods, selection: [] };
    const location = locateFile(withoutGame, path.join(gfmNews.folder, 'news', 'N.txt'));
    assert.deepStrictEqual(location?.layers.roots, [gfm.folder, gfmNews.folder]);
    assert.strictEqual(locateFile(withoutGame, path.join(GAME, 'events', 'V.txt')), undefined);
  });

  test('a game file is read with the game alone; a file outside the install has no location', () => {
    const location = locateFile(layout, path.join(GAME, 'events', 'Vanilla.txt'));
    assert.strictEqual(location?.root, GAME);
    assert.deepStrictEqual(location.layers.roots, [GAME]);
    assert.strictEqual(locateFile(layout, path.resolve('/elsewhere/events/E.txt')), undefined);
    assert.strictEqual(locateFile({ gameRoot: undefined, mods: [], selection: [] }, path.join(GAME, 'x.txt')), undefined);
    assert.strictEqual(
      locateFile(layout, path.join(GAME, 'mod', 'TGC.mod'))?.root,
      GAME,
      'a descriptor belongs to the game folder, not to a mod',
    );
  });

  test('replace_path of a mod in the stack hides the game folder for every file read through it', () => {
    const location = locateFile(layout, path.join(GAME, 'mod', 'TGC', 'events', 'E.txt'));
    assert.strictEqual(location?.layers.hiddenFolders.length, 1);
    assert.ok(location.layers.hiddenFolders[0]?.endsWith('/events/'));
  });
});
