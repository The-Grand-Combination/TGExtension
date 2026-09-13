import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BoundedCache } from '../../services/boundedCache.js';
import { findModRoot } from '../../io/modFiles.js';
import { ModCache } from '../../services/modCache.js';
import { layersOf, singleRootLayers } from '../../services/modLayers.js';
import { isInsideRoot, relativeToRoot, type FileLocation } from '../../services/modLayout.js';
import {
  configChange,
  configEquals,
  DEFAULT_CONFIG,
  layoutConfigEquals,
  readServerConfig,
} from '../../server/serverConfig.js';
import type { ModIndex } from '../../model/modIndex.js';
import { duplicateDiagnosticsByFile, duplicateDiagnosticsFor } from '../../services/duplicateDiagnostics.js';
import { buildTestIndex } from './testIndex.js';

suite('BoundedCache', () => {
  test('evicts the least recently used entry past the limit', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.strictEqual(cache.size, 2);
    assert.ok(!cache.has('a'));
    assert.ok(cache.has('c'));
  });

  test('a read marks an entry as recently used', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.ok(cache.has('a'), 'a was read most recently and should survive');
    assert.ok(!cache.has('b'));
  });

  test('caches a "not found" value distinctly from a missing key', () => {
    const cache = new BoundedCache<string, string | undefined>(4);
    cache.set('missing.dds', undefined);
    assert.ok(cache.has('missing.dds'));
    assert.strictEqual(cache.get('missing.dds'), undefined);
    assert.ok(!cache.has('other.dds'));
  });

  test('delete removes one entry and clear removes all', () => {
    const cache = new BoundedCache<string, number>(4);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.delete('a');
    assert.ok(!cache.has('a'));
    assert.ok(cache.has('b'));
    cache.clear();
    assert.strictEqual(cache.size, 0);
  });
});

