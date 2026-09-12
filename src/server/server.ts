import * as path from 'node:path';
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type Position,
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
import {
  ENFORCE_COLORMAPS_REQUEST,
  type ColormapFileResult,
  type EnforceColormapsParams,
  type EnforceColormapsResult,
} from '../model/colormaps.js';
import type { Diagnostic } from '../model/diagnostic.js';
import { classifyFile } from '../model/fileType.js';
import {
  FULL_REPORT_REQUEST,
  type FullReportParams,
  type FullReportResult,
  type ModReport,
} from '../model/fullReport.js';
import {
  MAP_EDITOR_COUNTRY_COLORS_REQUEST,
  MAP_EDITOR_MAP_REQUEST,
  MAP_EDITOR_POSITIONS_REQUEST,
  MAP_EDITOR_PROVINCE_REQUEST,
  MAP_EDITOR_SAVE_REQUEST,
  MAP_EDITOR_TERRAIN_PICTURE_REQUEST,
  type MapCountryColorsResult,
  type MapEditorMapResult,
  type MapEditorTargetParams,
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
  type MapReport,
  type MapReportParams,
  type MapReportResult,
} from '../model/mapAudit.js';
import type { ModIndex } from '../model/modIndex.js';
import { duplicateDiagnosticsByFile, duplicateDiagnosticsFor } from '../services/duplicateDiagnostics.js';
import { validateFileText } from '../services/fileValidation.js';
import { compilePattern, NULL_TAG_FLAGS, type ValidationOptions } from '../model/validationOptions.js';
import type { Palette } from '../data/mapPalettes.js';
import { COLORMAP_FILES, planColormapFix } from '../services/colormapEnforcement.js';
import { buildModReport, type ReportFileProvider } from '../services/fullReport.js';
import { locKeyHoverMarkdown, resolveLocKeyAt } from '../services/locDefinition.js';
import { auditMapImages, type MapImageSource } from '../services/mapImageAudit.js';
import { buildModIndexAsync } from '../services/modIndex.js';
import {
  layeredIndexProvider,
  layersOf,
  listLayeredFiles,
  resolveLayeredFile,
  type LayerFileSystem,
  type LayerOptions,
  type ModLayers,
} from '../services/modLayers.js';
import {
  detectGameRoot,
  detectModDirectory,
  loadModDescriptors,
  locateFile,
  locateLoneMod,
  mergeDescriptors,
  missingDependencies,
  resolveSelection,
  type FileLocation,
  type ModLayout,
} from '../services/modLayout.js';
import { pictureHoverAt, pictureHoverMarkdown, type PictureHover } from '../services/pictureHover.js';
import { renderMapReportText, renderReportText } from '../services/reportText.js';
import { resolveKeyAt, symbolHoverMarkdown } from '../services/symbolHover.js';
import { BoundedCache } from './boundedCache.js';
import { MapEditorHandlers } from './mapEditorHandlers.js';
import { ModCache, type ModContext } from './modCache.js';
import {
  configEquals,
  DEFAULT_CONFIG,
  fetchServerConfig,
  layoutConfigEquals,
  type ServerConfig,
} from './serverConfig.js';
import { toLspDiagnostics } from './toLspDiagnostic.js';

const connection: Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let config: ServerConfig = DEFAULT_CONFIG;
let compiled = compile(config);

interface CompiledOptions {
  readonly sources: readonly string[];
  readonly options: ValidationOptions;
}

function compile(source: ServerConfig): CompiledOptions {
  return {
    sources: patternSourcesOf(source),
    options: {
      locKeyPattern: compilePattern(source.locKeyPattern),
      flagNamePattern: compilePattern(source.flagNamePattern),
      nullTagPattern: compilePattern(source.nullTagPattern, NULL_TAG_FLAGS),
      ignoreMarker: source.ignoreMarker,
    },
  };
}

function patternSourcesOf(source: ServerConfig): readonly string[] {
  return [source.locKeyPattern, source.flagNamePattern, source.nullTagPattern, source.ignoreMarker];
}

