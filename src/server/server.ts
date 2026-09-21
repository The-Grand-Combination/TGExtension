import * as path from 'node:path';
import {
  createConnection,
  CompletionItemKind,
  InsertTextFormat,
  LSPErrorCodes,
  MarkupKind,
  ProposedFeatures,
  ResponseError,
  TextDocuments,
  TextDocumentSyncKind,
  type CancellationToken,
  type CompletionItem,
  type CompletionList,
  type Connection,
  type HandlerResult,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type Position,
  type Range as LspRange,
  type WorkspaceFoldersChangeEvent,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import {
  fileExists,
  findModRoot,
  isDirectory,
  listFiles,
  listFilesRecursive,
  readModFile,
  readModFileAsync,
  readModFileBytes,
  readModFileBytesAsync,
  renameModFile,
  writeModFileBytes,
  writeModFileText,
} from '../io/modFiles.js';
import type { Codepage } from '../io/textCodec.js';
import {
  ENFORCE_COLORMAPS_REQUEST,
  type EnforceColormapsParams,
  type EnforceColormapsResult,
} from '../model/colormaps.js';
import { isCancelled, type CancelSignal } from '../model/cancellation.js';
import type { Diagnostic } from '../model/diagnostic.js';
import type { RequestDescriptor } from '../model/request.js';
import { classifyFile } from '../model/fileType.js';
import {
  FULL_REPORT_REQUEST,
  type FullReportParams,
  type FullReportResult,
} from '../model/fullReport.js';
import {
  MAP_EDITOR_COUNTRY_COLORS_REQUEST,
  MAP_EDITOR_STATE_COLORS_REQUEST,
  MAP_EDITOR_MAP_REQUEST,
  MAP_EDITOR_NEW_PROVINCE_REQUEST,
  MAP_EDITOR_PAINT_REQUEST,
  MAP_EDITOR_POSITIONS_REQUEST,
  MAP_EDITOR_PROVINCE_REQUEST,
  MAP_EDITOR_SAVE_REQUEST,
  MAP_EDITOR_TERRAIN_PICTURE_REQUEST,
  MAP_EDITOR_THUMBNAILS_REQUEST,
  PROVINCE_FOLDER_FLAGS,
  type MapCountryColorsResult,
  type MapStateColorsResult,
  type MapThumbnails,
  type MapEditorMapResult,
  type MapEditorTargetParams,
  type NewProvinceParams,
  type PaintParams,
  type PaintResult,
  type MapPositionsResult,
  type ProvinceRequestParams,
  type ProvinceResult,
  type SaveParams,
  type SaveResult,
  type TerrainPictureParams,
  type TerrainPictureResult,
} from '../model/mapEditor.js';
import { LAYOUT_CHANGED_NOTIFICATION, MODS_REQUEST, type ModDescriptor, type ModsResult } from '../model/modDescriptor.js';
import {
  MAP_REPORT_REQUEST,
  type MapReportParams,
  type MapReportResult,
} from '../model/mapAudit.js';
import type { ModIndex } from '../model/modIndex.js';
import { duplicateDiagnosticsByFile, duplicateDiagnosticsFor } from '../services/duplicateDiagnostics.js';
import { validateFileText } from '../services/fileValidation.js';
import { NULL_TAG_FLAGS, type ValidationOptions } from '../model/validationOptions.js';
import { enforceColormaps, type ColormapEnforcementHost } from '../services/colormapEnforcementHandlers.js';
import { buildFullReport, type FullReportHost } from '../services/fullReportHandlers.js';
import { buildMapReports, type MapReportHost } from '../services/mapReportHandlers.js';
import type { ModStackHost, TargetParams } from '../services/modStackHost.js';
import { locKeyHoverMarkdown, resolveLocKeyAt } from '../services/locDefinition.js';
import { buildModIndexAsync, type IndexBuildResult, type IndexReuse } from '../services/modIndex.js';
import {
  layeredIndexProvider,
  listLayeredFiles,
  relativeInLayers,
  resolveLayeredFile,
  type LayerFileSystem,
  type LayerOptions,
  type ModLayers,
} from '../services/modLayers.js';
import {
  locateFile,
  locateLoneMod,
  missingDependencies,
  type FileLocation,
  type ModLayout,
} from '../services/modLayout.js';
import {
  loadLayout,
  reportTargets,
  selectionLayers as layersOfSelection,
} from '../services/serverLayout.js';
import { CompiledPattern, CompiledValidationOptions } from '../services/validationSettings.js';
import { pictureHoverAt, pictureHoverMarkdown, type PictureHover } from '../services/pictureHover.js';
import { resolveKeyAt, symbolHoverMarkdown } from '../services/symbolHover.js';
import { completionsAt, type CompletionEntry, type CompletionKind } from '../services/completion.js';
import { BoundedCache } from '../services/boundedCache.js';
import { DocumentAnalysisCache, type AnalyzedDocument } from '../services/documentAnalysis.js';
import { MapEditorHandlers } from '../services/mapEditorHandlers.js';
import { ModCache, type ModContext } from '../services/modCache.js';
import {
  configChange,
  DEFAULT_CONFIG,
  fetchServerConfig,
  type ConfigChange,
  type ServerConfig,
} from './serverConfig.js';
import { toLspDiagnostics } from './toLspDiagnostic.js';

const connection: Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let config: ServerConfig = DEFAULT_CONFIG;
const compiledOptions = new CompiledValidationOptions(NULL_TAG_FLAGS);
/** `history/provinces` subfolders the Map Editor sees; empty means all of them. */
const compiledProvinceFolder = new CompiledPattern(PROVINCE_FOLDER_FLAGS);

/**
 * Text I/O bound to the mod's code page. These read `config` on every call
 * rather than closing over a value: the setting changes while the server runs,
 * and `applyLayout(true)` re-reads everything when it does.
 */
function readText(absolutePath: string): string | undefined {
  return readModFile(absolutePath, config.encoding);
}

function readTextAsync(absolutePath: string): Promise<string | undefined> {
  return readModFileAsync(absolutePath, config.encoding);
}

function writeText(absolutePath: string, text: string): Promise<boolean> {
  return writeModFileText(absolutePath, text, config.encoding);
}

/** The validation options of the current configuration; the regexes are compiled once per change. */
function validationOptions(): ValidationOptions {
  return compiledOptions.of(config);
}

function provinceFolderPattern(): RegExp | undefined {
  return compiledProvinceFolder.of(config.provinceFolderPattern);
}

let workspaceFolders: string[] = [];
/** The install, its mods, and the user's selection; rebuilt on config and `.mod` changes. */
let layout: ModLayout = { gameRoot: undefined, mods: [], selection: [] };

const LAYER_OPTIONS: LayerOptions = { caseInsensitivePaths: process.platform === 'win32' };
const layerFileSystem: LayerFileSystem = { fileExists, listFiles, listFilesRecursive };

const modCache = new ModCache({
  locate: locateFsPath,
  buildIndex: buildIndexFor,
  onIndexBuilt: indexBuilt,
  onBuildFailed: indexFailed,
});

/** The tokens of the document a request is about; see `DocumentAnalysisCache`. */
const documentAnalyses = new DocumentAnalysisCache();

/**
 * Rendered picture hovers, keyed by absolute path; decoding a `.dds` is slow.
 * Bounded by what the markdown weighs rather than by a count: one preview runs
 * to 96k characters of base64, so two hundred of them would be tens of
 * megabytes held for the life of the session.
 */
const PICTURE_CACHE_CHARACTERS = 8_000_000;
/** What a remembered miss weighs: no markdown, but still a key worth bounding. */
const PICTURE_MISS_WEIGHT = 64;
const pictureCache = new BoundedCache<string, string | undefined>({
  weight: PICTURE_CACHE_CHARACTERS,
  weigh: (markdown: string | undefined): number => markdown?.length ?? PICTURE_MISS_WEIGHT,
});

/** URIs this server published index-time diagnostics to, per layers key. */
const publishedByLayers = new Map<string, Set<string>>();
/** Open documents that resolved to no mod, so a new one can wake them. */
const rootlessDocumentUris = new Set<string>();

const validationTimers = new Map<string, NodeJS.Timeout>();
let pendingWatchedChanges: string[] = [];
let rebuildTimer: NodeJS.Timeout | undefined;

let supportsWorkspaceFolders = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  workspaceFolders = folderPathsOf(params);
  supportsWorkspaceFolders = params.capabilities.workspace?.workspaceFolders === true;
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      hoverProvider: true,
      // '=' and ' ' are what open the list on `key = ` before anything is typed.
      completionProvider: { triggerCharacters: ['=', ' '], resolveProvider: false },
      ...(supportsWorkspaceFolders ? { workspace: { workspaceFolders: { supported: true } } } : {}),
    },
  };
});

