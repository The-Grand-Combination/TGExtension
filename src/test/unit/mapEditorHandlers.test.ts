import * as assert from 'node:assert';
import { DEFAULT_CODEPAGE, type Codepage } from '../../io/textCodec.js';
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
  /** One entry per recursive listing, to tell a kept walk from a repeated one. */
  readonly walks: string[];
}

/**
 * A host that resolves one mod and answers every read with `undefined`. Files are
 * reported as present so `resolveLayeredFile` yields a path and `readText` is reached.
 */
function recordingHost(
  targets: readonly FileLocation[] = [TARGET],
  codepage: Codepage = DEFAULT_CODEPAGE,
  provinces: { readonly files?: readonly string[]; readonly pattern?: RegExp } = {},
): Recorder {
  const readTextPaths: string[] = [];
  const walks: string[] = [];
  const host: MapEditorHost = {
    targets: (): readonly FileLocation[] => targets,
    modNameOf: (root: string): string => root,
    ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> =>
      Promise.resolve(buildTestIndex()),
    fileSystem: {
      fileExists: (): boolean => true,
      listFiles: (): string[] => [],
      listFilesRecursive: (_root: string, relativeFolder: string): string[] => {
        walks.push(relativeFolder);
        return relativeFolder === 'history/provinces' ? [...(provinces.files ?? [])] : [];
      },
    },
    readText: (absolutePath: string): Promise<string | undefined> => {
      readTextPaths.push(absolutePath);
      return Promise.resolve(undefined);
    },
    readBytes: (): Promise<Uint8Array | undefined> => Promise.resolve(undefined),
    assetsFolder: '/extension/assets',
    writeText: (): Promise<boolean> => Promise.resolve(true),
    rename: (): Promise<boolean> => Promise.resolve(true),
    codepage: (): Codepage => codepage,
    historyFolderPattern: (): RegExp | undefined => provinces.pattern,
  };
  return { host, readTextPaths, walks };
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

suite('MapEditorHandlers — a name the code page cannot hold', () => {
  const cyrillic: SaveParams = {
    ...targetParams,
    provinceId: 1,
    popDate: '1836.1.1',
    section: 'localisation',
    text: 'Москва',
    renameHistoryFile: false,
  };

  test('a Cyrillic name is refused under windows-1252 instead of written as rubbish', async () => {
    const { host } = recordingHost([TARGET], 'windows-1252');
    const result = await new MapEditorHandlers(host).save(cyrillic);
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('М'), result.reason);
    assert.ok(result.reason.includes('windows-1252'), result.reason);
  });

  test('the same name is accepted under windows-1251', async () => {
    const { host } = recordingHost([TARGET], 'windows-1251');
    const result = await new MapEditorHandlers(host).save(cyrillic);
    assert.strictEqual(result.ok, true);
  });
});

suite('MapEditorHandlers — narrowing the province history folders', () => {
  /** A mod that declares the vanilla set as empty placeholders and holds its own provinces elsewhere. */
  const FILES = ['history/provinces/africa/1 - Fez.txt', 'history/provinces/middle earth/1 - Healleah.txt'];
  const province = { ...targetParams, provinceId: 1, popDate: '1836.1.1' };

  async function historyPathOf(pattern: RegExp | undefined): Promise<string | undefined> {
    const { host, readTextPaths } = recordingHost([TARGET], DEFAULT_CODEPAGE, {
      files: FILES,
      ...(pattern === undefined ? {} : { pattern }),
    });
    await new MapEditorHandlers(host).province(province);
    return readTextPaths.find((absolutePath) => absolutePath.includes('1 - '));
  }

  test('without a pattern the id is answered by whichever folder the walk reaches first', async () => {
    assert.ok((await historyPathOf(undefined))?.includes('africa'));
  });

  test('with a pattern the id is answered by the folder that matches', async () => {
    assert.ok((await historyPathOf(/^middle.*/i))?.includes('middle earth'));
  });

  test('the folder list offered for a new file is narrowed too', async () => {
    const { host } = recordingHost([TARGET], DEFAULT_CODEPAGE, { files: FILES, pattern: /^middle.*/i });
    const result = await new MapEditorHandlers(host).map(targetParams);
    assert.deepStrictEqual(result.kind === 'ready' ? result.historyFolders : undefined, ['middle earth']);
  });

  test('a save refuses to add a second file for an id whose only file the pattern hides', async () => {
    const hiddenOnly = { files: ['history/provinces/africa/1 - Fez.txt'], pattern: /^middle/i };
    const { host } = recordingHost([TARGET], DEFAULT_CODEPAGE, hiddenOnly);
    const result = await new MapEditorHandlers(host).save(saveParams('history'));
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes("'africa'"), result.reason);
    assert.ok(result.reason.includes('provinceFolderPattern'), result.reason);
  });

  test('with no pattern there is nothing hidden, so the same save creates the file', async () => {
    const { host } = recordingHost([TARGET], DEFAULT_CODEPAGE, { files: [] });
    assert.strictEqual((await new MapEditorHandlers(host).save(saveParams('history'))).ok, true);
  });
});

suite('MapEditorHandlers — writing', () => {
  test('a character the code page cannot store is named, in a history save as in a name', async () => {
    const { host } = recordingHost([TARGET], 'windows-1252');
    const flagged: SaveParams = { ...saveParams('history'), section: 'history', data: { ...EMPTY_HISTORY, setFlags: ['Москва'] }, createInFolder: undefined };
    const result = await new MapEditorHandlers(host).save(flagged);
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('М'), result.reason);
    assert.ok(result.reason.includes('windows-1252'), result.reason);
  });

  test('the province history folder is walked once, and again after a save adds a file', async () => {
    const { host, walks } = recordingHost([TARGET], DEFAULT_CODEPAGE, { files: [] });
    const handlers = new MapEditorHandlers(host);
    const province = { ...targetParams, provinceId: 1, popDate: '1836.1.1' };

    await handlers.province(province);
    await handlers.province(province);
    const provinceWalks = (): number => walks.filter((folder) => folder === 'history/provinces').length;
    assert.strictEqual(provinceWalks(), 1, 'a second click must reuse the walk');

    assert.strictEqual((await handlers.save(saveParams('history'))).ok, true);
    await handlers.province(province);
    assert.ok(provinceWalks() > 1, 'the file the save created must be found');
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
