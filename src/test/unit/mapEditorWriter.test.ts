import * as assert from 'node:assert';
import * as path from 'node:path';
import { DEFAULT_CODEPAGE, type Codepage } from '../../io/textCodec.js';
import { MapEditorWriter, type WriterHost } from '../../services/mapEditorWriter.js';

function host(written = new Map<string, string>(), codepage: Codepage = DEFAULT_CODEPAGE): WriterHost {
  return {
    writeText: (absolutePath, text): Promise<boolean> => {
      written.set(absolutePath, text);
      return Promise.resolve(true);
    },
    writeBytes: (): Promise<boolean> => Promise.resolve(true),
    rename: (): Promise<boolean> => Promise.resolve(true),
    codepage: (): Codepage => codepage,
  };
}

function later(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

suite('MapEditorWriter — one writer per mod', () => {
  const root = path.join('/', 'mods', 'Test');

  test('the destination is the file itself inside the target, else the same path under the target', () => {
    const writer = new MapEditorWriter(host());
    const own = path.join(root, 'map', 'positions.txt');
    assert.strictEqual(writer.destinationFor(root, own, 'map/positions.txt'), own);
    assert.strictEqual(
      writer.destinationFor(root, path.join('/', 'game', 'map', 'positions.txt'), 'map/positions.txt'),
      path.join(root, 'map/positions.txt'),
    );
    assert.strictEqual(writer.destinationFor(root, undefined, 'map/positions.txt'), path.join(root, 'map/positions.txt'));
  });

  test('saves into one root run one after another, each seeing what the last one wrote', async () => {
    const file = new Map<string, string>([['f', '']]);
    const writer = new MapEditorWriter(host());
    const order: string[] = [];
    const save = (mark: string): Promise<void> =>
      writer.serialized(root, async () => {
        const read = file.get('f') ?? '';
        order.push(`start ${mark}`);
        await later();
        file.set('f', read + mark);
        order.push(`end ${mark}`);
      });
    await Promise.all([save('A'), save('B')]);
    assert.strictEqual(file.get('f'), 'AB', 'the second save planned against the first one\'s result');
    assert.deepStrictEqual(order, ['start A', 'end A', 'start B', 'end B']);
  });

  test('roots do not wait on each other', async () => {
    const writer = new MapEditorWriter(host());
    const order: string[] = [];
    const slow = writer.serialized(root, async () => {
      await later();
      await later();
      order.push('slow');
    });
    const quick = writer.serialized(path.join('/', 'mods', 'Other'), () => {
      order.push('quick');
      return Promise.resolve();
    });
    await Promise.all([slow, quick]);
    assert.deepStrictEqual(order, ['quick', 'slow']);
  });

  test('a save that throws does not block the next one for the root', async () => {
    const writer = new MapEditorWriter(host());
    await assert.rejects(writer.serialized(root, () => Promise.reject(new Error('disk'))));
    assert.strictEqual(await writer.serialized(root, () => Promise.resolve('ran')), 'ran');
  });

  test('a character the code page cannot hold is refused before anything is written', async () => {
    const written = new Map<string, string>();
    const writer = new MapEditorWriter(host(written, 'windows-1252'));
    const reason = await writer.writeText('x', 'Москва', 'The file');
    assert.ok(reason?.includes('windows-1252'), reason);
    assert.strictEqual(written.size, 0);
    assert.strictEqual(await writer.writeText('x', 'Sao', 'The file', true), undefined, 'a dry run stops after the check');
    assert.strictEqual(written.size, 0);
    assert.strictEqual(await writer.writeText('x', 'Sao', 'The file'), undefined);
    assert.strictEqual(written.get('x'), 'Sao');
  });
});