function folderPathsOf(params: InitializeParams): string[] {
  return (params.workspaceFolders ?? []).map((folder) => URI.parse(folder.uri).fsPath);
}

connection.onInitialized(() => {
  if (supportsWorkspaceFolders) {
    connection.workspace.onDidChangeWorkspaceFolders(applyWorkspaceFolderChange);
  }
  void refreshConfiguration().then(() => {
    applyLayout();
  });
});

function applyWorkspaceFolderChange(event: WorkspaceFoldersChangeEvent): void {
  const removed = new Set(event.removed.map((folder) => URI.parse(folder.uri).fsPath));
  workspaceFolders = workspaceFolders
    .filter((folder) => !removed.has(folder))
    .concat(event.added.map((folder) => URI.parse(folder.uri).fsPath));
  applyLayout();
}

connection.onShutdown(() => {
  stopTimers();
  modCache.clear();
  documentAnalyses.clear();
  pictureCache.clear();
  publishedByLayers.clear();
  rootlessDocumentUris.clear();
});

function stopTimers(): void {
  for (const timer of validationTimers.values()) {
    clearTimeout(timer);
  }
  validationTimers.clear();
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    rebuildTimer = undefined;
  }
}

/** Index the selection and every mod in the workspace up front, so mod-wide errors show without opening a file. */
function warmIndexes(): void {
  if (!config.indexOnStartup || !config.validationEnabled) {
    return;
  }
  const selection = selectionLayers();
  if (selection) {
    void modCache.ensureIndex(selection);
  }
  for (const folder of workspaceFolders) {
    const location = modCache.locationForDirectory(folder);
    if (location) {
      void modCache.ensureIndex(location.layers);
    }
  }
}

