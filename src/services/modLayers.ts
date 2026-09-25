import * as path from 'node:path';
import type { Document } from '../model/ast.js';
import type { ModDescriptor } from '../model/modDescriptor.js';
import type { ModFileProvider } from './modIndex.js';
import { parseDocument } from './syntaxValidation.js';

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

/**
 * The mod-relative path an absolute path has inside this stack, or undefined
 * when no layer holds it. The highest layer wins, the same way a lookup does,
 * so a file present in two layers is named once.
 */
export function relativeInLayers(layers: ModLayers, absolutePath: string): string | undefined {
  const target = normalizePath(absolutePath, layers.caseInsensitivePaths);
  for (const root of rootsHighestFirst(layers)) {
    const prefix = `${normalizePath(root, layers.caseInsensitivePaths)}/`;
    if (target.startsWith(prefix)) {
      // Cased as the file system spells it: the lookups it feeds are case-folded anyway.
      return path.resolve(absolutePath).replace(/\\/g, '/').slice(prefix.length);
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

/** A file the stack resolves to, and the layer it was found in. */
export interface LayeredFile {
  readonly relativePath: string;
  readonly absolutePath: string;
}

/**
 * Relative paths under a folder, merged across layers; a path appears once.
 *
 * Prefer `listLayeredFilesResolved` when the files are going to be read: the
 * walk already knows which layer won each path, and asking `resolveLayeredFile`
 * for it afterwards pays a `fileExists` per layer per file all over again.
 */
export function listLayeredFilesRecursive(
  layers: ModLayers,
  fileSystem: LayerFileSystem,
  relativeFolder: string,
): string[] {
  return listLayeredFilesResolved(layers, fileSystem, relativeFolder).map((file) => file.relativePath);
}

/** A layered file whose text has been read, so several audits can share one read. */
export interface LoadedLayeredFile extends LayeredFile {
  readonly text: string;
  /** The parsed text, built on the first ask and kept. */
  readonly document: () => Document;
}

export function loadLayeredFile(file: LayeredFile, text: string): LoadedLayeredFile {
  let parsed: Document | undefined;
  return {
    ...file,
    text,
    document: (): Document => (parsed ??= parseDocument(text).document),
  };
}

/** The same merge, keeping the absolute path of the layer each file came from. */
export function listLayeredFilesResolved(
  layers: ModLayers,
  fileSystem: LayerFileSystem,
  relativeFolder: string,
): LayeredFile[] {
  const seen = new Map<string, LayeredFile>();
  for (const root of rootsHighestFirst(layers)) {
    if (isHiddenPath(layers, path.join(root, relativeFolder))) {
      continue;
    }
    for (const relativePath of fileSystem.listFilesRecursive(root, relativeFolder)) {
      const absolutePath = path.join(root, relativePath);
      if (isHiddenPath(layers, absolutePath)) {
        continue;
      }
      const key = layers.caseInsensitivePaths ? relativePath.toLowerCase() : relativePath;
      if (!seen.has(key)) {
        seen.set(key, { relativePath, absolutePath });
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
    listFilesRecursive: (relativeFolder: string): string[] =>
      listLayeredFilesRecursive(layers, fileSystem, relativeFolder),
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
