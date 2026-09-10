import * as assert from 'node:assert';
import * as path from 'node:path';
import type { ModDescriptor } from '../../model/modDescriptor.js';
import {
  isHiddenPath,
  layeredIndexProvider,
  layersOf,
  listLayeredFiles,
  listLayeredFilesRecursive,
  resolveLayeredFile,
  singleRootLayers,
  type LayerFileSystem,
} from '../../services/modLayers.js';

const GAME = path.resolve('/game');

function mod(name: string, folder: string, extra: Partial<ModDescriptor> = {}): ModDescriptor {
  return {
    name,
    path: `mod/${folder}`,
    folder: path.join(GAME, 'mod', folder),
    replacePaths: [],
    dependencies: [],
    descriptorPath: '',
    ...extra,
  };
}

/** An in-memory tree keyed by absolute path with forward slashes. */
function fakeFileSystem(files: Readonly<Record<string, string>>): LayerFileSystem & { texts: Map<string, string> } {
  const texts = new Map(Object.entries(files).map(([key, text]) => [path.resolve(key), text]));
  const under = (directory: string): string[] => {
    const prefix = `${path.resolve(directory)}${path.sep}`;
    return [...texts.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  };
  return {
    texts,
    fileExists: (absolutePath): boolean => texts.has(path.resolve(absolutePath)),
    listFiles: (directory, extension): string[] =>
      under(directory).filter((rest) => !rest.includes(path.sep) && rest.toLowerCase().endsWith(extension)),
    listFilesRecursive: (root, folder): string[] =>
      under(path.join(root, folder)).map((rest) => `${folder}/${rest.split(path.sep).join('/')}`),
  };
}

const tgc = mod('TGC', 'TGC', { replacePaths: ['events', 'gfx/pictures/events'] });
const submod = mod('Sub', 'Sub', { dependencies: ['TGC'] });

const fileSystem = fakeFileSystem({
  '/game/events/Vanilla.txt': 'vanilla',
  '/game/events/Shared.txt': 'vanilla shared',
  '/game/decisions/Vanilla.txt': 'vanilla decision',
  '/game/decisions/Shared.txt': 'vanilla shared decision',
  '/game/common/countries.txt': 'vanilla countries',
  '/game/mod/TGC/events/Shared.txt': 'tgc shared',
  '/game/mod/TGC/events/Only.txt': 'tgc only',
  '/game/mod/TGC/decisions/Shared.txt': 'tgc shared decision',
  '/game/mod/TGC/common/countries.txt': 'tgc countries',
  '/game/mod/TGC/history/provinces/africa/1.txt': 'tgc province',
  '/game/mod/Sub/events/Only.txt': 'sub only',
  '/game/mod/Sub/history/provinces/africa/2.txt': 'sub province',
});

suite('modLayers', () => {
  test('layersOf stacks the game root and the mods in order and hides replaced game folders', () => {
    const layers = layersOf(GAME, [tgc, submod]);
    assert.deepStrictEqual(layers.roots, [GAME, tgc.folder, submod.folder]);
    assert.ok(isHiddenPath(layers, path.join(GAME, 'events', 'Vanilla.txt')));
    assert.ok(isHiddenPath(layers, path.join(GAME, 'events')));
    assert.ok(isHiddenPath(layers, path.join(GAME, 'gfx', 'pictures', 'events', 'x.dds')));
    assert.ok(!isHiddenPath(layers, path.join(GAME, 'eventsx', 'a.txt')), 'a prefix match must be a folder match');
    assert.ok(!isHiddenPath(layers, path.join(GAME, 'decisions', 'Vanilla.txt')));
    assert.ok(!isHiddenPath(layers, path.join(GAME, 'mod', 'TGC', 'events', 'Only.txt')));
  });

  test('the key identifies the stack, including what it hides', () => {
    assert.strictEqual(layersOf(GAME, [tgc]).key, layersOf(GAME, [tgc]).key);
    assert.notStrictEqual(layersOf(GAME, [tgc]).key, layersOf(GAME, [mod('TGC', 'TGC')]).key);
    assert.notStrictEqual(layersOf(GAME, [tgc, submod]).key, layersOf(GAME, [submod, tgc]).key);
  });

  test('resolveLayeredFile prefers the highest layer and skips hidden game folders', () => {
    const layers = layersOf(GAME, [tgc, submod]);
    const resolve = (relativePath: string): string | undefined =>
      resolveLayeredFile(layers, fileSystem, relativePath);
    assert.strictEqual(resolve('events/Only.txt'), path.join(GAME, 'mod', 'Sub', 'events', 'Only.txt'));
    assert.strictEqual(resolve('events/Shared.txt'), path.join(GAME, 'mod', 'TGC', 'events', 'Shared.txt'));
    assert.strictEqual(resolve('events/Vanilla.txt'), undefined, 'events/ is replaced, vanilla is gone');
    assert.strictEqual(resolve('decisions/Vanilla.txt'), path.join(GAME, 'decisions', 'Vanilla.txt'));
    assert.strictEqual(resolve('decisions/Shared.txt'), path.join(GAME, 'mod', 'TGC', 'decisions', 'Shared.txt'));
    assert.strictEqual(resolve('common/missing.txt'), undefined);
  });

  test('listLayeredFiles merges folder listings by name, later layers first', () => {
    const layers = layersOf(GAME, [tgc, submod]);
    assert.deepStrictEqual(listLayeredFiles(layers, fileSystem, 'events', '.txt').sort(), ['Only.txt', 'Shared.txt']);
    assert.deepStrictEqual(listLayeredFiles(layers, fileSystem, 'decisions', '.txt').sort(), [
      'Shared.txt',
      'Vanilla.txt',
    ]);
    const unreplaced = layersOf(GAME, [mod('TGC', 'TGC')]);
    assert.deepStrictEqual(listLayeredFiles(unreplaced, fileSystem, 'events', '.txt').sort(), [
      'Only.txt',
      'Shared.txt',
      'Vanilla.txt',
    ]);
  });

  test('listLayeredFilesRecursive merges by relative path', () => {
    const layers = layersOf(GAME, [tgc, submod]);
    assert.deepStrictEqual(listLayeredFilesRecursive(layers, fileSystem, 'history').sort(), [
      'history/provinces/africa/1.txt',
      'history/provinces/africa/2.txt',
    ]);
    assert.deepStrictEqual(listLayeredFilesRecursive(layers, fileSystem, 'events').sort(), [
      'events/Only.txt',
      'events/Shared.txt',
    ]);
  });

  test('a replace_path may point into another mod, hiding that mod folder too', () => {
    const shattered = mod('Shattered', 'Shattered', {
      dependencies: ['TGC'],
      replacePaths: ['mod/TGC/history/provinces'],
    });
    const layers = layersOf(GAME, [tgc, shattered]);
    assert.deepStrictEqual(listLayeredFilesRecursive(layers, fileSystem, 'history'), []);
    assert.strictEqual(resolveLayeredFile(layers, fileSystem, 'history/provinces/africa/1.txt'), undefined);
  });

  test('case-insensitive layers treat differently cased names as one file', () => {
    const files = fakeFileSystem({ '/game/events/A.txt': 'v', '/game/mod/M/events/a.txt': 'm' });
    const sensitive = layersOf(GAME, [mod('M', 'M')]);
    const insensitive = layersOf(GAME, [mod('M', 'M')], { caseInsensitivePaths: true });
    assert.strictEqual(listLayeredFiles(sensitive, files, 'events', '.txt').length, 2);
    assert.deepStrictEqual(listLayeredFiles(insensitive, files, 'events', '.txt'), ['a.txt']);
  });

  test('layeredIndexProvider reads what the game would read', () => {
    const provider = layeredIndexProvider(layersOf(GAME, [tgc, submod]), fileSystem, (absolutePath) =>
      fileSystem.texts.get(path.resolve(absolutePath)),
    );
    assert.strictEqual(provider.readFile('common/countries.txt'), 'tgc countries');
    assert.strictEqual(provider.readFile('events/Only.txt'), 'sub only');
    assert.strictEqual(provider.readFile('events/Vanilla.txt'), undefined);
    assert.deepStrictEqual(provider.listFiles('common', '.txt'), ['countries.txt']);
  });

  test('without a game root nothing is hidden and only the mod folders are read', () => {
    const layers = layersOf(undefined, [tgc, submod]);
    assert.deepStrictEqual(layers.roots, [tgc.folder, submod.folder]);
    assert.deepStrictEqual(layers.hiddenFolders, []);
    assert.strictEqual(listLayeredFiles(layers, fileSystem, 'decisions', '.txt').length, 1);
  });

  test('singleRootLayers reads one folder with nothing underneath', () => {
    const layers = singleRootLayers(path.join(GAME, 'mod', 'TGC'));
    assert.strictEqual(layers.gameRoot, undefined);
    assert.deepStrictEqual(listLayeredFiles(layers, fileSystem, 'decisions', '.txt'), ['Shared.txt']);
  });
});