connection.onDidChangeConfiguration(() => {
  void refreshConfiguration().then((change) => {
    if (change === 'other') {
      validateAllOpen();
    } else if (change !== 'none') {
      applyLayout(change === 'recoded');
    }
  });
});

async function refreshConfiguration(): Promise<ConfigChange> {
  const next = await fetchServerConfig(connection);
  const change = configChange(config, next);
  config = next;
  return change;
}

/** Re-read the install and the selection, then index and revalidate with the new layers. */
function applyLayout(recoded = false): void {
  const loaded = loadLayout(
    {
      gamePath: config.gamePath,
      activeMods: config.activeMods,
      workspaceFolders,
      options: LAYER_OPTIONS,
    },
    { listFiles, readFile: readText, isDirectory },
  );
  layout = loaded.layout;
  logLayout(loaded.ignoredGamePath);
  modCache.resetLocations();
  if (recoded) {
    // Locations are dropped above, but the indexes are not: they hold decoded
    // text, and only a rebuild reads the files again under the new code page.
    modCache.refresh(modCache.knownLayers());
  }
  mapEditor.invalidate();
  warmIndexes();
  validateAllOpen();
  void connection.sendNotification(LAYOUT_CHANGED_NOTIFICATION);
}

function logLayout(ignoredGamePath: string | undefined): void {
  if (ignoredGamePath !== undefined) {
    connection.console.warn(`victorianTools.gamePath has no mod/ folder: ${ignoredGamePath}`);
  }
  if (layout.gameRoot === undefined) {
    connection.console.log(
      `No Victoria 2 install found around the workspace; ${String(layout.mods.length)} mod(s) are read without the game files.`,
    );
  } else {
    connection.console.log(`Game root ${layout.gameRoot} with ${String(layout.mods.length)} mod descriptor(s)`);
  }
  for (const name of config.activeMods) {
    if (!layout.selection.some((mod) => mod.name === name)) {
      connection.console.warn(`Selected mod '${name}' is not installed.`);
    }
  }
  if (layout.selection.length > 0) {
    connection.console.log(`Load order: ${layout.selection.map((mod) => mod.name).join(' > ')}`);
  }
  for (const missing of missingDependencies(layout.mods, layout.selection)) {
    connection.console.warn(`Dependency '${missing}' is not installed.`);
  }
}

