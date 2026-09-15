import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_CODEPAGE, type Codepage } from '../../io/textCodec.js';
import type {
  MapEditorTargetParams,
  ProvinceHistory,
  ProvincePositions,
  SaveParams,
} from '../../model/mapEditor.js';
import { decodeBmp } from '../../services/bmpDecoder.js';
import { MapEditorHandlers, type MapEditorHost } from '../../services/mapEditorHandlers.js';
import { singleRootLayers, type ModLayers } from '../../services/modLayers.js';
import { encodeBmp24, encodeBmp8, grayPalette, packRgb } from './bmpFixtures.js';
import type { FileLocation } from '../../services/modLayout.js';
import { buildTestIndex } from './testIndex.js';

const ROOT = '/mods/Test';
const LAYERS: ModLayers = singleRootLayers(ROOT);
const TARGET: FileLocation = { root: ROOT, layers: LAYERS };
const NO_MOD = 'No mod to edit: pick a mod, or open a mod folder in the workspace.';
/** The pictures the extension ships, read off disk so a broken asset fails the test. */
const ASSETS = path.join(__dirname, '..', '..', '..', 'assets');

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
    writeBytes: (): Promise<boolean> => Promise.resolve(true),
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
    case 'history':
      return { ...base, section, data: EMPTY_HISTORY, climate: '', createInFolder: undefined };
    case 'pops':
      return { ...base, section, pops: [], createInFile: undefined };
    case 'positions':
      return { ...base, section, data: EMPTY_POSITIONS };
  }
}