/** The validation options of the current configuration; the regexes are compiled once per change. */
function validationOptions(): ValidationOptions {
  const sources = patternSourcesOf(config);
  if (sources.some((source, position) => source !== compiled.sources[position])) {
    compiled = compile(config);
  }
  return compiled.options;
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

/** Rendered picture hovers, keyed by absolute path; decoding a `.dds` is slow. */
const PICTURE_CACHE_LIMIT = 200;
const pictureCache = new BoundedCache<string, string | undefined>(PICTURE_CACHE_LIMIT);

/** URIs this server published index-time diagnostics to, per layers key. */
const publishedByLayers = new Map<string, Set<string>>();
/** Open documents that resolved to no mod, so a new one can wake them. */
const rootlessDocumentUris = new Set<string>();

const validationTimers = new Map<string, NodeJS.Timeout>();
let pendingWatchedChanges: string[] = [];
let rebuildTimer: NodeJS.Timeout | undefined;

// --- Lifecycle ---------------------------------------------------------------------

let supportsWorkspaceFolders = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  workspaceFolders = folderPathsOf(params);
  supportsWorkspaceFolders = params.capabilities.workspace?.workspaceFolders === true;
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      hoverProvider: true,
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

// --- Configuration and mod layout ---------------------------------------------------

connection.onDidChangeConfiguration(() => {
  void refreshConfiguration().then((change) => {
    if (change === 'layout') {
      applyLayout();
    } else if (change === 'other') {
      validateAllOpen();
    }
  });
});

async function refreshConfiguration(): Promise<'none' | 'other' | 'layout'> {
  const next = await fetchServerConfig(connection);
  if (configEquals(config, next)) {
    return 'none';
  }
  const layoutChanged = !layoutConfigEquals(config, next);
  config = next;
  return layoutChanged ? 'layout' : 'other';
}

/** Re-read the install and the selection, then index and revalidate with the new layers. */
function applyLayout(): void {
  layout = loadLayout();
  logLayout();
  modCache.resetLocations();
  mapEditor.invalidate();
  warmIndexes();
  validateAllOpen();
  void connection.sendNotification(LAYOUT_CHANGED_NOTIFICATION);
}

/**
 * The install's `mod/` plus every mod directory a workspace folder sits in (a
 * checkout laid out like `mod/`). A checkout shadows the installed copy of the
 * same name: that is the one being edited.
 */
function loadLayout(): ModLayout {
  const gameRoot = findGameRoot();
  const fileSystem = { listFiles, readFile: readModFile };
  const installedDirectory = gameRoot === undefined ? undefined : path.join(gameRoot, 'mod');
  const installed = installedDirectory === undefined ? [] : loadModDescriptors(installedDirectory, fileSystem);
  const checkedOut: ModDescriptor[] = [];
  for (const directory of externalModDirectories(installedDirectory)) {
    checkedOut.push(...loadModDescriptors(directory, fileSystem));
  }
  const mods = mergeDescriptors(checkedOut, installed);
  return { gameRoot, mods, selection: resolveSelection(mods, config.activeMods) };
}

function externalModDirectories(installedDirectory: string | undefined): string[] {
  const found = new Set<string>();
  for (const folder of workspaceFolders) {
    const directory = detectModDirectory(folder, listFiles);
    if (directory !== undefined && !samePath(directory, installedDirectory)) {
      found.add(directory);
    }
  }
  return [...found];
}

function samePath(left: string, right: string | undefined): boolean {
  if (right === undefined) {
    return false;
  }
  const [a, b] = [path.resolve(left), path.resolve(right)];
  return LAYER_OPTIONS.caseInsensitivePaths === true ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** The configured install folder when it holds a `mod/` folder, else the one above the workspace. */
function findGameRoot(): string | undefined {
  if (config.gamePath !== '') {
    const configured = path.resolve(config.gamePath);
    if (isDirectory(path.join(configured, 'mod'))) {
      return configured;
    }
    connection.console.warn(`victorianTools.gamePath has no mod/ folder: ${configured}`);
  }
  for (const folder of workspaceFolders) {
    const detected = detectGameRoot(folder, isDirectory);
    if (detected !== undefined) {
      return detected;
    }
  }
  return undefined;
}

function logLayout(): void {
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
  return layout.selection.length > 0 ? layersOf(layout.gameRoot, layout.selection, LAYER_OPTIONS) : undefined;
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

connection.onRequest(
  MODS_REQUEST,
  (): ModsResult => ({ gameRoot: layout.gameRoot, mods: layout.mods }),
);

// --- Index building ----------------------------------------------------------------

async function buildIndexFor(layers: ModLayers): Promise<ModIndex> {
  const started = Date.now();
  const index = await buildModIndexAsync(layeredIndexProvider(layers, layerFileSystem, readModFile));
  connection.console.log(`Indexed ${describeLayers(layers)} in ${String(Date.now() - started)}ms`);
  if (listLayeredFiles(layers, layerFileSystem, 'events', '.txt').length === 0) {
    connection.console.log(`No events/ files in ${describeLayers(layers)}`);
  }
  return index;
}

function describeLayers(layers: ModLayers): string {
  return layers.roots.length === 1 ? (layers.roots[0] ?? '') : layers.roots.slice(1).join(' > ');
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
  const text = readModFile(absolutePath);
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
  mapEditor.invalidate();
  if (changed.some((fsPath) => fsPath.toLowerCase().endsWith('.mod'))) {
    applyLayout();
    return;
  }
  const affected = modCache.layersContaining(changed);
  modCache.refresh(affected);
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
  rootlessDocumentUris.delete(event.document.uri);
  publishClosedDocument(event.document.uri);
});

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

connection.onDefinition((params): Location | undefined => {
  const document = documents.get(params.textDocument.uri);
  const modContext = document ? contextForUri(document.uri) : undefined;
  if (!document || !modContext?.index) {
    return undefined;
  }
  const resolved = resolveLocKeyAt(document.getText(), document.offsetAt(params.position), modContext.index);
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

function pictureHoverFor(document: TextDocument, offset: number, modContext: ModContext): PictureHover | undefined {
  return pictureHoverAt(document.getText(), offset, classifyFile(modContext.relativePath), (relativePath) => {
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

  const key = resolveKeyAt(document.getText(), offset);
  if (key) {
    const markdown = symbolHoverMarkdown(key.name);
    return markdown === undefined ? null : hoverResult(document, markdown, key.tokenRange);
  }

  const picture = pictureHoverFor(document, offset, modContext);
  if (picture) {
    return hoverResult(document, picture.markdown, picture.tokenRange);
  }

  const resolved = resolveLocKeyAt(document.getText(), offset, modContext.index);
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

// --- Full report -------------------------------------------------------------------

connection.onRequest(FULL_REPORT_REQUEST, async (params: FullReportParams): Promise<FullReportResult> => {
  const started = Date.now();
  const reports: ModReport[] = [];
  for (const target of reportTargets(params)) {
    const index = await modCache.ensureIndex(target.layers);
    if (index) {
      reports.push(await buildModReport(target.root, reportProviderFor(target.root), index, validationOptions()));
    }
  }
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  connection.console.log(`Full report over ${String(reports.length)} mod(s) in ${String(Date.now() - started)}ms`);
  return { generatedAt, reports, text: renderReportText(reports, generatedAt) };
});

/** The mods a request is about; shared by the full report, the map report and Enforce Colormaps. */
type TargetParams = Pick<FullReportParams, 'workspaceFolders' | 'mods'>;

/**
 * The mods to report on: the ones the request names, each over the game and
 * its dependencies (one stack for all of them); else the mods set in Settings,
 * each over the whole selection; else the mod each workspace folder belongs to.
 */
function reportTargets(params: TargetParams): FileLocation[] {
  if (params.mods.length > 0) {
    const stack = resolveSelection(layout.mods, params.mods);
    const layers = layersOf(layout.gameRoot, stack, LAYER_OPTIONS);
    return stack.filter((mod) => params.mods.includes(mod.name)).map((mod) => ({ root: mod.folder, layers }));
  }
  const selection = selectionLayers();
  if (selection) {
    return layout.selection.map((mod) => ({ root: mod.folder, layers: selection }));
  }
  const byRoot = new Map<string, FileLocation>();
  const folders = params.workspaceFolders.length > 0 ? params.workspaceFolders : workspaceFolders;
  for (const folder of folders) {
    const location = modCache.locationForDirectory(folder);
    if (location) {
      byRoot.set(location.root, location);
    }
  }
  return [...byRoot.keys()].sort().flatMap((root) => {
    const location = byRoot.get(root);
    return location ? [location] : [];
  });
}

/** A mod's own files: the report covers what the modder maintains, read with the stack's index. */
function reportProviderFor(root: string): ReportFileProvider {
  return {
    readFile: (relativePath: string): Promise<string | undefined> => readModFileAsync(path.join(root, relativePath)),
    listFilesRecursive: (relativeFolder: string): string[] => listFilesRecursive(root, relativeFolder),
    fileUri: (relativePath: string): string => URI.file(path.join(root, relativePath)).toString(),
  };
}

// --- Map report --------------------------------------------------------------------

connection.onRequest(MAP_REPORT_REQUEST, async (params: MapReportParams): Promise<MapReportResult> => {
  const started = Date.now();
  const reports: MapReport[] = [];
  for (const target of reportTargets(params)) {
    reports.push(await buildMapReport(target));
  }
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  connection.console.log(`Map report over ${String(reports.length)} mod(s) in ${String(Date.now() - started)}ms`);
  return { generatedAt, reports, text: renderMapReportText(reports, generatedAt) };
});

async function buildMapReport(target: FileLocation): Promise<MapReport> {
  const source = mapSourceFor(target);
  const index = source ? await modCache.ensureIndex(target.layers) : undefined;
  if (!source || !index) {
    return { root: target.root, audited: false, errorCount: 0, warningCount: 0, findings: [] };
  }
  const findings = await auditMapImages(source, index);
  return {
    root: target.root,
    audited: true,
    errorCount: findings.filter((finding) => finding.severity === 'error').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    findings,
  };
}

/** The map files whose presence in a mod's own folder makes it a map report target. */
const MAP_OWNER_FILES: readonly string[] = [
  'map/provinces.bmp',
  'map/terrain.bmp',
  'map/rivers.bmp',
  'map/definition.csv',
  'map/default.map',
  'map/terrain.txt',
];

/**
 * The map as the game would load it for this mod, read through the stack;
 * undefined for a mod that ships no map file of its own, so a submod does not
 * repeat its base mod's map findings.
 */
function mapSourceFor(target: FileLocation): MapImageSource | undefined {
  if (!MAP_OWNER_FILES.some((relativePath) => fileExists(path.join(target.root, relativePath)))) {
    return undefined;
  }
  const resolve = (relativePath: string): string | undefined =>
    resolveLayeredFile(target.layers, layerFileSystem, relativePath);
  return {
    readText: async (relativePath): Promise<string | undefined> => {
      const absolutePath = resolve(relativePath);
      return absolutePath === undefined ? undefined : readModFileAsync(absolutePath);
    },
    readBytes: async (relativePath): Promise<Uint8Array | undefined> => {
      const absolutePath = resolve(relativePath);
      return absolutePath === undefined ? undefined : readModFileBytesAsync(absolutePath);
    },
  };
}

// --- Enforce Colormaps -------------------------------------------------------------

connection.onRequest(ENFORCE_COLORMAPS_REQUEST, async (params: EnforceColormapsParams): Promise<EnforceColormapsResult> => {
  const files: ColormapFileResult[] = [];
  for (const target of reportTargets(params)) {
    for (const file of COLORMAP_FILES) {
      const absolutePath = path.join(target.root, file.relativePath);
      if (!fileExists(absolutePath)) {
        continue;
      }
      files.push(await enforceColormap(absolutePath, file.palette, params.dryRun));
    }
  }
  connection.console.log(`Enforce colormaps (${params.dryRun ? 'dry run' : 'write'}): ${files.map((file) => `${file.path} ${file.outcome}`).join('; ')}`);
  return { files };
});

/** Only a mod's own bitmap is rewritten, never a file of a layer below it. */
async function enforceColormap(absolutePath: string, palette: Palette, dryRun: boolean): Promise<ColormapFileResult> {
  const plan = planColormapFix(await readModFileBytesAsync(absolutePath), palette);
  if (plan.outcome !== 'fixable') {
    return { path: absolutePath, outcome: plan.outcome };
  }
  const counts = { remappedPixels: plan.remappedPixels, approximatedColors: plan.approximatedColors };
  if (dryRun) {
    return { path: absolutePath, outcome: 'fixable', ...counts };
  }
  const written = await writeModFileBytes(absolutePath, plan.fixed);
  return { path: absolutePath, outcome: written ? 'fixed' : 'write-failed', ...counts };
}

// --- Map Editor --------------------------------------------------------------------

const mapEditor = new MapEditorHandlers({
  targets: (params: MapEditorTargetParams): FileLocation[] => reportTargets(params),
  modNameOf: (root: string): string => layout.mods.find((mod) => mod.folder === root)?.name ?? path.basename(root),
  ensureIndex: (layers: ModLayers): Promise<ModIndex | undefined> => modCache.ensureIndex(layers),
  fileSystem: layerFileSystem,
  readText: readModFileAsync,
  readBytes: readModFileBytesAsync,
  // dist/server.js sits one folder below the extension root, next to assets/.
  assetsFolder: path.join(__dirname, '..', 'assets'),
  writeText: writeModFileText,
  rename: renameModFile,
});

connection.onRequest(MAP_EDITOR_MAP_REQUEST, (params: MapEditorTargetParams): Promise<MapEditorMapResult> => mapEditor.map(params));
connection.onRequest(MAP_EDITOR_PROVINCE_REQUEST, (params: ProvinceRequestParams): Promise<ProvinceResult> => mapEditor.province(params));
connection.onRequest(MAP_EDITOR_POSITIONS_REQUEST, (params: MapEditorTargetParams): Promise<MapPositionsResult> => mapEditor.positions(params));
connection.onRequest(MAP_EDITOR_COUNTRY_COLORS_REQUEST, (params: MapEditorTargetParams): Promise<MapCountryColorsResult> => mapEditor.countryColors(params));
connection.onRequest(MAP_EDITOR_TERRAIN_PICTURE_REQUEST, (params: TerrainPictureParams): Promise<TerrainPictureResult> => mapEditor.terrainPictureFor(params));
connection.onRequest(MAP_EDITOR_SAVE_REQUEST, async (params: SaveParams): Promise<SaveResult> => {
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