function selectionLayers(): ModLayers | undefined {
  return layersOfSelection(layout, LAYER_OPTIONS);
}

/** A file of a known mod or of the game gets its stack; any other folder with `common/` is a lone mod over the game. */
function locateFsPath(fsPath: string): FileLocation | undefined {
  const located = locateFile(layout, fsPath, LAYER_OPTIONS);
  if (located) {
    return located;
  }
  const root = findModRoot(fsPath);
  return root === undefined ? undefined : locateLoneMod(layout, root, LAYER_OPTIONS);
}

/**
 * Register a handler for one request descriptor. The descriptor decides both
 * the parameter and the result type, so the two sides cannot drift apart.
 */
function onRequest<TParams, TResult>(
  descriptor: RequestDescriptor<TParams, TResult>,
  handler: (params: TParams) => HandlerResult<TResult, unknown>,
): void {
  connection.onRequest(descriptor, handler);
}

/**
 * The same, for a handler long enough that the client may give up on it. The
 * cancellation token becomes a plain signal the services can read, and the
 * unwinding that follows is reported as cancellation rather than as a failure.
 */
function onCancellableRequest<TParams, TResult>(
  descriptor: RequestDescriptor<TParams, TResult>,
  handler: (params: TParams, signal: CancelSignal) => Promise<TResult>,
): void {
  connection.onRequest(descriptor, async (params: TParams, token: CancellationToken) => {
    try {
      return await handler(params, { get cancelled(): boolean { return token.isCancellationRequested; } });
    } catch (error: unknown) {
      if (isCancelled(error)) {
        return new ResponseError(LSPErrorCodes.RequestCancelled, 'Cancelled.');
      }
      throw error;
    }
  });
}

onRequest(
  MODS_REQUEST,
  (): ModsResult => ({ gameRoot: layout.gameRoot, mods: layout.mods }),
);

// --- Index building ----------------------------------------------------------------

async function buildIndexFor(layers: ModLayers, reuse: IndexReuse | undefined): Promise<IndexBuildResult> {
  const started = Date.now();
  const built = await buildModIndexAsync(layeredIndexProvider(layers, layerFileSystem, readText), reuse);
  const how = reuse === undefined ? 'Indexed' : `Re-indexed ${String(reuse.changed.size)} changed file(s) of`;
  connection.console.log(`${how} ${describeLayers(layers)} in ${String(Date.now() - started)}ms`);
  if (listLayeredFiles(layers, layerFileSystem, 'events', '.txt').length === 0) {
    connection.console.log(`No events/ files in ${describeLayers(layers)}`);
  }
  return built;
}

function describeLayers(layers: ModLayers): string {
  return layers.roots.length === 1 ? (layers.roots[0] ?? '') : layers.roots.slice(1).join(' > ');
}

/**
 * The changed files as the index names them: paths relative to whichever layer
 * holds them. A path outside every layer is left out — it changes nothing here.
 */
function relativePathsIn(layers: ModLayers, changed: readonly string[]): ReadonlySet<string> {
  const found = new Set<string>();
  for (const fsPath of changed) {
    const relativePath = relativeInLayers(layers, fsPath);
    if (relativePath !== undefined) {
      found.add(relativePath);
    }
  }
  return found;
}

/** A finished index: publish its mod-wide findings, then bring open documents up to date. */
function indexBuilt(layers: ModLayers, index: ModIndex): void {
  publishIndexDuplicates(layers, index);
  validateDocuments(
    documents
      .all()
      .map((document) => document.uri)
      .filter((uri) => contextForUri(uri)?.layers.key === layers.key),
  );
}

function indexFailed(layers: ModLayers, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  connection.console.error(`Indexing ${describeLayers(layers)} failed: ${reason}`);
}

/**
 * Publish index-time duplicates for files that are not open. An open document
 * merges them into its own publish, so writing them here as well would briefly
 * drop its syntax and semantic findings.
 */