suite('modLayout — path helpers', () => {
  const root = path.join(os.tmpdir(), 'vic2-root');

  test('isInsideRoot accepts descendants and rejects the root itself and siblings', () => {
    assert.ok(isInsideRoot(root, path.join(root, 'events', 'A.txt')));
    assert.ok(!isInsideRoot(root, root));
    assert.ok(!isInsideRoot(root, path.join(os.tmpdir(), 'vic2-root-other', 'events', 'A.txt')));
    assert.ok(!isInsideRoot(root, path.join(os.tmpdir(), 'elsewhere.txt')));
  });

  test('relativeToRoot always yields forward slashes', () => {
    assert.strictEqual(relativeToRoot(root, path.join(root, 'history', 'wars', 'W.txt')), 'history/wars/W.txt');
  });
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

suite('modCache — location and index caching', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2cache-'));
  const modA = path.join(directory, 'ModA');
  const modB = path.join(directory, 'ModB');
  for (const mod of [modA, modB]) {
    fs.mkdirSync(path.join(mod, 'common'), { recursive: true });
    fs.mkdirSync(path.join(mod, 'events'), { recursive: true });
  }
  const layersA = singleRootLayers(modA);
  const layersB = singleRootLayers(modB);

  interface Harness {
    readonly cache: ModCache;
    readonly builds: string[];
    readonly built: string[];
    readonly located: string[];
    /** One gate per build, in start order; a build finishes when its gate is resolved. */
    readonly gates: Deferred<ModIndex>[];
  }

  function newCache(options: { gated?: boolean } = {}): Harness {
    const builds: string[] = [];
    const built: string[] = [];
    const located: string[] = [];
    const gates: Deferred<ModIndex>[] = [];
    const cache = new ModCache({
      locate: (fsPath): FileLocation | undefined => {
        located.push(fsPath);
        const root = findModRoot(fsPath);
        return root === undefined ? undefined : { root, layers: singleRootLayers(root) };
      },
      buildIndex: (layers): Promise<ModIndex> => {
        builds.push(layers.key);
        if (options.gated !== true) {
          return Promise.resolve(buildTestIndex());
        }
        const gate = deferred<ModIndex>();
        gates.push(gate);
        return gate.promise;
      },
      onIndexBuilt: (layers): void => {
        built.push(layers.key);
      },
    });
    return { cache, builds, built, located, gates };
  }

  test('builds one index per layers key, shared by concurrent callers', async () => {
    const { cache, builds, built } = newCache();
    const [first, second, other] = await Promise.all([
      cache.ensureIndex(layersA),
      cache.ensureIndex(layersA),
      cache.ensureIndex(layersB),
    ]);
    assert.deepStrictEqual(builds, [layersA.key, layersB.key]);
    assert.deepStrictEqual(built, [layersA.key, layersB.key]);
    assert.ok(first);
    assert.strictEqual(first, second);
    assert.notStrictEqual(first, other);
  });

  test('a context without an index starts the build and carries the index once it lands', async () => {
    const { cache } = newCache();
    const before = cache.contextFor(path.join(modA, 'events', 'One.txt'));
    assert.strictEqual(before?.root, modA);
    assert.strictEqual(before.layers.key, layersA.key);
    assert.strictEqual(before.relativePath, 'events/One.txt');
    assert.strictEqual(before.index, undefined);
    assert.ok(cache.isBuilding(layersA));
    await cache.ensureIndex(layersA);
    assert.ok(cache.contextFor(path.join(modA, 'events', 'Two.txt'))?.index);
    assert.ok(!cache.isBuilding(layersA));
  });

  test('locates once per directory and caches the miss for a directory outside any mod', () => {
    const { cache, builds, located } = newCache();
    const outside = path.join(directory, 'notamod.txt');
    assert.strictEqual(cache.contextFor(outside), undefined);
    assert.strictEqual(cache.contextFor(path.join(directory, 'other.txt')), undefined);
    assert.deepStrictEqual(cache.knownLayers(), []);
    assert.deepStrictEqual(builds, []);
    assert.strictEqual(located.length, 1);
    cache.resetLocations();
    assert.strictEqual(cache.contextFor(outside), undefined);
    assert.strictEqual(located.length, 2, 'resetLocations drops the cached miss');
  });

  test('refresh keeps serving the old index until the new one is ready', async () => {
    const { cache, builds, gates } = newCache({ gated: true });
    const pending = cache.ensureIndex(layersA);
    gates[0]?.resolve(buildTestIndex());
    const first = await pending;
    cache.refresh([layersA]);
    assert.strictEqual(cache.indexFor(layersA), first, 'the previous index stays in place');
    assert.ok(cache.isBuilding(layersA));
    const refreshed = cache.ensureIndex(layersA);
    gates[1]?.resolve(buildTestIndex());
    const second = await refreshed;
    assert.ok(second);
    assert.notStrictEqual(second, first);
    assert.strictEqual(cache.indexFor(layersA), second);
    assert.deepStrictEqual(builds, [layersA.key, layersA.key]);
  });

  test('resetLocations keeps the indexes, which is why a new code page has to refresh them', async () => {
    const { cache, builds } = newCache();
    await cache.ensureIndex(layersA);
    cache.resetLocations();
    await cache.ensureIndex(layersA);
    assert.deepStrictEqual(builds, [layersA.key], 'a plain layout change reuses an identical stack');
    cache.refresh(cache.knownLayers());
    await cache.ensureIndex(layersA);
    assert.deepStrictEqual(builds, [layersA.key, layersA.key], 'only refresh reads the files again');
  });

  test('a refresh during a build runs the build again, so no change is missed', async () => {
    const { cache, builds, built, gates } = newCache({ gated: true });
    const pending = cache.ensureIndex(layersA);
    cache.refresh([layersA]);
    gates[0]?.resolve(buildTestIndex());
    await nextTick();
    assert.deepStrictEqual(builds, [layersA.key, layersA.key]);
    gates[1]?.resolve(buildTestIndex());
    assert.ok(await pending);
    assert.deepStrictEqual(built, [layersA.key], 'only the fresh build is announced');
  });

  test('forget drops the index and discards a build still running', async () => {
    const { cache, built, gates } = newCache({ gated: true });
    const pending = cache.ensureIndex(layersA);
    cache.forget([layersA]);
    gates[0]?.resolve(buildTestIndex());
    assert.strictEqual(await pending, undefined);
    assert.ok(!cache.hasIndex(layersA));
    assert.deepStrictEqual(built, []);
  });

  test('a failing build is reported and leaves no index behind', async () => {
    const failures: string[] = [];
    const cache = new ModCache({
      locate: (): undefined => undefined,
      buildIndex: (): Promise<ModIndex> => Promise.reject(new Error('boom')),
      onBuildFailed: (layers, error): void => {
        failures.push(`${layers.key}: ${error instanceof Error ? error.message : 'unknown'}`);
      },
    });
    assert.strictEqual(await cache.ensureIndex(layersA), undefined);
    assert.deepStrictEqual(failures, [`${layersA.key}: boom`]);
    assert.ok(!cache.hasIndex(layersA));
    assert.ok(!cache.isBuilding(layersA));
  });

  test('invalidating one mod leaves the other index alone', async () => {
    const { cache, builds } = newCache();
    await Promise.all([cache.ensureIndex(layersA), cache.ensureIndex(layersB)]);
    cache.refresh([layersA]);
    await Promise.all([cache.ensureIndex(layersA), cache.ensureIndex(layersB)]);
    assert.deepStrictEqual(builds, [layersA.key, layersB.key, layersA.key]);
  });

  test('layersContaining picks every indexed stack with a root the changed file belongs to', async () => {
    const { cache } = newCache();
    const stacked = layersOf(directory, [
      { name: 'A', path: 'ModA', folder: modA, replacePaths: [], dependencies: [], descriptorPath: '' },
      { name: 'B', path: 'ModB', folder: modB, replacePaths: [], dependencies: [], descriptorPath: '' },
    ]);
    await Promise.all([cache.ensureIndex(layersA), cache.ensureIndex(layersB), cache.ensureIndex(stacked)]);
    assert.deepStrictEqual(
      cache.layersContaining([path.join(modB, 'common', 'cultures.txt')]).map((layers) => layers.key),
      [layersB.key, stacked.key],
    );
    assert.deepStrictEqual(cache.layersContaining([path.join(os.tmpdir(), 'stray.txt')]), []);
  });

  test('reports whether layers have been indexed, without building', async () => {
    const { cache, builds } = newCache();
    assert.ok(!cache.hasIndex(layersA));
    assert.deepStrictEqual(builds, []);
    await cache.ensureIndex(layersA);
    assert.ok(cache.hasIndex(layersA));
    assert.deepStrictEqual(builds, [layersA.key]);
  });
});

suite('modIndex — memoized duplicate lookup', () => {
  const index = buildTestIndex({
    'common/buildings.txt': 'fort = { }\nfort = { }\n',
  });

  test('returns the same diagnostics as the full map', () => {
    const expected = duplicateDiagnosticsByFile(index).get('common/buildings.txt') ?? [];
    assert.deepStrictEqual(duplicateDiagnosticsFor(index, 'common/buildings.txt'), expected);
    assert.strictEqual(expected.length, 2);
  });

  test('returns an empty list for a file with no duplicates', () => {
    assert.deepStrictEqual(duplicateDiagnosticsFor(index, 'events/Existing.txt'), []);
  });

  test('memoizes per index object', () => {
    const first = duplicateDiagnosticsFor(index, 'common/buildings.txt');
    assert.strictEqual(duplicateDiagnosticsFor(index, 'common/buildings.txt'), first);
    const other = buildTestIndex({ 'common/buildings.txt': 'fort = { }\nfort = { }\n' });
    assert.notStrictEqual(duplicateDiagnosticsFor(other, 'common/buildings.txt'), first);
  });
});

suite('serverConfig', () => {
  test('reads the nested victorianTools bag', () => {
    const config = readServerConfig({
      validation: { enable: false, delay: 750 },
      index: { rebuildDelay: 1200, onStartup: false },
    });
    assert.deepStrictEqual(config, {
      validationEnabled: false,
      validationDelayMs: 750,
      indexRebuildDelayMs: 1200,
      indexOnStartup: false,
      gamePath: '',
      activeMods: [],
      encoding: 'windows-1252',
      locKeyPattern: '^EVT',
      flagNamePattern: '',
      nullTagPattern: '^(QQQ|---|null)$',
      nullTagSuppressWarnings: true,
      provinceFolderPattern: '',
      ignoreMarker: '#VT - Skip Validation',
    });
  });

  test('a new province folder pattern is a layout change, so the Map Editor caches are cleared', () => {
    const all = readServerConfig({});
    const narrowed = readServerConfig({ mapEditor: { provinceFolderPattern: '^middle' } });
    assert.strictEqual(all.provinceFolderPattern, '');
    assert.strictEqual(narrowed.provinceFolderPattern, '^middle');
    assert.strictEqual(readServerConfig({ mapEditor: { provinceFolderPattern: 7 } }).provinceFolderPattern, '');
    assert.ok(!configEquals(all, narrowed));
    assert.ok(!layoutConfigEquals(all, narrowed), 'only the layout path invalidates the cached owners');
    assert.ok(layoutConfigEquals(narrowed, readServerConfig({ mapEditor: { provinceFolderPattern: '^middle' } })));
  });

  test('the code page is one of the two the manifest offers, or the default', () => {
    assert.strictEqual(readServerConfig({}).encoding, 'windows-1252');
    assert.strictEqual(readServerConfig({ encoding: 'windows-1251' }).encoding, 'windows-1251');
    // A hand-edited settings.json cannot hand the decoder an encoding it does not have.
    assert.strictEqual(readServerConfig({ encoding: 'latin1' }).encoding, 'windows-1252');
    assert.strictEqual(readServerConfig({ encoding: 7 }).encoding, 'windows-1252');
  });

  test('a new code page is a layout change, so the layers are read again', () => {
    const latin = readServerConfig({});
    const cyrillic = readServerConfig({ encoding: 'windows-1251' });
    assert.ok(!configEquals(latin, cyrillic));
    assert.ok(!layoutConfigEquals(latin, cyrillic), 'the index holds already-decoded text');
    assert.ok(layoutConfigEquals(cyrillic, readServerConfig({ encoding: 'windows-1251' })));
  });

  test('a code page change is told apart from every other layout change', () => {
    const latin = readServerConfig({});
    const cyrillic = readServerConfig({ encoding: 'windows-1251' });
    assert.strictEqual(configChange(latin, latin), 'none');
    // Reloading the layout is not enough here: the roots are the same, so every
    // index would be reused, holding text decoded with the page just replaced.
    assert.strictEqual(configChange(latin, cyrillic), 'recoded');
    assert.strictEqual(configChange(cyrillic, latin), 'recoded');
    assert.strictEqual(configChange(latin, readServerConfig({ gamePath: 'F:/game' })), 'layout');
    assert.strictEqual(
      configChange(latin, readServerConfig({ mapEditor: { provinceFolderPattern: '^middle' } })),
      'layout',
    );
    assert.strictEqual(configChange(latin, readServerConfig({ ignoreMarker: '# skip' })), 'other');
  });

  test('the localisation key pattern falls back to the manifest default, and an empty one is kept', () => {
    assert.strictEqual(readServerConfig({}).locKeyPattern, '^EVT');
    assert.strictEqual(readServerConfig({ localisation: { keyPattern: '' } }).locKeyPattern, '');
    assert.strictEqual(readServerConfig({ localisation: { keyPattern: 7 } }).locKeyPattern, '^EVT');
    assert.strictEqual(readServerConfig({ localisation: { keyPattern: '^(EVT|DBG)' } }).locKeyPattern, '^(EVT|DBG)');
  });

  test('null tag warnings are suppressed by default, and turning them on is an "other" change', () => {
    const quiet = readServerConfig({});
    const loud = readServerConfig({ nullTags: { suppressWarnings: false } });
    assert.strictEqual(quiet.nullTagSuppressWarnings, true);
    assert.strictEqual(loud.nullTagSuppressWarnings, false);
    assert.strictEqual(readServerConfig({ nullTags: { suppressWarnings: 'no' } }).nullTagSuppressWarnings, true);
    // Nothing indexed depends on it, so the open documents are simply revalidated.
    assert.strictEqual(configChange(quiet, loud), 'other');
  });

  test('the null tag pattern defaults to the three conventional spellings', () => {
    assert.strictEqual(readServerConfig({}).nullTagPattern, '^(QQQ|---|null)$');
    assert.strictEqual(readServerConfig({ nullTags: { pattern: '' } }).nullTagPattern, '', 'empty allows no exception');
    assert.strictEqual(readServerConfig({ nullTags: { pattern: '^(QQQ|XXX)$' } }).nullTagPattern, '^(QQQ|XXX)$');
  });

  test('the ignore marker defaults to the shipped one, and empty turns it off', () => {
    assert.strictEqual(readServerConfig({}).ignoreMarker, '#VT - Skip Validation');
    assert.strictEqual(readServerConfig({ ignoreMarker: '' }).ignoreMarker, '');
    assert.strictEqual(readServerConfig({ ignoreMarker: 'NOLINT' }).ignoreMarker, 'NOLINT');
    assert.strictEqual(readServerConfig({ ignoreMarker: 7 }).ignoreMarker, '#VT - Skip Validation');
  });

  test('the flag name pattern defaults to empty, which checks every flag', () => {
    assert.strictEqual(readServerConfig({}).flagNamePattern, '');
    assert.strictEqual(readServerConfig({ flags: { namePattern: 7 } }).flagNamePattern, '');
    assert.strictEqual(readServerConfig({ flags: { namePattern: '^tgc_' } }).flagNamePattern, '^tgc_');
  });

  test('reads the game path and the mod selection, dropping anything that is not a name', () => {
    const config = readServerConfig({
      gamePath: ' F:/Victoria 2 ',
      activeMods: ['TGC - The Grand Combination', 3, '', ' Spaced '],
    });
    assert.strictEqual(config.gamePath, 'F:/Victoria 2');
    assert.deepStrictEqual(config.activeMods, ['TGC - The Grand Combination', 'Spaced']);
    assert.deepStrictEqual(readServerConfig({ activeMods: 'one' }).activeMods, []);
  });

  test('layoutConfigEquals looks only at the fields that decide which mods are read', () => {
    const selected = { ...DEFAULT_CONFIG, activeMods: ['TGC', 'A', 'B'] };
    assert.ok(layoutConfigEquals(selected, { ...selected, validationDelayMs: 1 }));
    assert.ok(!layoutConfigEquals(selected, { ...selected, activeMods: ['TGC', 'B', 'A'] }));
    assert.ok(!layoutConfigEquals(selected, { ...selected, gamePath: 'x' }));
    assert.ok(!configEquals(selected, { ...selected, activeMods: ['GFM'] }));
  });

  test('falls back to the manifest defaults for missing or wrong types', () => {
    assert.deepStrictEqual(readServerConfig(undefined), DEFAULT_CONFIG);
    assert.deepStrictEqual(readServerConfig({}), DEFAULT_CONFIG);
    assert.deepStrictEqual(readServerConfig({ validation: 'yes', index: 3 }), DEFAULT_CONFIG);
    assert.deepStrictEqual(readServerConfig({ validation: { enable: 'no', delay: 'fast' } }), DEFAULT_CONFIG);
  });

  test('clamps delays so a hand-edited setting cannot spin or hang the server', () => {
    assert.strictEqual(readServerConfig({ validation: { delay: -50 } }).validationDelayMs, 0);
    assert.strictEqual(readServerConfig({ validation: { delay: 99999 } }).validationDelayMs, 5000);
    assert.strictEqual(readServerConfig({ index: { rebuildDelay: 0 } }).indexRebuildDelayMs, 50);
    assert.strictEqual(readServerConfig({ index: { rebuildDelay: 99999 } }).indexRebuildDelayMs, 10000);
    assert.strictEqual(readServerConfig({ validation: { delay: 12.7 } }).validationDelayMs, 13);
    assert.strictEqual(readServerConfig({ validation: { delay: Number.NaN } }).validationDelayMs, 300);
  });

  test('configEquals detects any changed field', () => {
    assert.ok(configEquals(DEFAULT_CONFIG, readServerConfig({})));
    assert.ok(!configEquals(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, validationDelayMs: 10 }));
    assert.ok(!configEquals(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, indexOnStartup: false }));
  });
});
