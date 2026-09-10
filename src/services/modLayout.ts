import * as path from 'node:path';
import type { ModDescriptor } from '../model/modDescriptor.js';
import { parseModDescriptor } from '../parser/modDescriptor.js';
import { layersOf, singleRootLayers, type LayerOptions, type ModLayers } from './modLayers.js';

/**
 * What the extension knows about the Victoria 2 install and the mods around
 * the workspace: the game root, every descriptor (installed under `<game>/mod`
 * or checked out elsewhere), and the mods the user asked to stack together.
 */
export interface ModLayout {
  readonly gameRoot: string | undefined;
  /** Every known mod, one per name, sorted by name. */
  readonly mods: readonly ModDescriptor[];
  /** The selected mods and their dependencies, in load order; empty when nothing is selected. */
  readonly selection: readonly ModDescriptor[];
}

/** Where a file lives: the folder of the mod that owns it, and the stack it is read with. */
export interface FileLocation {
  readonly root: string;
  readonly layers: ModLayers;
}

export interface DescriptorFileSystem {
  listFiles(absoluteDirectory: string, extension: string): string[];
  readFile(absolutePath: string): string | undefined;
}

export const EMPTY_LAYOUT: ModLayout = { gameRoot: undefined, mods: [], selection: [] };

/** The folders that mark a game root: the install has `mod/` next to `common/` and `map/`. */
const GAME_ROOT_FOLDERS: readonly string[] = ['mod', 'common', 'map'];

/** Walk up from a path until a Victoria 2 install folder is found. */
export function detectGameRoot(startPath: string, isDirectory: (directory: string) => boolean): string | undefined {
  return walkUp(startPath, (current) => GAME_ROOT_FOLDERS.every((folder) => isDirectory(path.join(current, folder))));
}

/**
 * Walk up from a path until a folder holding `.mod` files: the install's `mod/`,
 * or a checkout laid out the same way (`GFM.mod` next to `GFM/`).
 */
export function detectModDirectory(
  startPath: string,
  listFiles: (absoluteDirectory: string, extension: string) => string[],
): string | undefined {
  return walkUp(startPath, (current) => listFiles(current, '.mod').length > 0);
}

/** Read every `*.mod` at the top of a mod directory, as the launcher does; sorted by name. */
export function loadModDescriptors(modDirectory: string, fileSystem: DescriptorFileSystem): ModDescriptor[] {
  const descriptors: ModDescriptor[] = [];
  for (const name of fileSystem.listFiles(modDirectory, '.mod')) {
    const descriptorPath = path.join(modDirectory, name);
    const text = fileSystem.readFile(descriptorPath);
    const descriptor = text === undefined ? undefined : parseModDescriptor(text, descriptorPath);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }
  return descriptors.sort(byName);
}

/** One descriptor per name; an earlier list wins, so a checkout being edited shadows the installed copy. */
export function mergeDescriptors(...lists: readonly (readonly ModDescriptor[])[]): ModDescriptor[] {
  const byModName = new Map<string, ModDescriptor>();
  for (const list of lists) {
    for (const mod of list) {
      if (!byModName.has(mod.name)) {
        byModName.set(mod.name, mod);
      }
    }
  }
  return [...byModName.values()].sort(byName);
}

/** Mods that depend on nothing; the settings page lists them first, each with its submods. */
export function baseMods(mods: readonly ModDescriptor[]): ModDescriptor[] {
  return mods.filter((mod) => mod.dependencies.length === 0).sort(byName);
}

/** Mods that depend on `modName`, directly or through another submod. */
export function submodsOf(mods: readonly ModDescriptor[], modName: string): ModDescriptor[] {
  const dependents = new Set<string>([modName]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const mod of mods) {
      if (!dependents.has(mod.name) && mod.dependencies.some((dependency) => dependents.has(dependency))) {
        dependents.add(mod.name);
        grew = true;
      }
    }
  }
  return mods.filter((mod) => mod.name !== modName && dependents.has(mod.name)).sort(byName);
}

/**
 * The order the game loads `wanted` in: every dependency before the mod that
 * needs it, otherwise the given order. A dependency that is not installed is
 * skipped; the launcher would refuse to start, we validate what is there.
 */
export function loadOrder(mods: readonly ModDescriptor[], wanted: readonly ModDescriptor[]): ModDescriptor[] {
  const byModName = new Map(mods.map((mod) => [mod.name, mod]));
  const ordered: ModDescriptor[] = [];
  const visited = new Set<string>();
  const visit = (mod: ModDescriptor): void => {
    if (visited.has(mod.name)) {
      return;
    }
    visited.add(mod.name);
    for (const dependencyName of mod.dependencies) {
      const dependency = byModName.get(dependencyName);
      if (dependency) {
        visit(dependency);
      }
    }
    ordered.push(mod);
  };
  for (const mod of wanted) {
    visit(mod);
  }
  return ordered;
}

