import * as path from 'node:path';
import type { ModDescriptor } from '../model/modDescriptor.js';

/** The game binaries, in the order they are looked for in the game root. */
export const GAME_EXECUTABLES: readonly string[] = ['v2game.exe', 'victoria2.exe'];

/**
 * The command line the launcher passes: one `-mod=mod/X.mod` per mod, the
 * descriptor path relative to the game root with forward slashes, in load order.
 */
export function gameLaunchArguments(gameRoot: string, stack: readonly ModDescriptor[]): string[] {
  return stack.map((mod) => `-mod=${path.relative(gameRoot, mod.descriptorPath).replace(/\\/g, '/')}`);
}

/** The first game binary present in the game root, if any. */
export function findGameExecutable(gameRoot: string, fileExists: (absolutePath: string) => boolean): string | undefined {
  return GAME_EXECUTABLES.map((name) => path.join(gameRoot, name)).find(fileExists);
}
