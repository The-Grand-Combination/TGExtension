import * as path from 'node:path';
import type { ModDescriptor } from '../model/modDescriptor.js';
import type { LayerOptions, ModLayers } from './modLayers.js';
import { layersOf } from './modLayers.js';
import {
  detectGameRoot,
  detectModDirectory,
  loadModDescriptors,
  mergeDescriptors,
  resolveSelection,
  type FileLocation,
  type ModLayout,
} from './modLayout.js';
import type { TargetParams } from './modStackHost.js';

/** Reading the install and the `.mod` descriptors around it. */
export interface LayoutFileSystem {
  readonly listFiles: (directory: string, extension: string) => string[];
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly isDirectory: (directoryPath: string) => boolean;
}

export interface LayoutInputs {
  /** `victorianTools.gamePath`; empty to detect the install from the workspace. */
  readonly gamePath: string;
  readonly activeMods: readonly string[];
  readonly workspaceFolders: readonly string[];
  readonly options: LayerOptions;
}

export interface LoadedLayout {
  readonly layout: ModLayout;
  /** Set when a configured `gamePath` was ignored because it holds no `mod/` folder. */
  readonly ignoredGamePath: string | undefined;
}

/**
 * The install's `mod/` plus every mod directory a workspace folder sits in (a
 * checkout laid out like `mod/`). A checkout shadows the installed copy of the
 * same name: that is the one being edited.
 */
export function loadLayout(inputs: LayoutInputs, fileSystem: LayoutFileSystem): LoadedLayout {
  const found = findGameRoot(inputs, fileSystem);
  const gameRoot = found.gameRoot;
  const installedDirectory = gameRoot === undefined ? undefined : path.join(gameRoot, 'mod');
  const installed = installedDirectory === undefined ? [] : loadModDescriptors(installedDirectory, fileSystem);
  const checkedOut: ModDescriptor[] = [];
  for (const directory of externalModDirectories(inputs, fileSystem, installedDirectory)) {
    checkedOut.push(...loadModDescriptors(directory, fileSystem));
  }
  const mods = mergeDescriptors(checkedOut, installed);
  return {
    layout: { gameRoot, mods, selection: resolveSelection(mods, inputs.activeMods) },
    ignoredGamePath: found.ignoredGamePath,
  };
}

function externalModDirectories(
  inputs: LayoutInputs,
  fileSystem: LayoutFileSystem,
  installedDirectory: string | undefined,
): string[] {
  const found = new Set<string>();
  for (const folder of inputs.workspaceFolders) {
    const directory = detectModDirectory(folder, fileSystem.listFiles);
    if (directory !== undefined && !samePath(directory, installedDirectory, inputs.options)) {
      found.add(directory);
    }
  }
  return [...found];
}

export function samePath(left: string, right: string | undefined, options: LayerOptions): boolean {
  if (right === undefined) {
    return false;
  }
  const [a, b] = [path.resolve(left), path.resolve(right)];
  return options.caseInsensitivePaths === true ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** The configured install folder when it holds a `mod/` folder, else the one above the workspace. */
function findGameRoot(
  inputs: LayoutInputs,
  fileSystem: LayoutFileSystem,
): { gameRoot: string | undefined; ignoredGamePath: string | undefined } {
  let ignoredGamePath: string | undefined;
  if (inputs.gamePath !== '') {
    const configured = path.resolve(inputs.gamePath);
    if (fileSystem.isDirectory(path.join(configured, 'mod'))) {
      return { gameRoot: configured, ignoredGamePath: undefined };
    }
    ignoredGamePath = configured;
  }
  for (const folder of inputs.workspaceFolders) {
    const detected = detectGameRoot(folder, fileSystem.isDirectory);
    if (detected !== undefined) {
      return { gameRoot: detected, ignoredGamePath };
    }
  }
  return { gameRoot: undefined, ignoredGamePath };
}

/** The stack of the picked mods, or undefined when none is picked. */
export function selectionLayers(layout: ModLayout, options: LayerOptions): ModLayers | undefined {
  return layout.selection.length > 0 ? layersOf(layout.gameRoot, layout.selection, options) : undefined;
}

/**
 * The mods to report on: the ones the request names, each over the game and
 * its dependencies (one stack for all of them); else the mods set in Settings,
 * each over the whole selection; else the mod each workspace folder belongs to.
 */
export function reportTargets(
  layout: ModLayout,
  params: TargetParams,
  workspaceFolders: readonly string[],
  options: LayerOptions,
  locate: (directory: string) => FileLocation | undefined,
): FileLocation[] {
  if (params.mods.length > 0) {
    const stack = resolveSelection(layout.mods, params.mods);
    const layers = layersOf(layout.gameRoot, stack, options);
    return stack.filter((mod) => params.mods.includes(mod.name)).map((mod) => ({ root: mod.folder, layers }));
  }
  const selection = selectionLayers(layout, options);
  if (selection) {
    return layout.selection.map((mod) => ({ root: mod.folder, layers: selection }));
  }
  const byRoot = new Map<string, FileLocation>();
  const folders = params.workspaceFolders.length > 0 ? params.workspaceFolders : workspaceFolders;
  for (const folder of folders) {
    const location = locate(folder);
    if (location) {
      byRoot.set(location.root, location);
    }
  }
  return [...byRoot.keys()].sort().flatMap((root) => {
    const location = byRoot.get(root);
    return location ? [location] : [];
  });
}
