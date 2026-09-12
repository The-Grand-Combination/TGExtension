import * as assert from 'node:assert';
import type {
  MapEditorTargetParams,
  ProvinceHistory,
  ProvincePositions,
  SaveParams,
} from '../../model/mapEditor.js';
import { MapEditorHandlers, type MapEditorHost } from '../../services/mapEditorHandlers.js';
import { singleRootLayers, type ModLayers } from '../../services/modLayers.js';
import type { FileLocation } from '../../services/modLayout.js';
import { buildTestIndex } from './testIndex.js';

const ROOT = '/mods/Test';
const LAYERS: ModLayers = singleRootLayers(ROOT);
const TARGET: FileLocation = { root: ROOT, layers: LAYERS };
const NO_MOD = 'No mod to edit: pick a mod, or open a mod folder in the workspace.';

interface Recorder {
  readonly host: MapEditorHost;
  readonly readTextPaths: string[];
}

/**
 * A host that resolves one mod and answers every read with `undefined`. Files are
 * reported as present so `resolveLayeredFile` yields a path and `readText` is reached.
 */
function recordingHost(targets: readonly FileLocation[] = [TARGET]): Recorder {
  const readTextPaths: string[] = [];
  const host: MapEditorHost = {
    targets: (): readonly FileLocation[] => targets,
    modNameOf: (root: string): string => root,
    ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> =>
      Promise.resolve(buildTestIndex()),
    fileSystem: {
      fileExists: (): boolean => true,
      listFiles: (): string[] => [],
      listFilesRecursive: (): string[] => [],
    },
    readText: (absolutePath: string): Promise<string | undefined> => {
      readTextPaths.push(absolutePath);
      return Promise.resolve(undefined);
    },
    readBytes: (): Promise<Uint8Array | undefined> => Promise.resolve(undefined),
    assetsFolder: '/extension/assets',
    writeText: (): Promise<boolean> => Promise.resolve(true),
    rename: (): Promise<boolean> => Promise.resolve(true),
  };
  return { host, readTextPaths };
}

const targetParams: MapEditorTargetParams = { workspaceFolders: [], mods: [] };

const EMPTY_HISTORY: ProvinceHistory = {
  owner: undefined,
  controller: undefined,
  cores: [],
  removeCores: [],
  tradeGoods: undefined,
  lifeRating: undefined,
  terrain: undefined,
  colonial: undefined,
  colony: undefined,
  isSlave: undefined,
  buildings: [],
  partyLoyalty: [],
  stateBuildings: [],
  setFlags: [],
  clrFlags: [],
  dated: [],
};

const EMPTY_POSITIONS: ProvincePositions = {
  unit: undefined,
  city: undefined,
  factory: undefined,
  fort: undefined,
  railroad: undefined,
  naval_base: undefined,
};

function saveParams(section: SaveParams['section']): SaveParams {
  const base = { ...targetParams, provinceId: 1, popDate: '1836.1.1' };
  switch (section) {
    case 'localisation':
      return { ...base, section, text: 'Test', renameHistoryFile: false };
    case 'history':
      return { ...base, section, data: EMPTY_HISTORY, createInFolder: undefined };
    case 'pops':
      return { ...base, section, pops: [], createInFile: undefined };
    case 'positions':
      return { ...base, section, data: EMPTY_POSITIONS };
  }
}

suite('MapEditorHandlers — no mod to edit', () => {
  const sections: readonly SaveParams['section'][] = ['localisation', 'history', 'pops', 'positions'];

  for (const section of sections) {
    test(`save(${section}) fails with the pick-a-mod reason`, async () => {
      const handlers = new MapEditorHandlers(recordingHost([]).host);
      const result = await handlers.save(saveParams(section));
      assert.deepStrictEqual(result, { ok: false, reason: NO_MOD });
    });
  }

  test('every read request reports the same reason', async () => {
    const handlers = new MapEditorHandlers(recordingHost([]).host);
    for (const result of [
      await handlers.map(targetParams),
      await handlers.province({ ...targetParams, provinceId: 1, popDate: '1836.1.1' }),
      await handlers.positions(targetParams),
      await handlers.countryColors(targetParams),
    ]) {
      assert.deepStrictEqual(result, { kind: 'unavailable', reason: NO_MOD });
    }
  });

  test('a terrain picture request degrades to no picture instead of an error', async () => {
    const handlers = new MapEditorHandlers(recordingHost([]).host);
    const result = await handlers.terrainPictureFor({ ...targetParams, terrain: 'desert' });
    assert.deepStrictEqual(result, { terrain: 'desert', pictureDataUri: undefined });
  });
});

suite('MapEditorHandlers — caching by layers key', () => {
  test('country colors are read once and reused', async () => {
    const { host, readTextPaths } = recordingHost();
    const handlers = new MapEditorHandlers(host);

    const first = await handlers.countryColors(targetParams);
    const afterFirst = readTextPaths.length;
    const second = await handlers.countryColors(targetParams);

    assert.ok(afterFirst > 0, 'the first call must reach readText');
    assert.strictEqual(readTextPaths.length, afterFirst, 'the second call must not read again');
    assert.deepStrictEqual(second, first);
  });

  test('invalidate makes the next call read again', async () => {
    const { host, readTextPaths } = recordingHost();
    const handlers = new MapEditorHandlers(host);

    await handlers.countryColors(targetParams);
    const afterFirst = readTextPaths.length;
    handlers.invalidate();
    await handlers.countryColors(targetParams);

    assert.strictEqual(readTextPaths.length, afterFirst * 2);
  });

  test('positions are read once and reused', async () => {
    const { host, readTextPaths } = recordingHost();
    const handlers = new MapEditorHandlers(host);

    await handlers.positions(targetParams);
    const afterFirst = readTextPaths.filter((path) => path.includes('positions')).length;
    await handlers.positions(targetParams);

    assert.strictEqual(afterFirst, 1);
    assert.strictEqual(readTextPaths.filter((path) => path.includes('positions')).length, 1);
  });
});
