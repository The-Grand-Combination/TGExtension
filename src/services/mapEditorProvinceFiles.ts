import type { MapEditorStack } from './mapEditorStack.js';
import type { ModLayers } from './modLayers.js';
import { filterHistoryFolders, findHistoryFile } from './provinceHistoryEdit.js';
import { popFilesOf, provinceIdsInPopsFile } from './provincePopsEdit.js';

const PROVINCES_FOLDER = 'history/provinces';
const POPS_FOLDER = 'history/pops';

/** The walk of `history/provinces`, and what the current folder setting narrows it to. */
interface HistoryFiles {
  /** Every file the walk found, so a narrowed view can be recomputed without walking again. */
  readonly all: readonly string[];
  /** The pattern the narrowed list was built with; undefined means "no pattern". */
  readonly source: string | undefined;
  readonly narrowed: readonly string[];
}

export interface ProvinceFilesHost {
  /** Narrows which `history/provinces` subfolders count; undefined is all of them. */
  readonly historyFolderPattern: () => RegExp | undefined;
}

/**
 * Finding which file on disk holds a province. A mod of any size has thousands
 * of files under `history/provinces` and a pops file per date holds hundreds of
 * provinces, so both answers are worked out once per stack and kept: every
 * click on the map asks again.
 */
export class MapEditorProvinceFiles {
  private readonly historyByLayers = new Map<string, HistoryFiles>();
  /** `<layers key>#<date>` → province id → relative path of the pops file holding its block. */
  private readonly popsByDate = new Map<string, Map<number, string>>();

  constructor(
    private readonly host: ProvinceFilesHost,
    private readonly stack: MapEditorStack,
  ) {}

  /**
   * The province history files the editor works with: every one, unless the mod
   * narrows them to certain subfolders. The pattern is read per call, so a change
   * to the setting takes effect without a restart; the walk behind it is kept.
   */
  historyFiles(layers: ModLayers): readonly string[] {
    const pattern = this.host.historyFolderPattern();
    const kept = this.historyByLayers.get(layers.key);
    if (kept && kept.source === pattern?.source) {
      return kept.narrowed;
    }
    const all = kept?.all ?? this.stack.listRecursive(layers, PROVINCES_FOLDER);
    const narrowed = filterHistoryFolders(all, pattern);
    this.historyByLayers.set(layers.key, { all, source: pattern?.source, narrowed });
    return narrowed;
  }

  /**
   * A file for this province that the folder setting hides. Only asked when a
   * pattern is set: without one nothing is hidden, and a hidden file matters
   * because writing a new one would leave the game loading both.
   */
  hiddenHistoryFile(layers: ModLayers, provinceId: number): string | undefined {
    if (this.host.historyFolderPattern() === undefined) {
      return undefined;
    }
    const kept = this.historyByLayers.get(layers.key);
    return findHistoryFile(kept?.all ?? this.stack.listRecursive(layers, PROVINCES_FOLDER), provinceId);
  }

  /** Which file of a date holds each province, scanned once per stack and date. */
  async popsFiles(layers: ModLayers, date: string): Promise<ReadonlyMap<number, string>> {
    const key = `${layers.key}#${date}`;
    const kept = this.popsByDate.get(key);
    if (kept) {
      return kept;
    }
    const byProvince = new Map<number, string>();
    for (const name of popFilesOf(this.stack.listRecursive(layers, POPS_FOLDER), date)) {
      const relativePath = `${POPS_FOLDER}/${date}/${name}`;
      const absolutePath = this.stack.resolve(layers, relativePath);
      const text = absolutePath === undefined ? undefined : await this.stack.readText(absolutePath);
      for (const id of provinceIdsInPopsFile(text ?? '')) {
        if (!byProvince.has(id)) {
          byProvince.set(id, relativePath);
        }
      }
    }
    this.popsByDate.set(key, byProvince);
    return byProvince;
  }

  /** A history file was written or renamed, so the kept walk no longer describes the folder. */
  forgetHistory(layers: ModLayers): void {
    this.historyByLayers.delete(layers.key);
  }

  forgetAllHistory(): void {
    this.historyByLayers.clear();
  }

  forgetPops(layers: ModLayers, date: string): void {
    this.popsByDate.delete(`${layers.key}#${date}`);
  }

  forgetAllPops(): void {
    this.popsByDate.clear();
  }

  clear(): void {
    this.forgetAllHistory();
    this.forgetAllPops();
  }
}
