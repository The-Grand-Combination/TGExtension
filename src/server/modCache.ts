import * as path from 'node:path';
import type { ModIndex } from '../model/modIndex.js';
import type { ModLayers } from '../services/modLayers.js';
import { relativeToRoot, type FileLocation } from '../services/modLayout.js';

export interface ModContext extends FileLocation {
  /** Undefined while the first index of the layers is still being built. */
  readonly index: ModIndex | undefined;
  /** Path relative to the owning mod's folder, forward slashes; what `classifyFile` expects. */
  readonly relativePath: string;
}

export interface ModCacheOptions {
  /** The mod folder a file belongs to and the layers it is read with; undefined outside any mod. */
  readonly locate: (fsPath: string) => FileLocation | undefined;
  readonly buildIndex: (layers: ModLayers) => Promise<ModIndex>;
  /** Called after every completed build, so the caller can publish mod-wide diagnostics. */
  readonly onIndexBuilt?: (layers: ModLayers, index: ModIndex) => void;
  /** Called when a build throws; the layers keep their previous index, if any. */
  readonly onBuildFailed?: (layers: ModLayers, error: unknown) => void;
}

/**
 * Caches the file locations and indexes a language server session works with.
 *
 * Location lookup is cached per **directory**, not per file, so every file in
 * a folder shares one lookup, and "no mod here" is cached too. Indexes are
 * keyed by the layers they were built from and built in the background: asking
 * for one starts a build, concurrent callers share it, and a refresh keeps
 * serving the previous index until the new one lands, so open documents never
 * lose their diagnostics in between.
 */
export class ModCache {
  private readonly layersByKey = new Map<string, ModLayers>();
  private readonly indexByKey = new Map<string, ModIndex>();
  private readonly buildsInFlight = new Map<string, Promise<ModIndex | undefined>>();
  /** Bumped by `refresh`; a build started under an older generation is redone. */
  private readonly generationByKey = new Map<string, number>();
  private readonly wantedKeys = new Set<string>();
  private readonly locationByDirectory = new Map<string, FileLocation | undefined>();

  constructor(private readonly options: ModCacheOptions) {}

  /** Layers whose index is currently built. */
  knownLayers(): ModLayers[] {
    return [...this.indexByKey.keys()].flatMap((key) => {
      const layers = this.layersByKey.get(key);
      return layers ? [layers] : [];
    });
  }

  /** The location of the files in a directory, if the directory belongs to a mod. */
  locationForDirectory(directory: string): FileLocation | undefined {
    const key = path.resolve(directory);
    const cached = this.locationByDirectory.get(key);
    if (cached !== undefined || this.locationByDirectory.has(key)) {
      return cached;
    }
    const location = this.options.locate(key);
    this.locationByDirectory.set(key, location);
    return location;
  }

  hasIndex(layers: ModLayers): boolean {
    return this.indexByKey.has(layers.key);
  }

  isBuilding(layers: ModLayers): boolean {
    return this.buildsInFlight.has(layers.key);
  }

  /** The built index of the layers, or undefined when none has finished yet. */
  indexFor(layers: ModLayers): ModIndex | undefined {
    return this.indexByKey.get(layers.key);
  }

  /**
   * The index of the layers, building it first when needed, and waiting for a
   * refresh in progress rather than answering with the index it replaces.
   * Undefined only if the build failed.
   */
  ensureIndex(layers: ModLayers): Promise<ModIndex | undefined> {
    const cached = this.indexByKey.get(layers.key);
    return cached && !this.buildsInFlight.has(layers.key) ? Promise.resolve(cached) : this.startBuild(layers);
  }

  /**
   * The context of a file: its location, relative path, and whatever index
   * exists. Layers without an index get one started, so the next validation has it.
   */
  contextFor(fsPath: string): ModContext | undefined {
    const location = this.locationForDirectory(path.dirname(fsPath));
    if (!location) {
      return undefined;
    }
    const index = this.indexByKey.get(location.layers.key);
    if (!index) {
      void this.startBuild(location.layers);
    }
    return { ...location, index, relativePath: relativeToRoot(location.root, fsPath) };
  }

  /** Indexed layers with a root that contains at least one of these paths. */
  layersContaining(fsPaths: readonly string[]): ModLayers[] {
    return this.knownLayers().filter((layers) =>
      layers.roots.some((root) => fsPaths.some((fsPath) => isInside(root, fsPath))),
    );
  }

  /** Rebuild the index of each layer set in the background; locations are dropped too. */
  refresh(layersList: readonly ModLayers[]): void {
    this.locationByDirectory.clear();
    for (const layers of layersList) {
      this.generationByKey.set(layers.key, this.generationOf(layers.key) + 1);
      void this.startBuild(layers);
    }
  }

  /**
   * Drop the directory→location map: the mods around the workspace changed,
   * so a cached lookup (including a cached miss) may be wrong. Indexes stay;
   * layers that come back identical reuse them.
   */
  resetLocations(): void {
    this.locationByDirectory.clear();
  }

  /** Drop everything known about these layers; a build still running is discarded when it ends. */
  forget(layersList: readonly ModLayers[]): void {
    for (const layers of layersList) {
      this.indexByKey.delete(layers.key);
      this.layersByKey.delete(layers.key);
      this.wantedKeys.delete(layers.key);
    }
    this.locationByDirectory.clear();
  }

  clear(): void {
    this.forget(this.knownLayers());
    this.wantedKeys.clear();
    this.indexByKey.clear();
    this.layersByKey.clear();
  }

  private generationOf(key: string): number {
    return this.generationByKey.get(key) ?? 0;
  }

  private startBuild(layers: ModLayers): Promise<ModIndex | undefined> {
    const inFlight = this.buildsInFlight.get(layers.key);
    if (inFlight) {
      return inFlight;
    }
    this.layersByKey.set(layers.key, layers);
    this.wantedKeys.add(layers.key);
    const generation = this.generationOf(layers.key);
    const build = this.options
      .buildIndex(layers)
      .then((index) => this.finishBuild(layers, generation, index))
      .catch((error: unknown) => {
        this.buildsInFlight.delete(layers.key);
        this.options.onBuildFailed?.(layers, error);
        return undefined;
      });
    this.buildsInFlight.set(layers.key, build);
    return build;
  }

  private finishBuild(layers: ModLayers, generation: number, index: ModIndex): Promise<ModIndex | undefined> {
    this.buildsInFlight.delete(layers.key);
    if (!this.wantedKeys.has(layers.key)) {
      return Promise.resolve(undefined);
    }
    if (this.generationOf(layers.key) !== generation) {
      // Files changed while this build ran; its result may already be stale.
      return this.startBuild(layers);
    }
    this.indexByKey.set(layers.key, index);
    this.options.onIndexBuilt?.(layers, index);
    return Promise.resolve(index);
  }
}

function isInside(root: string, fsPath: string): boolean {
  const relative = path.relative(root, fsPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