function publishIndexDuplicates(layers: ModLayers, index: ModIndex): void {
  const previous = publishedByLayers.get(layers.key) ?? new Set<string>();
  const current = new Set<string>();
  for (const [filePath, diagnostics] of duplicateDiagnosticsByFile(index)) {
    const absolutePath = resolveLayeredFile(layers, layerFileSystem, filePath);
    if (absolutePath === undefined) {
      continue;
    }
    const uri = URI.file(absolutePath).toString();
    current.add(uri);
    if (!documents.get(uri)) {
      publishFromDisk(uri, absolutePath, diagnostics);
    }
  }
  for (const uri of previous) {
    if (!current.has(uri) && !documents.get(uri)) {
      void connection.sendDiagnostics({ uri, diagnostics: [] });
    }
  }
  publishedByLayers.set(layers.key, current);
}

/** Publish diagnostics for a file that is not open, reading it only to map offsets. */
function publishFromDisk(uri: string, absolutePath: string, diagnostics: readonly Diagnostic[]): void {
  if (diagnostics.length === 0) {
    void connection.sendDiagnostics({ uri, diagnostics: [] });
    return;
  }
  const text = readText(absolutePath);
  if (text === undefined) {
    return;
  }
  const holder = TextDocument.create(uri, 'victoria2', 0, text);
  void connection.sendDiagnostics({ uri, diagnostics: toLspDiagnostics(diagnostics, holder) });
}

// --- Watched files -----------------------------------------------------------------

connection.onDidChangeWatchedFiles((params) => {
  for (const change of params.changes) {
    pendingWatchedChanges.push(URI.parse(change.uri).fsPath);
  }
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }
  rebuildTimer = setTimeout(rebuildChangedIndexes, config.indexRebuildDelayMs);
});

/**
 * Rebuild only the layers the changed files belong to, in the background; each
 * finished index revalidates that mod's open documents. Other indexes stay valid.
 * A changed `.mod` descriptor re-reads the whole layout instead.
 */
function rebuildChangedIndexes(): void {
  rebuildTimer = undefined;
  const changed = pendingWatchedChanges;
  pendingWatchedChanges = [];
  for (const fsPath of changed) {
    pictureCache.delete(fsPath);
  }
  mapEditor.invalidate(changed);
  if (changed.some((fsPath) => fsPath.toLowerCase().endsWith('.mod'))) {
    applyLayout();
    return;
  }
  const affected = modCache.layersContaining(changed);
  modCache.refresh(affected, (layers) => relativePathsIn(layers, changed));
  if (affected.length === 0) {
    // Nothing indexed went stale, but a new mod root may have appeared: give
    // the documents that had none another chance to find one.
    validateDocuments([...rootlessDocumentUris]);
  }
}

// --- Validation --------------------------------------------------------------------

documents.onDidChangeContent((change) => {
  scheduleValidation(change.document.uri);
});

documents.onDidClose((event) => {
  cancelValidation(event.document.uri);
  documentAnalyses.forget(event.document.uri);
  rootlessDocumentUris.delete(event.document.uri);
  publishClosedDocument(event.document.uri);
  evictUnusedIndexes();
});

/**
 * The stacks still worth an index: the selection, the mods the workspace is of,
 * and whatever an open document belongs to. Anything else was reached by
 * opening one file somewhere else, and its index is tens of megabytes.
 */
function evictUnusedIndexes(): void {
  const keep = new Set<string>();
  const selection = selectionLayers();
  if (selection) {
    keep.add(selection.key);
  }
  for (const folder of workspaceFolders) {
    const location = modCache.locationForDirectory(folder);
    if (location) {
      keep.add(location.layers.key);
    }
  }
  for (const document of documents.all()) {
    const layers = contextForUri(document.uri)?.layers;
    if (layers) {
      keep.add(layers.key);
    }
  }
  modCache.evictUnused(keep);
}

/**
 * A closed file keeps its index-time duplicates: those were found across the
 * whole mod, not by having the file open. Everything else is cleared.
 */
