import * as path from 'node:path';
import type { ModIndex } from '../model/modIndex.js';
import type { IndexBuildResult, IndexCarry, IndexReuse } from './modIndex.js';
import type { ModLayers } from './modLayers.js';
import { isInsideRoot, relativeToRoot, type FileLocation } from './modLayout.js';

/** Stands for "the carry is worthless"; the next build reads everything again. */
const EVERYTHING = Symbol('everything changed');

export interface ModContext extends FileLocation {
  /** Undefined while the first index of the layers is still being built. */
  readonly index: ModIndex | undefined;
  /** Path relative to the owning mod's folder, forward slashes; what `classifyFile` expects. */
  readonly relativePath: string;
}

export interface ModCacheOptions {
  /** The mod folder a file belongs to and the layers it is read with; undefined outside any mod. */
  readonly locate: (fsPath: string) => FileLocation | undefined;
  /** `reuse` is the last build's work minus what changed; undefined asks for a full build. */
  readonly buildIndex: (layers: ModLayers, reuse: IndexReuse | undefined) => Promise<IndexBuildResult>;
  /** Called after every completed build, so the caller can publish mod-wide diagnostics. */
  readonly onIndexBuilt?: (layers: ModLayers, index: ModIndex) => void;
  /** Called when a build throws; the layers keep their previous index, if any. */
  readonly onBuildFailed?: (layers: ModLayers, error: unknown) => void;
  /** Called when an index is let go. */
  readonly onIndexDropped?: (layers: ModLayers) => void;
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
  /** Per-file work of the last accepted build, for the next one to reuse. */
  private readonly carryByKey = new Map<string, IndexCarry>();
  /**
   * What changed since the carry was taken. `EVERYTHING` means the carry cannot
   * be trusted at all — the files were not named, or they are read differently
   * now. It is only cleared once a build has been accepted, so a change that
   * arrives mid-build is still honoured by the build that replaces it.
   */
  private readonly pendingChangedByKey = new Map<string, Set<string> | typeof EVERYTHING>();
  /** Stacks whose last build threw; only `ensureIndex` or `refresh` tries again. */
  private readonly failedKeys = new Set<string>();

  constructor(private readonly options: ModCacheOptions) {}

