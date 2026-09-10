import * as assert from 'node:assert';
import * as path from 'node:path';
import { parseModDescriptor } from '../../parser/modDescriptor.js';

suite('parseModDescriptor', () => {
  test('reads name, path, user_dir, every replace_path and the dependencies list', () => {
    const descriptor = parseModDescriptor(
      'name = "TGC - The Grand Combination"\n' +
        'path = "mod/TGC"\n' +
        'user_dir = "TGC"\n' +
        'replace_path = "common"\n' +
        'replace_path = "gfx/pictures/events"\n' +
        'dependencies = { "Base Mod" "Other Mod" }\n' +
        'github = "https://example.invalid"\n',
      'F:/Victoria 2/mod/TGC.mod',
    );
    assert.deepStrictEqual(descriptor, {
      name: 'TGC - The Grand Combination',
      path: 'mod/TGC',
      folder: path.join('F:/Victoria 2/mod', 'TGC'),
      userDir: 'TGC',
      replacePaths: ['common', 'gfx/pictures/events'],
      dependencies: ['Base Mod', 'Other Mod'],
      descriptorPath: 'F:/Victoria 2/mod/TGC.mod',
    });
  });

  test('tolerates trailing comments, a trailing slash and missing optional keys', () => {
    const descriptor = parseModDescriptor(
      'name = "Shattered World" # 2022\npath = "./mod/SWD/" # location\nreplace_path = "events"\n',
      'C:\\game\\mod\\SWD.mod',
    );
    assert.strictEqual(descriptor?.name, 'Shattered World');
    assert.strictEqual(descriptor.path, 'mod/SWD');
    assert.strictEqual(descriptor.folder, path.join('C:\\game\\mod', 'SWD'), 'the folder sits next to the descriptor');
    assert.strictEqual(descriptor.userDir, undefined);
    assert.deepStrictEqual(descriptor.replacePaths, ['events']);
    assert.deepStrictEqual(descriptor.dependencies, []);
  });

  test('falls back to the file name when there is no name, and needs a path', () => {
    assert.strictEqual(parseModDescriptor('path = "mod/X"\n', 'C:\\game\\mod\\Nameless.mod')?.name, 'Nameless');
    assert.strictEqual(parseModDescriptor('name = "No Path"\n', 'x.mod'), undefined);
    assert.strictEqual(parseModDescriptor('', 'x.mod'), undefined);
  });
});