suite('MapEditorHandlers — no mod to edit', () => {
  const sections: readonly SaveParams['section'][] = ['history', 'pops', 'positions'];

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

  test('a province with no terrain shows the picture shipped for that', async () => {
    const shipped = fs.readFileSync(path.join(ASSETS, 'no_terrain.dds'));
    const { host } = recordingHost();
    const handlers = new MapEditorHandlers({
      ...host,
      assetsFolder: ASSETS,
      readBytes: (absolutePath: string): Promise<Uint8Array | undefined> =>
        Promise.resolve(absolutePath === path.join(ASSETS, 'no_terrain.dds') ? new Uint8Array(shipped) : undefined),
    });
    const result = await handlers.province({ ...targetParams, provinceId: 1, popDate: '1836.1.1' });
    assert.ok(result.kind === 'details', result.kind === 'unavailable' ? result.reason : '');
    assert.strictEqual(result.details.terrain.name, undefined, 'the fixture mod has no terrain for the province');
    assert.ok(result.details.terrain.pictureDataUri?.startsWith('data:image/'), String(result.details.terrain.pictureDataUri));
  });

  test('the form asks for the same picture when it leaves the province with no terrain', async () => {
    const shipped = fs.readFileSync(path.join(ASSETS, 'no_terrain.dds'));
    const { host } = recordingHost();
    const handlers = new MapEditorHandlers({
      ...host,
      assetsFolder: ASSETS,
      readBytes: (): Promise<Uint8Array | undefined> => Promise.resolve(new Uint8Array(shipped)),
    });
    const result = await handlers.terrainPictureFor({ ...targetParams, terrain: '' });
    assert.strictEqual(result.terrain, '');
    assert.ok(result.pictureDataUri?.startsWith('data:image/'), String(result.pictureDataUri));
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
    section: 'history',
    data: EMPTY_HISTORY,
    climate: '',
    createInFolder: undefined,
    localisation: { text: 'Москва', renameHistoryFile: false },
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
    const flagged: SaveParams = { ...saveParams('history'), section: 'history', data: { ...EMPTY_HISTORY, setFlags: ['Москва'] }, climate: '', createInFolder: undefined };
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

suite('MapEditorHandlers — painting the map', () => {
  const RED = packRgb(255, 0, 0);
  const BLUE = packRgb(0, 0, 255);
  const GAME = '/game';

  interface Painter {
    readonly host: MapEditorHost;
    readonly written: { path: string; bytes: Uint8Array }[];
  }

  /** A host whose only file is provinces.bmp, in the root the last argument names. */
  function paintHost(holder: string, layers: ModLayers = LAYERS): Painter {
    const bitmap = path.join(holder, 'map/provinces.bmp');
    const bytes = encodeBmp24(2, 1, [RED, BLUE]);
    const written: { path: string; bytes: Uint8Array }[] = [];
    const host: MapEditorHost = {
      targets: (): readonly FileLocation[] => [{ root: ROOT, layers }],
      modNameOf: (root: string): string => root,
      ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> => Promise.resolve(buildTestIndex()),
      fileSystem: {
        fileExists: (absolutePath: string): boolean => absolutePath === bitmap,
        listFiles: (): string[] => [],
        listFilesRecursive: (): string[] => [],
      },
      readText: (): Promise<string | undefined> => Promise.resolve(undefined),
      readBytes: (absolutePath: string): Promise<Uint8Array | undefined> =>
        Promise.resolve(absolutePath === bitmap ? bytes : undefined),
      assetsFolder: '/extension/assets',
      writeText: (): Promise<boolean> => Promise.resolve(true),
      writeBytes: (absolutePath: string, content: Uint8Array): Promise<boolean> => {
        written.push({ path: absolutePath, bytes: content });
        return Promise.resolve(true);
      },
      rename: (): Promise<boolean> => Promise.resolve(true),
      codepage: (): Codepage => DEFAULT_CODEPAGE,
      historyFolderPattern: (): RegExp | undefined => undefined,
    };
    return { host, written };
  }

  test('writes the painted pixels into the target mod', async () => {
    const { host, written } = paintHost(ROOT);
    const result = await new MapEditorHandlers(host).paint({ ...targetParams, runs: [0, 1, BLUE] });
    assert.deepStrictEqual(result, { ok: true, path: path.join(ROOT, 'map/provinces.bmp'), pixels: 1 });
    assert.strictEqual(written.length, 1);
    const painted = decodeBmp(written[0]?.bytes ?? new Uint8Array());
    assert.ok(painted.kind === 'image');
    assert.strictEqual(painted.image.rgbAt(0, 0), BLUE);
  });

  test('a bitmap that comes from a layer below is written into the target as its own copy', async () => {
    const layers: ModLayers = { key: 'game+mod', gameRoot: GAME, roots: [GAME, ROOT], hiddenFolders: [], caseInsensitivePaths: false };
    const { host, written } = paintHost(GAME, layers);
    const result = await new MapEditorHandlers(host).paint({ ...targetParams, runs: [0, 1, BLUE] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(written[0]?.path, path.join(ROOT, 'map/provinces.bmp'));
  });

  test('says so when the picked mods have no provinces.bmp', async () => {
    const { host, written } = paintHost('/elsewhere');
    const result = await new MapEditorHandlers(host).paint({ ...targetParams, runs: [0, 1, BLUE] });
    assert.deepStrictEqual(result, { ok: false, reason: 'The picked mods have no map/provinces.bmp.' });
    assert.strictEqual(written.length, 0);
  });

  test('pixels outside the map are refused, and nothing is written', async () => {
    const { host, written } = paintHost(ROOT);
    const result = await new MapEditorHandlers(host).paint({ ...targetParams, runs: [5, 1, BLUE] });
    assert.deepStrictEqual(result, { ok: false, reason: 'painted pixels fall outside the map' });
    assert.strictEqual(written.length, 0);
  });
});

suite('MapEditorHandlers — creating a province from a painted colour', () => {
  const COLOR = (10 << 16) | (20 << 8) | 30;
  const DEFINITION = ';red;green;blue;x;x\n1;1;1;1;One;x\n2;2;2;2;Two;x\n';
  const DEFAULT_MAP = 'max_provinces = 3\nsea_starts = {\n\t2\n}\n';

  interface Maker {
    readonly host: MapEditorHost;
    readonly written: Map<string, string>;
  }

  /** A mod whose map folder holds definition.csv and default.map, and nothing else. */
  function maker(): Maker {
    const files = new Map<string, string>([
      [path.join(ROOT, 'map/definition.csv'), DEFINITION],
      [path.join(ROOT, 'map/default.map'), DEFAULT_MAP],
    ]);
    const written = new Map<string, string>();
    const host: MapEditorHost = {
      targets: (): readonly FileLocation[] => [TARGET],
      modNameOf: (root: string): string => root,
      ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> => Promise.resolve(buildTestIndex()),
      fileSystem: {
        fileExists: (absolutePath: string): boolean => files.has(absolutePath),
        listFiles: (): string[] => [],
        listFilesRecursive: (): string[] => [],
      },
      readText: (absolutePath: string): Promise<string | undefined> => Promise.resolve(written.get(absolutePath) ?? files.get(absolutePath)),
      readBytes: (): Promise<Uint8Array | undefined> => Promise.resolve(undefined),
      assetsFolder: '/extension/assets',
      writeText: (absolutePath: string, text: string): Promise<boolean> => {
        written.set(absolutePath, text);
        return Promise.resolve(true);
      },
      writeBytes: (): Promise<boolean> => Promise.resolve(true),
      rename: (): Promise<boolean> => Promise.resolve(true),
      codepage: (): Codepage => DEFAULT_CODEPAGE,
      historyFolderPattern: (): RegExp | undefined => undefined,
    };
    return { host, written };
  }

  function createParams(isSea: boolean): SaveParams {
    return {
      ...targetParams,
      provinceId: 3,
      popDate: '1836.1.1',
      section: 'history',
      data: EMPTY_HISTORY,
      climate: '',
      createInFolder: '',
      create: { color: COLOR, isSea, name: 'Nova', climate: '', states: [] },
    };
  }

  test('a colour no row names answers with the next free id, marked as new', async () => {
    const result = await new MapEditorHandlers(maker().host).newProvince({ ...targetParams, color: COLOR, popDate: '1836.1.1' });
    assert.ok(result.kind === 'details', result.kind === 'unavailable' ? result.reason : '');
    assert.strictEqual(result.details.id, 3);
    assert.strictEqual(result.details.isNew, true);
  });

  test('a colour already in the table is refused, and says whose it is', async () => {
    const result = await new MapEditorHandlers(maker().host).newProvince({ ...targetParams, color: (2 << 16) | (2 << 8) | 2, popDate: '1836.1.1' });
    assert.ok(result.kind === 'unavailable');
    assert.ok(result.reason.includes('province 2'), result.reason);
  });

  test('a save with create writes the row, the room for the id, and the section file', async () => {
    const { host, written } = maker();
    const result = await new MapEditorHandlers(host).save(createParams(false));
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.strictEqual(written.get(path.join(ROOT, 'map/definition.csv')), DEFINITION + '3;10;20;30;Nova;x\n');
    assert.ok(written.get(path.join(ROOT, 'map/default.map'))?.startsWith('max_provinces = 4'));
    assert.strictEqual(result.written.length, 3, result.written.join(', '));
  });

  test('a sea province joins sea_starts as well', async () => {
    const { host, written } = maker();
    assert.strictEqual((await new MapEditorHandlers(host).save(createParams(true))).ok, true);
    assert.ok(written.get(path.join(ROOT, 'map/default.map'))?.includes('2 3'), written.get(path.join(ROOT, 'map/default.map')));
  });

  test('a dry run lists the same files and writes none of them', async () => {
    const { host, written } = maker();
    const plan = await new MapEditorHandlers(host).save({ ...createParams(false), dryRun: true });
    assert.ok(plan.ok, plan.ok ? '' : plan.reason);
    assert.strictEqual(written.size, 0, 'a dry run must not touch a file');
    const { host: other } = maker();
    const real = await new MapEditorHandlers(other).save(createParams(false));
    assert.ok(real.ok);
    assert.deepStrictEqual(plan.written, real.written);
  });

  test('a name with no ASCII shape is refused, and not one file is written', async () => {
    const { host, written } = maker();
    const result = await new MapEditorHandlers(host).save({ ...createParams(false), create: { color: COLOR, isSea: false, name: 'Москва', climate: '', states: [] } });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('plain ASCII'), result.reason);
    assert.strictEqual(written.size, 0, 'the definition.csv row must not be written either');
  });

  test('an accented name is kept, folded, in the file it creates', async () => {
    const { host, written } = maker();
    const result = await new MapEditorHandlers(host).save({ ...createParams(false), create: { color: COLOR, isSea: false, name: 'São José do Norte', climate: '', states: [] } });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.ok(
      [...written.keys()].some((file) => file.endsWith('3 - Sao Jose do Norte.txt')),
      [...written.keys()].join(', '),
    );
  });

  test('a second save of a province already created adds no second row', async () => {
    const { host, written } = maker();
    const handlers = new MapEditorHandlers(host);
    assert.strictEqual((await handlers.save(createParams(false))).ok, true);
    const table = written.get(path.join(ROOT, 'map/definition.csv'));
    assert.strictEqual((await handlers.save(createParams(false))).ok, true);
    assert.strictEqual(written.get(path.join(ROOT, 'map/definition.csv')), table);
  });
});

suite('MapEditorHandlers — the folder a history file sits in', () => {
  const GAME = '/game';
  const CLIMATE = 'harsh_climate = {\n\tmax_attrition = 5\n}\n\nharsh_climate = {\n\t1\n}\n';
  const REGION = 'ENG_1 = { 1 }\n';
  const HISTORY = 'owner = ENG\ncontroller = ENG\n';
  const FROM = 'history/provinces/Europe/1 - One.txt';

  interface Moved {
    readonly host: MapEditorHost;
    readonly written: Map<string, string>;
    /** One `from -> to` per rename the save asked for. */
    readonly renamed: string[];
  }

  /**
   * A mod holding one history file, in `history/provinces/Europe`. `owner`
   * says which root the file comes from: the target itself, or a layer below it.
   */
  function moved(owner: string, layers: ModLayers = LAYERS, renames = true): Moved {
    const all = new Map<string, string>([
      [path.join(ROOT, 'map/climate.txt'), CLIMATE],
      [path.join(ROOT, 'map/region.txt'), REGION],
      [path.join(owner, FROM), HISTORY],
    ]);
    const written = new Map<string, string>();
    const renamed: string[] = [];
    const host: MapEditorHost = {
      targets: (): readonly FileLocation[] => [{ root: ROOT, layers }],
      modNameOf: (root: string): string => root,
      ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> => Promise.resolve(buildTestIndex()),
      fileSystem: {
        fileExists: (absolutePath: string): boolean => all.has(absolutePath) || written.has(absolutePath),
        listFiles: (): string[] => [],
        listFilesRecursive: (root: string, relativeFolder: string): string[] =>
          root === owner && relativeFolder === 'history/provinces' ? [FROM] : [],
      },
      readText: (absolutePath: string): Promise<string | undefined> =>
        Promise.resolve(written.get(absolutePath) ?? all.get(absolutePath)),
      readBytes: (): Promise<Uint8Array | undefined> => Promise.resolve(undefined),
      assetsFolder: '/extension/assets',
      writeText: (absolutePath: string, text: string): Promise<boolean> => {
        written.set(absolutePath, text);
        return Promise.resolve(true);
      },
      writeBytes: (): Promise<boolean> => Promise.resolve(true),
      rename: (fromPath: string, toPath: string): Promise<boolean> => {
        renamed.push(`${fromPath} -> ${toPath}`);
        return Promise.resolve(renames);
      },
      codepage: (): Codepage => DEFAULT_CODEPAGE,
      historyFolderPattern: (): RegExp | undefined => undefined,
    };
    return { host, written, renamed };
  }

  const save = { ...targetParams, provinceId: 1, popDate: '1836.1.1', section: 'history' as const, data: EMPTY_HISTORY, climate: 'harsh_climate' };
  const source = path.join(ROOT, FROM);
  const target = path.join(ROOT, 'history/provinces/Asia/1 - One.txt');

  test('the province says which folder its history file sits in', async () => {
    const result = await new MapEditorHandlers(moved(ROOT).host).province({ ...targetParams, provinceId: 1, popDate: '1836.1.1' });
    assert.ok(result.kind === 'details', result.kind === 'unavailable' ? result.reason : '');
    assert.strictEqual(result.details.history.folder, 'Europe');
  });

  test('another folder moves the file there, even with nothing else to write', async () => {
    const { host, written, renamed } = moved(ROOT);
    const result = await new MapEditorHandlers(host).save({ ...save, data: { ...EMPTY_HISTORY, owner: 'ENG', controller: 'ENG' }, createInFolder: 'Asia' });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.deepStrictEqual(renamed, [`${source} -> ${target}`]);
    assert.strictEqual(written.get(target), HISTORY);
    assert.deepStrictEqual(result.written, [target]);
  });

  test('the folder it already sits in leaves the file where it is', async () => {
    const { host, written, renamed } = moved(ROOT);
    const result = await new MapEditorHandlers(host).save({ ...save, createInFolder: 'Europe' });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.deepStrictEqual(renamed, []);
    assert.strictEqual(written.get(target), undefined);
    assert.ok(written.get(source)?.includes('owner') === false, written.get(source));
  });

  test('a file a layer below owns is copied into the folder the form picked', async () => {
    const layers: ModLayers = { key: 'game+mod', gameRoot: GAME, roots: [GAME, ROOT], hiddenFolders: [], caseInsensitivePaths: false };
    const { host, written, renamed } = moved(GAME, layers);
    const result = await new MapEditorHandlers(host).save({ ...save, data: { ...EMPTY_HISTORY, owner: 'ENG', controller: 'ENG' }, createInFolder: 'Asia' });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.deepStrictEqual(renamed, [], 'a file this mod does not own is never moved');
    assert.strictEqual(written.get(target), HISTORY);
    assert.strictEqual(written.get(path.join(GAME, FROM)), undefined);
  });

  test('renaming the file to a name with no ASCII shape is refused, and nothing is written', async () => {
    const { host, written, renamed } = moved(ROOT);
    const result = await new MapEditorHandlers(host).save({
      ...save, createInFolder: 'Europe', localisation: { text: 'Москва', renameHistoryFile: true },
    });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('plain ASCII'), result.reason);
    assert.deepStrictEqual(renamed, []);
    assert.strictEqual(written.size, 0);
  });

  test('a move the file system refuses is a reason, and the file is not written elsewhere', async () => {
    const { host, written } = moved(ROOT, LAYERS, false);
    const result = await new MapEditorHandlers(host).save({ ...save, createInFolder: 'Asia' });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes("into 'Asia'"), result.reason);
    assert.strictEqual(written.get(target), undefined);
  });
});

suite('MapEditorHandlers — climate and state', () => {
  const CLIMATE = 'harsh_climate = {\n\tmax_attrition = 5\n}\n\nharsh_climate = {\n\t1 2\n}\n\nmild_climate = {\n\t7\n}\n';
  const REGION = 'ENG_1 = { 1 2 }\nUSA_3 = { 7 }\n';

  interface Placed {
    readonly host: MapEditorHost;
    readonly written: Map<string, string>;
  }

  /** A mod whose map folder holds climate.txt and region.txt, both naming province 1. */
  function placed(files: ReadonlyMap<string, string> = new Map()): Placed {
    const all = new Map<string, string>([
      [path.join(ROOT, 'map/climate.txt'), CLIMATE],
      [path.join(ROOT, 'map/region.txt'), REGION],
      ...files,
    ]);
    const written = new Map<string, string>();
    const host: MapEditorHost = {
      targets: (): readonly FileLocation[] => [TARGET],
      modNameOf: (root: string): string => root,
      ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> => Promise.resolve(buildTestIndex()),
      fileSystem: {
        fileExists: (absolutePath: string): boolean => all.has(absolutePath) || written.has(absolutePath),
        listFiles: (): string[] => [],
        listFilesRecursive: (): string[] => [],
      },
      readText: (absolutePath: string): Promise<string | undefined> =>
        Promise.resolve(written.get(absolutePath) ?? all.get(absolutePath)),
      readBytes: (): Promise<Uint8Array | undefined> => Promise.resolve(undefined),
      assetsFolder: '/extension/assets',
      writeText: (absolutePath: string, text: string): Promise<boolean> => {
        written.set(absolutePath, text);
        return Promise.resolve(true);
      },
      writeBytes: (): Promise<boolean> => Promise.resolve(true),
      rename: (): Promise<boolean> => Promise.resolve(true),
      codepage: (): Codepage => DEFAULT_CODEPAGE,
      historyFolderPattern: (): RegExp | undefined => undefined,
    };
    return { host, written };
  }

  const base = { ...targetParams, provinceId: 1, popDate: '1836.1.1' };
  const climateFile = path.join(ROOT, 'map/climate.txt');
  const regionFile = path.join(ROOT, 'map/region.txt');

  test('the province reads back the climate and the states it is listed in', async () => {
    const result = await new MapEditorHandlers(placed().host).province(base);
    assert.ok(result.kind === 'details', result.kind === 'unavailable' ? result.reason : '');
    assert.strictEqual(result.details.climate.name, 'harsh_climate');
    assert.deepStrictEqual(result.details.climate.options, [
      { id: 'harsh_climate', label: 'harsh_climate' },
      { id: 'mild_climate', label: 'mild_climate' },
    ]);
    assert.deepStrictEqual(result.details.state.names, ['ENG_1']);
    assert.deepStrictEqual(result.details.state.options.map((item) => item.id), ['ENG_1', 'USA_3']);
  });

  test('a history save moves the province to the climate it carries', async () => {
    const { host, written } = placed();
    const result = await new MapEditorHandlers(host).save({
      ...base, section: 'history', data: EMPTY_HISTORY, climate: 'mild_climate', createInFolder: '',
    });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.ok(written.get(climateFile)?.includes('\t2\n'), written.get(climateFile));
    assert.ok(written.get(climateFile)?.includes('\t7 1\n'), written.get(climateFile));
    assert.ok(result.written.includes(climateFile), result.written.join(', '));
  });

  test('the Definition tab writes the states its one Save carries', async () => {
    const { host, written } = placed();
    const result = await new MapEditorHandlers(host).save({
      ...base, section: 'history', data: EMPTY_HISTORY, climate: 'harsh_climate', createInFolder: '',
      states: ['ENG_1', 'USA_3'],
    });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.ok(result.written.includes(regionFile), result.written.join(', '));
    assert.strictEqual(written.get(regionFile), 'ENG_1 = { 1 2 }\nUSA_3 = { 7 1 }\n');
  });

  test('a Save that shows neither leaves both files alone', async () => {
    const { host, written } = placed();
    const result = await new MapEditorHandlers(host).save({
      ...base, section: 'history', data: EMPTY_HISTORY, climate: 'harsh_climate', createInFolder: '',
    });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.strictEqual(written.get(regionFile), undefined);
    assert.strictEqual(written.get(climateFile), undefined);
  });

  test('the localisation the Definition Save carries is written with the history', async () => {
    const { host, written } = placed();
    const result = await new MapEditorHandlers(host).save({
      ...base, section: 'history', data: EMPTY_HISTORY, climate: 'harsh_climate', createInFolder: '',
      states: ['ENG_1'], localisation: { text: 'Nova', renameHistoryFile: false },
    });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.ok([...written.keys()].some((file) => file.includes('localisation')), [...written.keys()].join(', '));
  });

  test('a save that would leave the province with no climate is refused, and writes nothing', async () => {
    const { host, written } = placed();
    const result = await new MapEditorHandlers(host).save({
      ...base, section: 'history', data: EMPTY_HISTORY, climate: '', createInFolder: '',
    });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('no climate'), result.reason);
    assert.strictEqual(written.size, 0);
  });

  test('a save that would leave the province in no state is refused', async () => {
    const result = await new MapEditorHandlers(placed().host).save({
      ...base, section: 'history', data: EMPTY_HISTORY, climate: 'harsh_climate', createInFolder: '', states: ['  '],
    });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('no state'), result.reason);
  });

  test('a new province is told the Sea province box is the other way out', async () => {
    const result = await new MapEditorHandlers(placed(NEW).host).save(createParams('', ['USA_3']));
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('tick Sea province'), result.reason);
  });

  test('a sea province being created needs neither, and gets no history file', async () => {
    const { host, written } = placed(NEW);
    const params = createParams('', []);
    const create = params.create;
    assert.ok(create);
    const result = await new MapEditorHandlers(host).save({ ...params, create: { ...create, isSea: true } });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.ok(![...written.keys()].some((file) => file.includes('history')), [...written.keys()].join(', '));
  });

  test('a province already placed is saved by every other section without carrying either', async () => {
    const result = await new MapEditorHandlers(placed().host).save({
      ...base, section: 'positions', data: EMPTY_POSITIONS,
    });
    assert.ok(result.ok, result.ok ? '' : result.reason);
  });

  test('a province in neither file cannot be saved at all', async () => {
    const result = await new MapEditorHandlers(placed().host).save({
      ...base, provinceId: 9, section: 'positions', data: EMPTY_POSITIONS,
    });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('no climate'), result.reason);
  });

  test('a sea province is in neither file and is saved all the same', async () => {
    const result = await new MapEditorHandlers(placed().host).save({
      ...base, provinceId: 900, section: 'positions', data: EMPTY_POSITIONS,
    });
    assert.ok(result.ok, result.ok ? '' : result.reason);
  });

  const NEW = new Map<string, string>([
    [path.join(ROOT, 'map/definition.csv'), ';red;green;blue;x;x\n1;1;1;1;One;x\n'],
    [path.join(ROOT, 'map/default.map'), 'max_provinces = 3\nsea_starts = {\n\t900\n}\n'],
  ]);

  function createParams(climate: string, states: readonly string[]): SaveParams {
    return {
      ...targetParams, provinceId: 3, popDate: '1836.1.1',
      section: 'history', data: EMPTY_HISTORY, climate, createInFolder: '',
      create: { color: 7, isSea: false, name: 'Nova', climate, states },
    };
  }

  test('creating a province writes its climate and its state with the row', async () => {
    const { host, written } = placed(NEW);
    const result = await new MapEditorHandlers(host).save(createParams('mild_climate', ['USA_3']));
    assert.ok(result.ok, result.ok ? '' : result.reason);
    assert.ok(written.get(climateFile)?.includes('7 3'), written.get(climateFile));
    assert.strictEqual(written.get(regionFile), 'ENG_1 = { 1 2 }\nUSA_3 = { 7 3 }\n');
    assert.ok(result.written.includes(climateFile) && result.written.includes(regionFile), result.written.join(', '));
  });

  test('the confirmation lists exactly what the creation writes, and the dry run writes none of it', async () => {
    const { host, written } = placed(NEW);
    const plan = await new MapEditorHandlers(host).save({ ...createParams('mild_climate', ['USA_3']), dryRun: true });
    assert.ok(plan.ok, plan.ok ? '' : plan.reason);
    assert.strictEqual(written.size, 0, 'a dry run must not touch a file');
    const { host: other } = placed(NEW);
    const real = await new MapEditorHandlers(other).save(createParams('mild_climate', ['USA_3']));
    assert.ok(real.ok, real.ok ? '' : real.reason);
    assert.deepStrictEqual(plan.written, real.written);
  });

  test('a province cannot be created without a climate, and nothing is written trying', async () => {
    const { host, written } = placed(NEW);
    const result = await new MapEditorHandlers(host).save(createParams('', ['USA_3']));
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('no climate'), result.reason);
    assert.strictEqual(written.size, 0);
  });

  test('a province cannot be created without a state either', async () => {
    const result = await new MapEditorHandlers(placed(NEW).host).save(createParams('mild_climate', []));
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('no state'), result.reason);
  });
});

