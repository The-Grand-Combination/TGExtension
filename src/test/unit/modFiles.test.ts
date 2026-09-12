import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readModFile, readModFileAsync, writeModFileText } from '../../io/modFiles.js';

/** `Москва` as the Russian game stores it. */
const MOSCOW_BYTES = Buffer.of(0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0);
const MOSCOW = 'Москва';

function scratchFile(name: string): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-codec-'));
  return path.join(folder, name);
}

suite('modFiles — text I/O in the mod code page', () => {
  test('a windows-1251 file reads as Cyrillic, and as mojibake under the wrong page', () => {
    const filePath = scratchFile('PROV.csv');
    fs.writeFileSync(filePath, Buffer.concat([Buffer.from('PROV1;'), MOSCOW_BYTES, Buffer.from(';x\r\n')]));

    assert.ok(readModFile(filePath, 'windows-1251')?.includes(MOSCOW));
    assert.ok(readModFile(filePath, 'windows-1252')?.includes('Ìîñêâà'));
  });

  test('writing then reading in the same page round-trips the bytes', async () => {
    const filePath = scratchFile('new/PROV.csv');
    const line = `PROV1;${MOSCOW};x\r\n`;

    assert.strictEqual(await writeModFileText(filePath, line, 'windows-1251'), true, 'folders are created');
    assert.deepStrictEqual(
      fs.readFileSync(filePath),
      Buffer.concat([Buffer.from('PROV1;'), MOSCOW_BYTES, Buffer.from(';x\r\n')]),
    );
    assert.strictEqual(await readModFileAsync(filePath, 'windows-1251'), line);
  });

  test('a character outside the code page writes nothing at all', async () => {
    const filePath = scratchFile('PROV.csv');
    assert.strictEqual(await writeModFileText(filePath, `PROV1;${MOSCOW};x`, 'windows-1252'), false);
    assert.strictEqual(fs.existsSync(filePath), false, 'a refused write must not leave a truncated file');
  });

  test('an existing file is left untouched when the write is refused', async () => {
    const filePath = scratchFile('PROV.csv');
    const original = Buffer.from('PROV1;Paris;x\r\n');
    fs.writeFileSync(filePath, original);

    assert.strictEqual(await writeModFileText(filePath, MOSCOW, 'windows-1252'), false);
    assert.deepStrictEqual(fs.readFileSync(filePath), original);
  });

  test('a missing file reads as undefined rather than throwing', () => {
    assert.strictEqual(readModFile(scratchFile('absent.txt'), 'windows-1252'), undefined);
  });
});
