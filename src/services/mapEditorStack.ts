import type { Document } from '../model/ast.js';
import { decodeBmp, type BmpImage } from './bmpDecoder.js';
import {
  listLayeredFilesRecursive,
  resolveLayeredFile,
  type LayerFileSystem,
  type ModLayers,
} from './modLayers.js';
import type { ProvinceDefinition } from '../model/mapEditor.js';
import { parseProvinceDefinitions, parseProvinceRows, type ProvinceRow } from './provinceTable.js';
import { parseDocument } from './syntaxValidation.js';

/** A map script file the editor reads whole and patches: positions, climates, regions. */
export interface ScriptFile {
  readonly absolutePath: string;
  readonly text: string;
  readonly document: Document;
}

/** `map/definition.csv` read and parsed once per stack: every click and every save asks for it. */
export interface DefinitionTable {
  /** Undefined when the stack has no file; a file that would not read is an empty table under its path. */
  readonly absolutePath: string | undefined;
  readonly text: string;
  readonly rows: ProvinceRow[];
  readonly definitions: ProvinceDefinition[];
}

/** The reads the stack layer needs; the Map Editor host provides them. */
export interface StackReaderHost {
  readonly fileSystem: LayerFileSystem;
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
  readonly readBytes: (absolutePath: string) => Promise<Uint8Array | undefined>;
}

const DEFINITION_CSV = 'map/definition.csv';

/**
 * Reading mod files the way the game stacks them, for the Map Editor.
 *
 * Everything else the editor does is built on this: it owns the lookups, the
 * folder walks, and the two things worth keeping between requests — the parsed
 * map scripts and `definition.csv`. Bitmaps are deliberately not kept; see
 * `readBitmap`.
 */
export class MapEditorStack {
  /** `<layers key>#<relative path>` → a parsed map file, or undefined when the stack has none. */
  private readonly scriptByLayers = new Map<string, Promise<ScriptFile | undefined>>();
  private readonly definitionsByLayers = new Map<string, Promise<DefinitionTable>>();

  constructor(private readonly host: StackReaderHost) {}

  resolve(layers: ModLayers, relativePath: string): string | undefined {
    return resolveLayeredFile(layers, this.host.fileSystem, relativePath);
  }

  listRecursive(layers: ModLayers, relativeFolder: string): string[] {
    return listLayeredFilesRecursive(layers, this.host.fileSystem, relativeFolder);
  }

  readText(absolutePath: string): Promise<string | undefined> {
    return this.host.readText(absolutePath);
  }

  definitions(layers: ModLayers): Promise<DefinitionTable> {
    return cached(this.definitionsByLayers, layers.key, async () => {
      const absolutePath = this.resolve(layers, DEFINITION_CSV);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      const held = text ?? '';
      return { absolutePath, text: held, rows: parseProvinceRows(held), definitions: parseProvinceDefinitions(held) };
    });
  }

  scriptFile(layers: ModLayers, relativePath: string): Promise<ScriptFile | undefined> {
    return cached(this.scriptByLayers, `${layers.key}#${relativePath}`, async () => {
      const absolutePath = this.resolve(layers, relativePath);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      return absolutePath === undefined || text === undefined
        ? undefined
        : { absolutePath, text, document: parseDocument(text).document };
    });
  }

  /**
   * A map bitmap, read fresh each time. It is deliberately not kept: an entry
   * would be the whole file, and a mod's three bitmaps run to about 100 MB,
   * while a warm re-read of the 60 MB `provinces.bmp` costs 13 ms and
   * `decodeBmp` only reads the header. What is worth keeping is what gets built
   * out of the pixels — the thumbnails and the terrain table — and those have
   * caches of their own.
   */
  async readBitmap(layers: ModLayers, relativePath: string): Promise<BmpImage | undefined> {
    const absolutePath = this.resolve(layers, relativePath);
    if (absolutePath === undefined) {
      return undefined;
    }
    const bytes = await this.host.readBytes(absolutePath);
    const decoded = bytes === undefined ? undefined : decodeBmp(bytes);
    return decoded?.kind === 'image' ? decoded.image : undefined;
  }

  clear(): void {
    this.forgetAllScripts();
    this.forgetAllDefinitions();
  }

  /** One script the caller has just written: what is kept is no longer the file. */
  forgetScript(layers: ModLayers, relativePath: string): void {
    this.scriptByLayers.delete(`${layers.key}#${relativePath}`);
  }

  forgetAllScripts(): void {
    this.scriptByLayers.clear();
  }

  forgetDefinitions(layers: ModLayers): void {
    this.definitionsByLayers.delete(layers.key);
  }

  forgetAllDefinitions(): void {
    this.definitionsByLayers.clear();
  }
}

/** What `cached` needs of a store; a `Map` and a `BoundedCache` both provide it. */
export interface PromiseStore<T> {
  get(key: string): Promise<T> | undefined;
  set(key: string, value: Promise<T>): unknown;
  delete(key: string): unknown;
}

/**
 * The promise kept under `key`, built on the first ask. A rejection is not
 * kept: the next ask tries again, instead of answering the same error until
 * the caches are dropped.
 */
export function cached<T>(store: PromiseStore<T>, key: string, build: () => Promise<T>): Promise<T> {
  const kept = store.get(key);
  if (kept) {
    return kept;
  }
  const building: Promise<T> = build().catch((error: unknown) => {
    if (store.get(key) === building) {
      store.delete(key);
    }
    throw error;
  });
  store.set(key, building);
  return building;
}

export { pathKey } from './modLayout.js';
