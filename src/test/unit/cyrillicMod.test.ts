import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileExists, listFiles, listFilesRecursive, readModFile } from '../../io/modFiles.js';
import type { Codepage } from '../../io/textCodec.js';
import { buildModIndexAsync } from '../../services/modIndex.js';
import { layeredIndexProvider, singleRootLayers, type LayerFileSystem } from '../../services/modLayers.js';
import { readProvinceLoc } from '../../services/provinceLocEdit.js';
import { loadModDescriptors } from '../../services/modLayout.js';

const MOSCOW = 'Москва';
/** `PROV1;Москва;x` as the Russian game stores it. */
const PROV_LINE = Buffer.concat([
  Buffer.from('CODE;ENGLISH;x\r\nPROV1;'),
  Buffer.of(0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0),
  Buffer.from(';x\r\n'),
]);

const fileSystem: LayerFileSystem = { fileExists, listFiles, listFilesRecursive };

/** A one-file mod on disk, written as bytes so the test does not depend on Node's own encoder. */
function cyrillicMod(): string {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cyr-')), 'RussianMod');
  fs.mkdirSync(path.join(root, 'localisation'), { recursive: true });
  fs.mkdirSync(path.join(root, 'common'), { recursive: true });
  fs.writeFileSync(path.join(root, 'localisation', '00_map-provinces.csv'), PROV_LINE);
  return root;
}

function indexOf(root: string, codepage: Codepage): ReturnType<typeof buildModIndexAsync> {
  const provider = layeredIndexProvider(singleRootLayers(root), fileSystem, (filePath: string): string | undefined =>
    readModFile(filePath, codepage),
  );
  return buildModIndexAsync(provider);
}

suite('a Cyrillic mod, read off the real filesystem', () => {
  test('the province name survives indexing under windows-1251', async () => {
    const root = cyrillicMod();
    assert.strictEqual((await indexOf(root, 'windows-1251')).locKeyDefinitions.get('prov1')?.text, MOSCOW);
    // The bug as reported: the same file under the Western page.
    assert.strictEqual((await indexOf(root, 'windows-1252')).locKeyDefinitions.get('prov1')?.text, 'Ìîñêâà');
  });

  test('the Map Editor reads it back through readProvinceLoc', async () => {
    const index = await indexOf(cyrillicMod(), 'windows-1251');
    const definition = readProvinceLoc(index, 1);
    assert.strictEqual(definition.key, 'PROV1');
    assert.strictEqual(definition.text, MOSCOW);
  });

  test('a mod whose .mod name is Cyrillic can be matched against the selection', () => {
    // The name is compared for equality with `victorianTools.activeMods`, which
    // arrives from VS Code already decoded; under the wrong page it never matched.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cyr-mods-'));
    fs.mkdirSync(path.join(folder, 'RussianMod'));
    fs.writeFileSync(
      path.join(folder, 'RussianMod.mod'),
      Buffer.concat([Buffer.from('name = "'), Buffer.of(0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0), Buffer.from('"\r\npath = "mod/RussianMod"\r\n')]),
    );
    const descriptors = loadModDescriptors(folder, {
      listFiles,
      readFile: (filePath: string): string | undefined => readModFile(filePath, 'windows-1251'),
    });
    assert.deepStrictEqual(
      descriptors.map((descriptor) => descriptor.name),
      [MOSCOW],
    );
  });
});