function publishClosedDocument(uri: string): void {
  const fsPath = URI.parse(uri).fsPath;
  const location = modCache.locationForDirectory(path.dirname(fsPath));
  const index = location ? modCache.indexFor(location.layers) : undefined;
  const diagnostics =
    location && index ? duplicateDiagnosticsFor(index, path.relative(location.root, fsPath).replace(/\\/g, '/')) : [];
  publishFromDisk(uri, fsPath, diagnostics);
}

function scheduleValidation(uri: string): void {
  cancelValidation(uri);
  if (config.validationDelayMs === 0) {
    validateByUri(uri);
    return;
  }
  validationTimers.set(
    uri,
    setTimeout(() => {
      validationTimers.delete(uri);
      validateByUri(uri);
    }, config.validationDelayMs),
  );
}

function cancelValidation(uri: string): void {
  const timer = validationTimers.get(uri);
  if (timer) {
    clearTimeout(timer);
    validationTimers.delete(uri);
  }
}

function validateByUri(uri: string): void {
  const document = documents.get(uri);
  if (document) {
    validate(document);
  }
}

function validateAllOpen(): void {
  validateDocuments(documents.all().map((document) => document.uri));
}

function validateDocuments(uris: readonly string[]): void {
  for (const uri of uris) {
    cancelValidation(uri);
    validateByUri(uri);
  }
}

function validate(document: TextDocument): void {
  if (!config.validationEnabled) {
    void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }
  // Classify by the mod-root-relative path: absolute paths may carry unrelated
  // folder names (e.g. Steam's `steamapps/common/`) that break classification.
  const modContext = contextForUri(document.uri);
  trackRootless(document.uri, modContext);
  const fileType = classifyFile(modContext?.relativePath ?? document.uri);
  const findings = validateFileText(
    document.getText(),
    fileType,
    modContext?.index,
    modContext?.relativePath,
    validationOptions(),
  );
  void connection.sendDiagnostics({ uri: document.uri, diagnostics: toLspDiagnostics(findings, document) });
}

function trackRootless(uri: string, modContext: ModContext | undefined): void {
  if (modContext) {
    rootlessDocumentUris.delete(uri);
  } else {
    rootlessDocumentUris.add(uri);
  }
}

// --- Hover and definition ----------------------------------------------------------

function contextForUri(uri: string): ModContext | undefined {
  return modCache.contextFor(URI.parse(uri).fsPath);
}

/**
 * The tokens of an open document. Hover asks three questions of the same text
 * and completion a fourth, so they share one analysis, and a second request
 * against an unedited document reuses it rather than lexing again.
 */
function analysisOf(document: TextDocument): AnalyzedDocument {
  return documentAnalyses.of(document.uri, document.version, document.getText());
}

connection.onDefinition((params): Location | undefined => {
  const document = documents.get(params.textDocument.uri);
  const modContext = document ? contextForUri(document.uri) : undefined;
  if (!document || !modContext?.index) {
    return undefined;
  }
  const resolved = resolveLocKeyAt(analysisOf(document), document.offsetAt(params.position), modContext.index);
  if (!resolved) {
    return undefined;
  }
  const { definition } = resolved;
  const absolutePath = resolveLayeredFile(modContext.layers, layerFileSystem, definition.filePath);
  if (absolutePath === undefined) {
    return undefined;
  }
  return {
    uri: URI.file(absolutePath).toString(),
    range: {
      start: { line: definition.line, character: 0 },
      end: { line: definition.line, character: definition.length },
    },
  };
});

function pictureHoverFor(
  analysis: AnalyzedDocument,
  offset: number,
  modContext: ModContext,
): PictureHover | undefined {
  return pictureHoverAt(analysis, offset, classifyFile(modContext.relativePath), (relativePath) => {
    const absolutePath = resolveLayeredFile(modContext.layers, layerFileSystem, relativePath);
    return absolutePath === undefined ? undefined : cachedPictureMarkdown(absolutePath, relativePath);
  });
}