suite('MapEditorHandlers — the Layers box thumbnails', () => {
  const RED = (255 << 16);
  const BLUE = 255;

  interface Bitmaps {
    readonly host: MapEditorHost;
    readonly reads: string[];
  }

  /** A mod whose map folder holds the bitmaps given, and nothing else. */
  function bitmaps(files: ReadonlyMap<string, Uint8Array>): Bitmaps {
    const reads: string[] = [];
    const host: MapEditorHost = {
      targets: (): readonly FileLocation[] => [TARGET],
      modNameOf: (root: string): string => root,
      ensureIndex: (): Promise<ReturnType<typeof buildTestIndex> | undefined> => Promise.resolve(buildTestIndex()),
      fileSystem: {
        fileExists: (absolutePath: string): boolean => files.has(absolutePath),
        listFiles: (): string[] => [],
        listFilesRecursive: (): string[] => [],
      },
      readText: (): Promise<string | undefined> => Promise.resolve(undefined),
      readBytes: (absolutePath: string): Promise<Uint8Array | undefined> => {
        reads.push(absolutePath);
        return Promise.resolve(files.get(absolutePath));
      },
      assetsFolder: '/extension/assets',
      writeText: (): Promise<boolean> => Promise.resolve(true),
      writeBytes: (): Promise<boolean> => Promise.resolve(true),
      rename: (): Promise<boolean> => Promise.resolve(true),
      codepage: (): Codepage => DEFAULT_CODEPAGE,
      historyFolderPattern: (): RegExp | undefined => undefined,
    };
    return { host, reads };
  }

  const provincesFile = path.join(ROOT, 'map/provinces.bmp');
  const riversFile = path.join(ROOT, 'map/rivers.bmp');
  const terrainFile = path.join(ROOT, 'map/terrain.bmp');
  const ALL = new Map<string, Uint8Array>([
    [provincesFile, encodeBmp24(4, 2, [RED, RED, BLUE, BLUE, RED, RED, BLUE, BLUE])],
    [riversFile, encodeBmp8(4, 2, [255, 2, 255, 254, 255, 255, 255, 254], grayPalette())],
    [terrainFile, encodeBmp8(4, 2, [0, 0, 5, 5, 0, 0, 5, 5], grayPalette())],
  ]);

  test('the map says where terrain.bmp is, next to rivers.bmp', async () => {
    const files = new Map(ALL);
    files.set(path.join(ROOT, 'map/definition.csv'), new Uint8Array());
    const { host } = bitmaps(files);
    const result = await new MapEditorHandlers({
      ...host,
      readText: (absolutePath: string): Promise<string | undefined> =>
        Promise.resolve(absolutePath.endsWith('definition.csv') ? ';r;g;b;x;x\n' : undefined),
    }).map(targetParams);
    assert.ok(result.kind === 'ready', result.kind === 'unavailable' ? result.reason : '');
    assert.strictEqual(result.terrainBmpPath, terrainFile);
    assert.strictEqual(result.riversBmpPath, riversFile);
  });

  test('all three bitmaps become PNG data URIs', async () => {
    const result = await new MapEditorHandlers(bitmaps(ALL).host).thumbnails(targetParams);
    for (const uri of [result.provinces, result.rivers, result.terrain]) {
      assert.ok(uri?.startsWith('data:image/png;base64,'), uri);
    }
  });

  test('a bitmap the stack lacks is left out, and one that is not 8-bit rivers is too', async () => {
    const files = new Map(ALL);
    files.delete(terrainFile);
    files.set(riversFile, encodeBmp24(4, 2, [RED, RED, BLUE, BLUE, RED, RED, BLUE, BLUE]));
    const result = await new MapEditorHandlers(bitmaps(files).host).thumbnails(targetParams);
    assert.ok(result.provinces);
    assert.strictEqual(result.terrain, undefined);
    assert.strictEqual(result.rivers, undefined);
  });

  test('the thumbnails are built once per stack, and again after a paint changes the province map', async () => {
    const { host, reads } = bitmaps(ALL);
    const handlers = new MapEditorHandlers(host);
    await handlers.thumbnails(targetParams);
    await handlers.thumbnails(targetParams);
    const before = reads.length;
    assert.strictEqual(before, 3);
    assert.strictEqual((await handlers.paint({ ...targetParams, runs: [0, 1, BLUE] })).ok, true);
    await handlers.thumbnails(targetParams);
    assert.ok(reads.length > before + 1, String(reads.length));
  });

  test('no mod to edit is no thumbnails, not an error', async () => {
    const result = await new MapEditorHandlers(recordingHost([]).host).thumbnails(targetParams);
    assert.deepStrictEqual(result, {});
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
