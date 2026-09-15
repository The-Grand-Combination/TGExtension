import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import {
  MAP_EDITOR_COUNTRY_COLORS_REQUEST,
  MAP_EDITOR_MAP_REQUEST,
  MAP_EDITOR_NEW_PROVINCE_REQUEST,
  MAP_EDITOR_PAINT_REQUEST,
  MAP_EDITOR_POSITIONS_REQUEST,
  MAP_EDITOR_PROVINCE_REQUEST,
  MAP_EDITOR_SAVE_REQUEST,
  MAP_EDITOR_TERRAIN_PICTURE_REQUEST,
  MAP_EDITOR_THUMBNAILS_REQUEST,
  type HostMessage,
  type MapEditorMap,
  type MapEditorReveal,
  type MapEditorTargetParams,
  type SaveParams,
} from '../model/mapEditor.js';
import { affectsMapEditorView, readCountryColorsTint, readPaintUndoSteps } from '../config.js';
import { asPageMessage, type PageMessage, type PendingPositions } from '../services/mapEditorMessages.js';
import type { ReferenceLayer } from '../services/referenceLayers.js';
import { mapEditorHtml, mapEditorNoticeHtml } from './mapEditorHtml.js';
import { ReferenceStore } from './referenceStore.js';
import { request } from './request.js';

/**
 * The **Map Editor** tab: `provinces.bmp` drawn on a canvas, and a side panel
 * that edits the clicked province's localisation, history file, pops and map positions. The
 * page fetches the bitmap itself; everything else goes through the server.
 */