/** Decoding a `.dds` is slow, so rendered previews (and misses) are kept per absolute path. */
function cachedPictureMarkdown(absolutePath: string, relativePath: string): string | undefined {
  if (!pictureCache.has(absolutePath)) {
    const bytes = readModFileBytes(absolutePath);
    pictureCache.set(absolutePath, bytes ? pictureHoverMarkdown(bytes, relativePath, relativePath) : undefined);
  }
  return pictureCache.get(absolutePath);
}

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  const modContext = document ? contextForUri(document.uri) : undefined;
  if (!document || !modContext?.index) {
    return null;
  }
  const offset = document.offsetAt(params.position);
  const analysis = analysisOf(document);

  const key = resolveKeyAt(analysis, offset);
  if (key) {
    const markdown = symbolHoverMarkdown(key.name);
    return markdown === undefined ? null : hoverResult(document, markdown, key.tokenRange);
  }

  const picture = pictureHoverFor(analysis, offset, modContext);
  if (picture) {
    return hoverResult(document, picture.markdown, picture.tokenRange);
  }

  const resolved = resolveLocKeyAt(analysis, offset, modContext.index);
  if (!resolved) {
    return null;
  }
  return hoverResult(document, locKeyHoverMarkdown(resolved), resolved.tokenRange);
});

function hoverResult(
  document: TextDocument,
  markdown: string,
  tokenRange: { start: number; end: number },
): { contents: { kind: 'markdown'; value: string }; range: { start: Position; end: Position } } {
  return {
    contents: { kind: 'markdown', value: markdown },
    range: {
      start: document.positionAt(tokenRange.start),
      end: document.positionAt(tokenRange.end),
    },
  };
}

const COMPLETION_ITEM_KINDS: Readonly<Record<CompletionKind, CompletionItemKind>> = {
  value: CompletionItemKind.Value,
  trigger: CompletionItemKind.Function,
  effect: CompletionItemKind.Function,
  scope: CompletionItemKind.Module,
  field: CompletionItemKind.Property,
};

connection.onCompletion((params): CompletionList | null => {
  const document = documents.get(params.textDocument.uri);
  const modContext = document ? contextForUri(document.uri) : undefined;
  if (!document || !modContext?.index) {
    return null;
  }
  const result = completionsAt(
    analysisOf(document),
    document.offsetAt(params.position),
    classifyFile(modContext.relativePath),
    modContext.index,
  );
  if (!result) {
    return null;
  }
  const range: LspRange = {
    start: document.positionAt(result.range.start),
    end: document.positionAt(result.range.end),
  };
  return {
    isIncomplete: result.incomplete,
    items: result.entries.map((entry) => completionItem(entry, range)),
  };
});

function completionItem(entry: CompletionEntry, range: LspRange): CompletionItem {
  return {
    label: entry.label,
    kind: COMPLETION_ITEM_KINDS[entry.kind],
    detail: entry.detail,
    ...(entry.documentation === undefined
      ? {}
      : { documentation: { kind: MarkupKind.Markdown, value: entry.documentation } }),
    textEdit: { range, newText: entry.insertText },
    insertTextFormat: entry.snippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
  };
}

// --- Reports and Enforce Colormaps -------------------------------------------------

/** `targets` stays a call, not a value: the picked mods change while the server runs. */
const modStack: ModStackHost = {
  targets: (params: TargetParams): FileLocation[] =>
    reportTargets(layout, params, workspaceFolders, LAYER_OPTIONS, (folder) =>
      modCache.locationForDirectory(folder),
    ),
  fileExists,
  readText: readTextAsync,
  readBytes: readModFileBytesAsync,
};

const fullReportHost: FullReportHost = {
  ...modStack,
  ensureIndex: (layers: ModLayers): Promise<ModIndex | undefined> => modCache.ensureIndex(layers),
  listFilesRecursive,
  fileUri: (absolutePath: string): string => URI.file(absolutePath).toString(),
  fileSystem: layerFileSystem,
  descriptorOf: (root: string): ModDescriptor | undefined => layout.mods.find((mod) => mod.folder === root),
  validationOptions,
};

const mapReportHost: MapReportHost = {
  ...modStack,
  ensureIndex: (layers: ModLayers): Promise<ModIndex | undefined> => modCache.ensureIndex(layers),
  fileSystem: layerFileSystem,
};

const colormapHost: ColormapEnforcementHost = { ...modStack, writeBytes: writeModFileBytes };

