import * as path from 'node:path';
import type { ModDescriptor } from '../model/modDescriptor.js';
import type { ModFileProvider } from './modIndex.js';

/**
 * The folders the game reads a file set from, the way its launcher stacks
 * them: the game root first, then each mod in load order. A relative path
 * resolves to the highest layer that has it, and a `replace_path` hides one
 * game-root-relative folder from every layer below the mod that declares it.
 */
export interface ModLayers {
  /** Identity of the stack; indexes are cached by it. */
  readonly key: string;
  readonly gameRoot: string | undefined;
  /** Lowest priority first. */
  readonly roots: readonly string[];
  /** Absolute folders hidden by `replace_path`, normalized, with a trailing slash. */
  readonly hiddenFolders: readonly string[];
  readonly caseInsensitivePaths: boolean;
}

/** The file access a layered lookup needs; injected so the service stays testable. */
export interface LayerFileSystem {
  fileExists(absolutePath: string): boolean;
  /** Names (not paths) of the files with an extension directly inside a folder. */
  listFiles(absoluteDirectory: string, extension: string): string[];
  /** Forward-slash paths relative to `absoluteRoot`, prefixed with `relativeFolder`. */
  listFilesRecursive(absoluteRoot: string, relativeFolder: string): string[];
}

export interface LayerOptions {
  /** Windows: `Events/` and `events/` are the same folder. */
  readonly caseInsensitivePaths?: boolean;
}

/**
 * The game root (when there is an install) plus `mods`, which must already be
 * in load order. Without a game root nothing is hidden: `replace_path` only
 * ever hides game-root-relative folders.
 */
export function layersOf(
  gameRoot: string | undefined,
  mods: readonly ModDescriptor[],
  options: LayerOptions = {},
): ModLayers {
  const caseInsensitivePaths = options.caseInsensitivePaths ?? false;
  const roots = [...(gameRoot === undefined ? [] : [gameRoot]), ...mods.map((mod) => mod.folder)];
  const hiddenFolders =
    gameRoot === undefined
      ? []
      : mods
          .flatMap((mod) => mod.replacePaths)
          .map((replacePath) => `${normalizePath(path.join(gameRoot, replacePath), caseInsensitivePaths)}/`);
  return { key: layersKey(roots, hiddenFolders), gameRoot, roots, hiddenFolders, caseInsensitivePaths };
}

/** A mod folder on its own, with nothing underneath: how a mod outside any game install is read. */
export function singleRootLayers(root: string, options: LayerOptions = {}): ModLayers {
  const caseInsensitivePaths = options.caseInsensitivePaths ?? false;
  return {
    key: layersKey([root], []),
    gameRoot: undefined,
    roots: [root],
    hiddenFolders: [],
    caseInsensitivePaths,
  };
}

export function isHiddenPath(layers: ModLayers, absolutePath: string): boolean {
  if (layers.hiddenFolders.length === 0) {
    return false;
  }
  const normalized = `${normalizePath(absolutePath, layers.caseInsensitivePaths)}/`;
  return layers.hiddenFolders.some((hidden) => normalized.startsWith(hidden));
}

/** The absolute path of the file the game would read for `relativePath`, if any layer has it. */
export function resolveLayeredFile(
  layers: ModLayers,
  fileSystem: LayerFileSystem,
  relativePath: string,
): string | undefined {
  for (const root of rootsHighestFirst(layers)) {
    const candidate = path.join(root, relativePath);
    if (!isHiddenPath(layers, candidate) && fileSystem.fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/** File names directly inside a folder, merged across layers; a name appears once. */
export function listLayeredFiles(
  layers: ModLayers,
  fileSystem: LayerFileSystem,
  relativeDirectory: string,
  extension: string,
): string[] {
  const seen = new Map<string, string>();
  for (const root of rootsHighestFirst(layers)) {
    const directory = path.join(root, relativeDirectory);
    if (isHiddenPath(layers, directory)) {
      continue;
    }
    for (const name of fileSystem.listFiles(directory, extension)) {
      const key = layers.caseInsensitivePaths ? name.toLowerCase() : name;
      if (!seen.has(key)) {
        seen.set(key, name);
      }
    }
  }
  return [...seen.values()];
}

/** Relative paths under a folder, merged across layers; a path appears once. */
export function listLayeredFilesRecursive(
  layers: ModLayers,
  fileSystem: LayerFileSystem,
  relativeFolder: string,
): string[] {
  const seen = new Map<string, string>();
  for (const root of rootsHighestFirst(layers)) {
    if (isHiddenPath(layers, path.join(root, relativeFolder))) {
      continue;
    }
    for (const relativePath of fileSystem.listFilesRecursive(root, relativeFolder)) {
      if (isHiddenPath(layers, path.join(root, relativePath))) {
        continue;
      }
      const key = layers.caseInsensitivePaths ? relativePath.toLowerCase() : relativePath;
      if (!seen.has(key)) {
        seen.set(key, relativePath);
      }
    }
  }
  return [...seen.values()];
}

/** A `ModFileProvider` that reads the stack the way the game does. */
export function layeredIndexProvider(
  layers: ModLayers,
  fileSystem: LayerFileSystem,
  readFile: (absolutePath: string) => string | undefined,
): ModFileProvider {
  return {
    readFile: (relativePath: string): string | undefined => {
      const absolutePath = resolveLayeredFile(layers, fileSystem, relativePath);
      return absolutePath === undefined ? undefined : readFile(absolutePath);
    },
    listFiles: (relativeDirectory: string, extension: string): string[] =>
      listLayeredFiles(layers, fileSystem, relativeDirectory, extension),
  };
}

function rootsHighestFirst(layers: ModLayers): string[] {
  return [...layers.roots].reverse();
}

function layersKey(roots: readonly string[], hiddenFolders: readonly string[]): string {
  return `${roots.join('|')}#${hiddenFolders.join('|')}`;
}

function normalizePath(absolutePath: string, caseInsensitive: boolean): string {
  const resolved = path.resolve(absolutePath).replace(/\\/g, '/').replace(/\/+$/, '');
  return caseInsensitive ? resolved.toLowerCase() : resolved;
}
