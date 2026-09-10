import * as assert from 'node:assert';
import * as path from 'node:path';
import type { ModDescriptor } from '../../model/modDescriptor.js';
import { findGameExecutable, gameLaunchArguments } from '../../services/gameLaunch.js';

const GAME = path.resolve('/game');

function mod(name: string, file: string, dependencies: readonly string[] = []): ModDescriptor {
  return {
    name,
    path: `mod/${file}`,
    folder: path.join(GAME, 'mod', file),
    replacePaths: [],
    dependencies,
    descriptorPath: path.join(GAME, 'mod', `${file}.mod`),
  };
}

suite('gameLaunch', () => {
  test('one -mod= per mod, descriptor path relative to the game root with forward slashes, in the given order', () => {
    const stack = [mod('TGC', 'TGC'), mod('Sub', 'TGC Sub', ['TGC'])];
    assert.deepStrictEqual(gameLaunchArguments(GAME, stack), ['-mod=mod/TGC.mod', '-mod=mod/TGC Sub.mod']);
    assert.deepStrictEqual(gameLaunchArguments(GAME, []), []);
  });

  test('prefers v2game.exe, falls back to victoria2.exe, else nothing', () => {
    const both = new Set([path.join(GAME, 'v2game.exe'), path.join(GAME, 'victoria2.exe')]);
    assert.strictEqual(findGameExecutable(GAME, (file) => both.has(file)), path.join(GAME, 'v2game.exe'));
    assert.strictEqual(
      findGameExecutable(GAME, (file) => file.endsWith('victoria2.exe')),
      path.join(GAME, 'victoria2.exe'),
    );
    assert.strictEqual(findGameExecutable(GAME, () => false), undefined);
  });
});