/** Names `selection` asks for that no known mod has. */
export function missingDependencies(mods: readonly ModDescriptor[], selection: readonly ModDescriptor[]): string[] {
  const installed = new Set(mods.map((mod) => mod.name));
  const missing = new Set<string>();
  for (const mod of selection) {
    for (const dependency of mod.dependencies) {
      if (!installed.has(dependency)) {
        missing.add(dependency);
      }
    }
  }
  return [...missing];
}

/**
 * The selected mods that exist, in load order: dependencies first, otherwise
 * by name. Any combination is allowed, as in the launcher; whether two base
 * mods can coexist is the modder's call.
 */
export function resolveSelection(mods: readonly ModDescriptor[], selectedNames: readonly string[]): ModDescriptor[] {
  const selected = mods.filter((candidate) => selectedNames.includes(candidate.name)).sort(byName);
  return loadOrder(mods, selected);
}

/** A mod folder with no descriptor, read as a mod of its own: no `replace_path`, no dependencies. */
export function folderMod(folder: string): ModDescriptor {
  const name = path.basename(folder);
  return { name, path: `mod/${name}`, folder, replacePaths: [], dependencies: [], descriptorPath: '' };
}

/**
 * The mod a file belongs to and the layers it is read with. A file of a
 * selected mod is read with the whole selection; a file of any other known mod
 * with the game and that mod's dependencies; a file of an undeclared folder
 * under `<game>/mod` with the game; a file of the game itself with the game
 * alone. Undefined when no known folder contains the file.
 */
export function locateFile(layout: ModLayout, fsPath: string, options: LayerOptions = {}): FileLocation | undefined {
  const owner = deepestOwner(layout.mods, fsPath);
  if (owner) {
    const selected = layout.selection.some((mod) => mod.name === owner.name);
    const stack = selected ? layout.selection : loadOrder(layout.mods, [owner]);
    return { root: owner.folder, layers: layersOf(layout.gameRoot, stack, options) };
  }
  const { gameRoot } = layout;
  if (gameRoot === undefined || !isInsideRoot(gameRoot, fsPath)) {
    return undefined;
  }
  const undeclared = undeclaredModFolder(gameRoot, fsPath);
  if (undeclared !== undefined) {
    return locateLoneMod(layout, undeclared, options);
  }
  return { root: gameRoot, layers: singleRootLayers(gameRoot, options) };
}

/** A mod folder no descriptor claims: read over the game files when there is an install, alone otherwise. */
export function locateLoneMod(layout: ModLayout, root: string, options: LayerOptions = {}): FileLocation {
  return {
    root,
    layers:
      layout.gameRoot === undefined
        ? singleRootLayers(root, options)
        : layersOf(layout.gameRoot, [folderMod(root)], options),
  };
}

/** True when `fsPath` sits inside `root` (case-insensitively on Windows). */
export function isInsideRoot(root: string, fsPath: string): boolean {
  const relative = path.relative(root, fsPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function relativeToRoot(root: string, fsPath: string): string {
  return path.relative(root, fsPath).replace(/\\/g, '/');
}

function walkUp(startPath: string, matches: (directory: string) => boolean): string | undefined {
  let current = path.resolve(startPath);
  for (;;) {
    if (matches(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function deepestOwner(mods: readonly ModDescriptor[], fsPath: string): ModDescriptor | undefined {
  let owner: ModDescriptor | undefined;
  for (const mod of mods) {
    if (isInsideRoot(mod.folder, fsPath) && (!owner || mod.folder.length > owner.folder.length)) {
      owner = mod;
    }
  }
  return owner;
}

/** The `<game>/mod/<folder>` a file is under, when that folder has no `.mod` file. */
function undeclaredModFolder(gameRoot: string, fsPath: string): string | undefined {
  const modDirectory = path.join(gameRoot, 'mod');
  if (!isInsideRoot(modDirectory, fsPath)) {
    return undefined;
  }
  const [folderName] = relativeToRoot(modDirectory, fsPath).split('/');
  if (folderName === undefined || folderName === '' || folderName.toLowerCase().endsWith('.mod')) {
    return undefined;
  }
  return path.join(modDirectory, folderName);
}

function byName(left: ModDescriptor, right: ModDescriptor): number {
  return left.name.localeCompare(right.name);
}