  /** Every stack with an index or a build under way. */
  knownLayers(): ModLayers[] {
    const keys = new Set([...this.indexByKey.keys(), ...this.buildsInFlight.keys()]);
    return [...keys].flatMap((key) => {
      const layers = this.layersByKey.get(key);
      return layers ? [layers] : [];
    });
  }

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
    if (cached && !this.buildsInFlight.has(layers.key)) {
      return Promise.resolve(cached);
    }
    this.failedKeys.delete(layers.key);
    return this.startBuild(layers);
  }

  /** The mod a file belongs to, without starting a build. */
  locationFor(fsPath: string): FileLocation | undefined {
    return this.locationForDirectory(path.dirname(fsPath));
  }

  /**
   * The context of a file: its location, relative path, and whatever index
   * exists. Layers without an index get one started, unless their last build failed.
   */
  contextFor(fsPath: string): ModContext | undefined {
    const location = this.locationFor(fsPath);
    if (!location) {
      return undefined;
    }
    const index = this.indexByKey.get(location.layers.key);
    if (!index && !this.failedKeys.has(location.layers.key)) {
      void this.startBuild(location.layers);
    }
    return { ...location, index, relativePath: relativeToRoot(location.root, fsPath) };
  }

  /** Indexed layers with a root that contains at least one of these paths. */
  layersContaining(fsPaths: readonly string[]): ModLayers[] {
    return this.knownLayers().filter((layers) =>
      layers.roots.some((root) => fsPaths.some((fsPath) => isInsideRoot(root, fsPath))),
    );
  }

  /**
   * Rebuild the index of each layer set in the background; locations are dropped
   * too. `changedIn` names the mod-relative paths that differ, so the rest of
   * the last build is reused; without it the whole index is read again.
   */
  refresh(layersList: readonly ModLayers[], changedIn?: (layers: ModLayers) => ReadonlySet<string>): void {
    this.locationByDirectory.clear();
    for (const layers of layersList) {
      this.notePending(layers.key, changedIn?.(layers));
      this.generationByKey.set(layers.key, this.generationOf(layers.key) + 1);
      this.failedKeys.delete(layers.key);
      void this.startBuild(layers);
    }
  }

  private notePending(key: string, changed: ReadonlySet<string> | undefined): void {
    const pending = this.pendingChangedByKey.get(key);
    if (changed === undefined || pending === EVERYTHING) {
      this.pendingChangedByKey.set(key, EVERYTHING);
      return;
    }
    this.pendingChangedByKey.set(key, new Set([...(pending ?? []), ...changed]));
  }

  /**
   * Drop the directory→location map: the mods around the workspace changed,
   * so a cached lookup (including a cached miss) may be wrong. Indexes stay;
   * layers that come back identical reuse them.
   */
  resetLocations(): void {
    this.locationByDirectory.clear();
  }

  /**
   * Drop every index except the stacks named. An index is tens of megabytes, and
   * a session collects one per stack it ever touches — opening a file in another
   * mod is enough — so the ones nothing points at any more are let go. A build
   * still running for a dropped stack is discarded when it ends.
   */
  evictUnused(keepKeys: ReadonlySet<string>): void {
    this.forget(this.knownLayers().filter((layers) => !keepKeys.has(layers.key)));
  }

  /** Drop everything known about these layers; a build still running is discarded when it ends. */
  forget(layersList: readonly ModLayers[]): void {
    for (const layers of layersList) {
      const hadIndex = this.indexByKey.delete(layers.key);
      this.layersByKey.delete(layers.key);
      this.wantedKeys.delete(layers.key);
      this.carryByKey.delete(layers.key);
      this.pendingChangedByKey.delete(layers.key);
      this.generationByKey.delete(layers.key);
      this.failedKeys.delete(layers.key);
      if (hadIndex) {
        this.options.onIndexDropped?.(layers);
      }
    }
    this.locationByDirectory.clear();
  }

  clear(): void {
    this.forget(this.knownLayers());
    this.wantedKeys.clear();
    this.indexByKey.clear();
    this.layersByKey.clear();
    this.carryByKey.clear();
    this.pendingChangedByKey.clear();
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
      .buildIndex(layers, this.reuseFor(layers.key))
      .then((built) => this.finishBuild(layers, generation, built))
      .catch((error: unknown) => {
        this.buildsInFlight.delete(layers.key);
        this.failedKeys.add(layers.key);
        this.options.onBuildFailed?.(layers, error);
        return undefined;
      });
    this.buildsInFlight.set(layers.key, build);
    return build;
  }

  /** The last build's work, minus what has changed since; undefined asks for a full build. */
  private reuseFor(key: string): IndexReuse | undefined {
    const carry = this.carryByKey.get(key);
    const pending = this.pendingChangedByKey.get(key);
    if (carry === undefined || pending === undefined || pending === EVERYTHING) {
      return undefined;
    }
    return { carry, changed: pending };
  }

  private finishBuild(
    layers: ModLayers,
    generation: number,
    built: IndexBuildResult,
  ): Promise<ModIndex | undefined> {
    this.buildsInFlight.delete(layers.key);
    if (!this.wantedKeys.has(layers.key)) {
      return Promise.resolve(undefined);
    }
    if (this.generationOf(layers.key) !== generation) {
      // Files changed while this build ran; its result may already be stale.
      // What changed stays pending, so the build that replaces this one sees it.
      return this.startBuild(layers);
    }
    this.indexByKey.set(layers.key, built.index);
    this.carryByKey.set(layers.key, built.carry);
    this.pendingChangedByKey.delete(layers.key);
    try {
      this.options.onIndexBuilt?.(layers, built.index);
    } catch (error: unknown) {
      this.options.onBuildFailed?.(layers, new Error(`after the build: ${describe(error)}`));
    }
    return Promise.resolve(built.index);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