export class MapEditorPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private params: MapEditorTargetParams | undefined;
  private map: MapEditorMap | undefined;
  private reveal: MapEditorReveal | undefined;
  /** Provinces the page has edited and not written; kept here so closing the tab can still offer to save them. */
  private pending: readonly PendingPositions[] = [];
  private popDate = '';
  /** Painted pixels the page is holding, so a Reload or a close can say they are there. */
  private paintPixels = 0;
  /** The target mod's reference pictures; set with the map. */
  private references: ReferenceStore | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly getClient: () => LanguageClient | undefined,
    /** The extension's own folder: the page's script is served from `dist/` inside it. */
    private readonly extensionUri: vscode.Uri,
  ) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsMapEditorView(event) && this.panel) {
          this.sendSettings(this.panel);
        }
      }),
    );
  }

  dispose(): void {
    this.panel?.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  /**
   * Show the tab and load the map of these mods, replacing whatever it showed.
   * With a `reveal`, the page centers on that pixel once the bitmap is decoded.
   */
  async open(params: MapEditorTargetParams, reveal?: MapEditorReveal): Promise<void> {
    this.params = params;
    this.reveal = reveal;
    const panel = this.panel ?? this.createPanel();
    panel.reveal();
    await this.load(panel);
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      'victorianTools.mapEditor',
      'Map Editor',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handle(asPageMessage(message));
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.map = undefined;
      this.warnPainted();
      void this.offerPending();
    });
    this.panel = panel;
    return panel;
  }

  private async load(panel: vscode.WebviewPanel): Promise<void> {
    const client = this.getClient();
    if (!client || !this.params) {
      panel.webview.html = mapEditorNoticeHtml('The language server is not running.');
      return;
    }
    // The page starts over, so whatever it was holding starts over with it.
    this.pending = [];
    this.paintPixels = 0;
    panel.webview.html = mapEditorNoticeHtml('Reading the map…');
    const result = await request(client, MAP_EDITOR_MAP_REQUEST, this.params);
    if (result.kind === 'unavailable') {
      panel.webview.html = mapEditorNoticeHtml(result.reason);
      return;
    }
    this.map = result;
    this.references = new ReferenceStore(result.targetRoot);
    panel.title = `Map Editor: ${result.targetName}`;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [...resourceRootsOf(result), this.references.folder, this.extensionUri],
    };
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'mapEditorPage.js'),
    );
    panel.webview.html = mapEditorHtml(panel.webview.cspSource, scriptUri.toString());
  }

  private async handle(message: PageMessage | undefined): Promise<void> {
    const panel = this.panel;
    const client = this.getClient();
    if (!panel || !client || !message) {
      return;
    }
    if (await this.aside(panel, client, message)) {
      return;
    }
    switch (message.type) {
      case 'ready':
        this.sendSettings(panel);
        this.sendMap(panel);
        await this.sendPositions(panel, client);
        await this.sendCountryColors(panel, client);
        await this.sendReferences(panel);
        await this.sendThumbnails(panel, client);
        return;
      case 'reload':
        if (await this.keepPainted()) {
          return;
        }
        await this.load(panel);
        return;
      case 'select':
        this.popDate = message.popDate;
        await this.select(panel, client, message.provinceId, message.popDate);
        return;
      case 'newProvince':
        this.popDate = message.popDate;
        await this.newProvince(panel, client, message.color, message.popDate);
        return;
      case 'paint':
        await this.paint(panel, client, message.runs);
        return;
      case 'saveAll':
        await this.saveAll(panel, client);
        return;
      case 'save':
        await this.save(panel, client, message.params);
        return;
      case 'openFile':
        await openFileAt(message.absolutePath, message.line);
        return;
      case 'terrainPicture':
        await this.terrainPicture(panel, client, message.terrain);
        return;
    }
  }

  /** Everything that is not a request to the server: notes the page leaves, and the reference pictures. */
  private async aside(panel: vscode.WebviewPanel, client: LanguageClient, message: PageMessage): Promise<boolean> {
    return this.note(client, message) || this.handleReferences(panel, message);
  }

  /** What the page only tells the extension about: its log, and what it is holding. */
  private note(client: LanguageClient, message: PageMessage): boolean {
    switch (message.type) {
      case 'log':
        client.outputChannel.appendLine(`Map editor page: ${message.message}`);
        return true;
      case 'pending':
        this.pending = message.edits;
        return true;
      case 'paintPending':
        this.paintPixels = message.pixels;
        return true;
      default:
        return false;
    }
  }

  /** The reference pictures: dropped in, moved, removed. Each answer is the whole list, which the page redraws from. */
  private async handleReferences(panel: vscode.WebviewPanel, message: PageMessage): Promise<boolean> {
    const store = this.references;
    if (!store) {
      return false;
    }
    switch (message.type) {
      case 'addReference':
        this.postReferences(panel, await store.add(message.name, Buffer.from(message.bytes, 'base64'), message.x, message.y));
        return true;
      case 'addReferencePath':
        await this.addReferenceFiles(panel, store, [vscode.Uri.parse(message.uri)], message.x, message.y);
        return true;
      case 'pickReference': {
        // Dropping a file on the tab is taken by VS Code itself, which opens the
        // file in an editor before the page ever sees it: the picker is the way in.
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: 'Add reference',
          filters: { Pictures: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        });
        await this.addReferenceFiles(panel, store, picked ?? [], message.x, message.y);
        return true;
      }
      case 'references':
        await store.write(message.layers);
        return true;
      case 'removeReference':
        this.postReferences(panel, await store.remove(message.file));
        return true;
      default:
        return false;
    }
  }

  /** Each picture copied in and placed at the same point; the page spreads none of them, the modder does. */
  private async addReferenceFiles(panel: vscode.WebviewPanel, store: ReferenceStore, files: readonly vscode.Uri[], x: number, y: number): Promise<void> {
    let layers: readonly ReferenceLayer[] | undefined;
    for (const file of files) {
      const bytes = await vscode.workspace.fs.readFile(file);
      layers = await store.add(path.basename(file.fsPath), bytes, x, y);
    }
    if (layers) {
      this.postReferences(panel, layers);
    }
  }

  private async sendReferences(panel: vscode.WebviewPanel): Promise<void> {
    if (this.references) {
      this.postReferences(panel, await this.references.read());
    }
  }

  private postReferences(panel: vscode.WebviewPanel, layers: readonly ReferenceLayer[]): void {
    if (this.references) {
      post(panel, { type: 'references', folderUri: panel.webview.asWebviewUri(this.references.folder).toString(), layers });
    }
  }

  /** The Layers box pictures, asked last: the three bitmaps are read whole on the server, and the map is already up. */
  private async sendThumbnails(panel: vscode.WebviewPanel, client: LanguageClient): Promise<void> {
    if (!this.params || !this.map) {
      return;
    }
    const thumbnails = await request(client, MAP_EDITOR_THUMBNAILS_REQUEST, this.params);
    post(panel, { type: 'thumbnails', ...thumbnails });
  }

  private async terrainPicture(panel: vscode.WebviewPanel, client: LanguageClient, terrain: string): Promise<void> {
    if (!this.params) {
      return;
    }
    const result = await request(client, MAP_EDITOR_TERRAIN_PICTURE_REQUEST, {
      ...this.params,
      terrain,
    });
    post(panel, { type: 'terrainPicture', ...result });
  }

  /** The map's position markers follow the map itself, so the bitmap is drawn while the 130k-line file is parsed. */
  private async sendPositions(panel: vscode.WebviewPanel, client: LanguageClient): Promise<void> {
    if (!this.params || !this.map) {
      return;
    }
    const result = await request(client, MAP_EDITOR_POSITIONS_REQUEST, this.params);
    if (result.kind === 'ready') {
      post(panel, { type: 'positions', markers: result.markers });
    } else {
      client.outputChannel.appendLine(`Map editor: ${result.reason}`);
    }
  }

  /** Owners and country colours for the Country Colors layer; asked after the markers, and again after a history save. */
  private async sendCountryColors(panel: vscode.WebviewPanel, client: LanguageClient): Promise<void> {
    if (!this.params || !this.map) {
      return;
    }
    const result = await request(client, MAP_EDITOR_COUNTRY_COLORS_REQUEST, this.params);
    if (result.kind === 'ready') {
      post(panel, { type: 'countryColors', owners: result.owners, colors: result.colors });
    } else {
      client.outputChannel.appendLine(`Map editor: ${result.reason}`);
    }
  }

  /** The viewing preferences the page applies, sent before the map and whenever they change. */
  private sendSettings(panel: vscode.WebviewPanel): void {
    post(panel, { type: 'settings', countryColorsTint: readCountryColorsTint(), paintUndoSteps: readPaintUndoSteps() });
  }

  /** Write the painted pixels into the target mod's map/provinces.bmp. */
  private async paint(panel: vscode.WebviewPanel, client: LanguageClient, runs: readonly number[]): Promise<void> {
    if (!this.params) {
      return;
    }
    const result = await request(client, MAP_EDITOR_PAINT_REQUEST, { ...this.params, runs });
    if (result.ok) {
      this.paintPixels = 0;
    } else {
      void vscode.window.showErrorMessage(`Victorian Tools: ${result.reason}`);
    }
    post(panel, { type: 'painted', result });
  }

  /** True when the user calls a reload off rather than lose the pixels the page is holding. */
  private async keepPainted(): Promise<boolean> {
    if (this.paintPixels === 0) {
      return false;
    }
    const reload = 'Reload anyway';
    const answer = await vscode.window.showWarningMessage(
      `${String(this.paintPixels)} painted pixel(s) have not been written to map/provinces.bmp. Reloading drops them.`,
      { modal: true },
      reload,
    );
    return answer !== reload;
  }

  /** A closed tab takes its painted pixels with it: there is nothing left to write them from. */
  private warnPainted(): void {
    if (this.paintPixels > 0) {
      void vscode.window.showWarningMessage(
        `Victorian Tools: the Map Editor closed with ${String(this.paintPixels)} painted pixel(s) that were never written to map/provinces.bmp.`,
      );
      this.paintPixels = 0;
    }
  }

  private sendMap(panel: vscode.WebviewPanel): void {
    if (!this.map) {
      return;
    }
    const bmpUri = panel.webview.asWebviewUri(vscode.Uri.file(this.map.provincesBmpPath)).toString();
    const uriOf = (file: string | undefined): string | undefined =>
      file === undefined ? undefined : panel.webview.asWebviewUri(vscode.Uri.file(file)).toString();
    post(panel, { type: 'map', map: this.map, bmpUri, riversUri: uriOf(this.map.riversBmpPath), terrainUri: uriOf(this.map.terrainBmpPath) });
    if (this.reveal) {
      post(panel, { type: 'revealPixel', ...this.reveal });
      this.reveal = undefined;
    }
  }

  private async select(
    panel: vscode.WebviewPanel,
    client: LanguageClient,
    provinceId: number,
    popDate: string,
  ): Promise<void> {
    if (!this.params) {
      return;
    }
    const result = await request(client, MAP_EDITOR_PROVINCE_REQUEST, {
      ...this.params,
      provinceId,
      popDate,
    });
    if (result.kind === 'details') {
      post(panel, { type: 'details', details: result.details });
    } else {
      post(panel, { type: 'error', message: result.reason });
    }
  }

  /**
   * Creating a province writes files that did not exist, in three places at
   * once, so the modal names every one of them first. The list comes from the
   * save itself, run with nothing written.
   */
  private async confirmCreate(client: LanguageClient, params: SaveParams): Promise<boolean> {
    const plan = await request(client, MAP_EDITOR_SAVE_REQUEST, { ...params, dryRun: true });
    if (!plan.ok) {
      void vscode.window.showErrorMessage(`Victorian Tools: ${plan.reason}`);
      return false;
    }
    const create = 'Create';
    const answer = await vscode.window.showWarningMessage(
      `Create province ${String(params.provinceId)}?`,
      { modal: true, detail: `This writes:\n${listFiles(this.map?.targetRoot ?? '', plan.written)}` },
      create,
    );
    return answer === create;
  }

  /** The panel for a colour that is painted and not yet a province of definition.csv. */
  private async newProvince(
    panel: vscode.WebviewPanel,
    client: LanguageClient,
    color: number,
    popDate: string,
  ): Promise<void> {
    if (!this.params) {
      return;
    }
    const result = await request(client, MAP_EDITOR_NEW_PROVINCE_REQUEST, { ...this.params, color, popDate });
    if (result.kind === 'details') {
      post(panel, { type: 'details', details: result.details });
    } else {
      post(panel, { type: 'error', message: result.reason });
    }
  }

  /** Write every province the page is still holding, in one go. */
  private async saveAll(panel: vscode.WebviewPanel, client: LanguageClient): Promise<void> {
    const result = await this.writePending(client);
    post(panel, { type: 'savedAll', written: result.written, failed: result.failed });
    const first = result.failed[0];
    if (first) {
      void vscode.window.showErrorMessage(`Victorian Tools: province ${String(first.provinceId)} was not saved: ${first.reason}`);
    }
  }

  /**
   * A webview cannot refuse to close, so the tab goes and the points edited in
   * it are offered here instead of being dropped without a word.
   */
  private async offerPending(): Promise<void> {
    const client = this.getClient();
    if (this.pending.length === 0 || !client) {
      return;
    }
    const save = 'Save them';
    const answer = await vscode.window.showWarningMessage(
      `The Map Editor closed with map positions edited in ${String(this.pending.length)} province(s) and not saved.`,
      { modal: true },
      save,
      'Discard',
    );
    if (answer !== save) {
      this.pending = [];
      return;
    }
    const result = await this.writePending(client);
    const first = result.failed[0];
    void (first
      ? vscode.window.showErrorMessage(`Victorian Tools: province ${String(first.provinceId)} was not saved: ${first.reason}`)
      : vscode.window.showInformationMessage(`Victorian Tools: saved the positions of ${String(result.written.length)} province(s).`));
  }

  /** Save the held provinces one by one; the ones that fail stay held. */
  private async writePending(
    client: LanguageClient,
  ): Promise<{ written: number[]; failed: { provinceId: number; reason: string }[] }> {
    const target = this.params;
    const written: number[] = [];
    const failed: { provinceId: number; reason: string }[] = [];
    if (!target) {
      return { written, failed };
    }
    for (const edit of this.pending) {
      const params: SaveParams = {
        ...target,
        provinceId: edit.provinceId,
        popDate: this.popDate,
        section: 'positions',
        data: edit.data,
      };
      const result = await request(client, MAP_EDITOR_SAVE_REQUEST, params);
      if (result.ok) {
        written.push(edit.provinceId);
      } else {
        failed.push({ provinceId: edit.provinceId, reason: result.reason });
      }
    }
    this.pending = this.pending.filter((edit) => failed.some((one) => one.provinceId === edit.provinceId));
    return { written, failed };
  }

  private async save(panel: vscode.WebviewPanel, client: LanguageClient, params: SaveParams): Promise<void> {
    if (!this.params) {
      return;
    }
    if (params.create && !(await this.confirmCreate(client, { ...params, ...this.params }))) {
      post(panel, { type: 'saved', result: { ok: false, reason: 'Nothing was written.' } });
      return;
    }
    const result = await request(client, MAP_EDITOR_SAVE_REQUEST, { ...params, ...this.params });
    post(panel, { type: 'saved', result });
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Victorian Tools: ${result.reason}`);
    } else if (params.section === 'history' && result.written.length > 0) {
      await this.sendCountryColors(panel, client);
    }
  }
}

/** The files a save would write, as the modal lists them: inside the target mod, by their path there. */
function listFiles(root: string, files: readonly string[]): string {
  return files.map((file) => (file.startsWith(root) ? file.slice(root.length).replace(/^[\\/]/, '') : file)).join('\n');
}

/** Every message to the page goes through the shared union, so a drifting payload fails to compile. */
function post(panel: vscode.WebviewPanel, message: HostMessage): void {
  void panel.webview.postMessage(message);
}

/** The map folders the page may fetch bitmaps from: rivers.bmp and terrain.bmp can come from a lower layer than provinces.bmp. */
function resourceRootsOf(map: MapEditorMap): vscode.Uri[] {
  const folders = new Set([path.dirname(map.provincesBmpPath)]);
  for (const file of [map.riversBmpPath, map.terrainBmpPath]) {
    if (file !== undefined) {
      folders.add(path.dirname(file));
    }
  }
  return [...folders].map((folder) => vscode.Uri.file(folder));
}

async function openFileAt(absolutePath: string, line: number): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
  const position = new vscode.Position(Math.min(line, document.lineCount - 1), 0);
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: false,
    selection: new vscode.Range(position, position),
  });
}
