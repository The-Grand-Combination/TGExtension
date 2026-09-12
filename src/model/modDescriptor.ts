import { requestDescriptor } from './request.js';
/**
 * One `*.mod` descriptor, as the launcher reads it. Paths inside are
 * relative to the game root and use forward slashes.
 */
export interface ModDescriptor {
  /** `name = "..."`; what `dependencies` of other mods refer to. */
  readonly name: string;
  /** `path = "mod/TGC"`: the mod folder, relative to the game root. */
  readonly path: string;
  /** The mod folder on disk: `path` resolved next to the descriptor, so a checkout outside the install works too. */
  readonly folder: string;
  readonly userDir?: string;
  /** `replace_path = "events"`: game-root-relative folders this mod hides. */
  readonly replacePaths: readonly string[];
  /** `dependencies = { "Other Mod" }`: mods that must load before this one. */
  readonly dependencies: readonly string[];
  /** Absolute path of the `.mod` file. */
  readonly descriptorPath: string;
}

/** Custom LSP request: the mods the server knows (installed and checked out around the workspace). */
export const MODS_REQUEST = requestDescriptor<undefined, ModsResult>('victorianTools/mods');
/** Server → client: the install or the selection was re-read; ask `MODS_REQUEST` again. */
export const LAYOUT_CHANGED_NOTIFICATION = 'victorianTools/layoutChanged';

export interface ModsResult {
  /** Undefined when no Victoria 2 install was found around the workspace. */
  readonly gameRoot: string | undefined;
  readonly mods: readonly ModDescriptor[];
}