onCancellableRequest(FULL_REPORT_REQUEST, async (params: FullReportParams, signal): Promise<FullReportResult> => {
  const started = Date.now();
  const result = await buildFullReport(fullReportHost, params, signal);
  connection.console.log(`Full report over ${String(result.reports.length)} mod(s) in ${String(Date.now() - started)}ms`);
  return result;
});

onCancellableRequest(MAP_REPORT_REQUEST, async (params: MapReportParams, signal): Promise<MapReportResult> => {
  const started = Date.now();
  const result = await buildMapReports(mapReportHost, params, signal);
  connection.console.log(`Map report over ${String(result.reports.length)} mod(s) in ${String(Date.now() - started)}ms`);
  return result;
});

onCancellableRequest(ENFORCE_COLORMAPS_REQUEST, async (params: EnforceColormapsParams, signal): Promise<EnforceColormapsResult> => {
  const result = await enforceColormaps(colormapHost, params, signal);
  connection.console.log(`Enforce colormaps (${params.dryRun ? 'dry run' : 'write'}): ${result.files.map((file) => `${file.path} ${file.outcome}`).join('; ')}`);
  return result;
});

const mapEditor = new MapEditorHandlers({
  targets: modStack.targets,
  modNameOf: (root: string): string => layout.mods.find((mod) => mod.folder === root)?.name ?? path.basename(root),
  ensureIndex: (layers: ModLayers): Promise<ModIndex | undefined> => modCache.ensureIndex(layers),
  fileSystem: layerFileSystem,
  readText: readTextAsync,
  readBytes: readModFileBytesAsync,
  // dist/server.js sits one folder below the extension root, next to assets/.
  assetsFolder: path.join(__dirname, '..', 'assets'),
  writeText: writeText,
  writeBytes: writeModFileBytes,
  rename: renameModFile,
  codepage: (): Codepage => config.encoding,
  historyFolderPattern: provinceFolderPattern,
});

onRequest(MAP_EDITOR_MAP_REQUEST, (params: MapEditorTargetParams): Promise<MapEditorMapResult> => mapEditor.map(params));
onRequest(MAP_EDITOR_PROVINCE_REQUEST, (params: ProvinceRequestParams): Promise<ProvinceResult> => mapEditor.province(params));
onRequest(MAP_EDITOR_POSITIONS_REQUEST, (params: MapEditorTargetParams): Promise<MapPositionsResult> => mapEditor.positions(params));
onRequest(MAP_EDITOR_COUNTRY_COLORS_REQUEST, (params: MapEditorTargetParams): Promise<MapCountryColorsResult> => mapEditor.countryColors(params));
onRequest(MAP_EDITOR_STATE_COLORS_REQUEST, (params: MapEditorTargetParams): Promise<MapStateColorsResult> => mapEditor.stateColors(params));
onRequest(MAP_EDITOR_TERRAIN_PICTURE_REQUEST, (params: TerrainPictureParams): Promise<TerrainPictureResult> => mapEditor.terrainPictureFor(params));
onRequest(MAP_EDITOR_NEW_PROVINCE_REQUEST, (params: NewProvinceParams): Promise<ProvinceResult> => mapEditor.newProvince(params));
onRequest(MAP_EDITOR_THUMBNAILS_REQUEST, (params: MapEditorTargetParams): Promise<MapThumbnails> => mapEditor.thumbnails(params));

onRequest(MAP_EDITOR_PAINT_REQUEST, async (params: PaintParams): Promise<PaintResult> => {
  const result = await mapEditor.paint(params);
  connection.console.log(
    result.ok
      ? `Map editor: ${String(result.pixels)} pixel(s) painted into ${result.path}`
      : `Map editor: the map was not painted: ${result.reason}`,
  );
  return result;
});

onRequest(MAP_EDITOR_SAVE_REQUEST, async (params: SaveParams): Promise<SaveResult> => {
  const result = await mapEditor.save(params);
  connection.console.log(
    result.ok
      ? `Map editor: province ${String(params.provinceId)} ${params.section} saved (${result.written.join(', ') || 'no change'})`
      : `Map editor: province ${String(params.provinceId)} ${params.section} not saved: ${result.reason}`,
  );
  return result;
});

documents.listen(connection);
connection.listen();
