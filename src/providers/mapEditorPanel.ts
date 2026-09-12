import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import {
  MAP_EDITOR_COUNTRY_COLORS_REQUEST,
  MAP_EDITOR_MAP_REQUEST,
  MAP_EDITOR_POSITIONS_REQUEST,
  MAP_EDITOR_PROVINCE_REQUEST,
  MAP_EDITOR_SAVE_REQUEST,
  MAP_EDITOR_TERRAIN_PICTURE_REQUEST,
  type HostMessage,
  type MapEditorMap,
  type MapEditorReveal,
  type MapEditorTargetParams,
  type SaveParams,
} from '../model/mapEditor.js';
import { affectsCountryColorsTint, readCountryColorsTint } from '../config.js';
import { asPageMessage, type PageMessage, type PendingPositions } from '../services/mapEditorMessages.js';
import { mapEditorHtml, mapEditorNoticeHtml } from './mapEditorHtml.js';
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
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly getClient: () => LanguageClient | undefined,
    /** The extension's own folder: the page's script is served from `dist/` inside it. */
    private readonly extensionUri: vscode.Uri,
  ) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsCountryColorsTint(event) && this.panel) {
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
    panel.webview.html = mapEditorNoticeHtml('Reading the map…');
    const result = await request(client, MAP_EDITOR_MAP_REQUEST, this.params);
    if (result.kind === 'unavailable') {
      panel.webview.html = mapEditorNoticeHtml(result.reason);
      return;
    }
    this.map = result;
    panel.title = `Map Editor: ${result.targetName}`;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [...resourceRootsOf(result), this.extensionUri],
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
    switch (message.type) {
      case 'ready':
        this.sendSettings(panel);
        this.sendMap(panel);
        await this.sendPositions(panel, client);
        await this.sendCountryColors(panel, client);
        return;
      case 'reload':
        await this.load(panel);
        return;
      case 'log':
        client.outputChannel.appendLine(`Map editor page: ${message.message}`);
        return;
      case 'select':
        this.popDate = message.popDate;
        await this.select(panel, client, message.provinceId, message.popDate);
        return;
      case 'pending':
        this.pending = message.edits;
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

  /** The viewing preferences the page applies: the Country Colors tint, sent before the map and whenever it changes. */
  private sendSettings(panel: vscode.WebviewPanel): void {
    post(panel, { type: 'settings', countryColorsTint: readCountryColorsTint() });
  }

  private sendMap(panel: vscode.WebviewPanel): void {
    if (!this.map) {
      return;
    }
    const bmpUri = panel.webview.asWebviewUri(vscode.Uri.file(this.map.provincesBmpPath)).toString();
    const riversUri =
      this.map.riversBmpPath === undefined
        ? undefined
        : panel.webview.asWebviewUri(vscode.Uri.file(this.map.riversBmpPath)).toString();
    post(panel, { type: 'map', map: this.map, bmpUri, riversUri });
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
    const result = await request(client, MAP_EDITOR_SAVE_REQUEST, { ...params, ...this.params });
    post(panel, { type: 'saved', result });
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Victorian Tools: ${result.reason}`);
    } else if (params.section === 'history' && result.written.length > 0) {
      await this.sendCountryColors(panel, client);
    }
  }
}

/** Every message to the page goes through the shared union, so a drifting payload fails to compile. */
function post(panel: vscode.WebviewPanel, message: HostMessage): void {
  void panel.webview.postMessage(message);
}

/** The map folders the page may fetch bitmaps from: rivers.bmp can come from a lower layer than provinces.bmp. */
function resourceRootsOf(map: MapEditorMap): vscode.Uri[] {
  const folders = new Set([path.dirname(map.provincesBmpPath)]);
  if (map.riversBmpPath !== undefined) {
    folders.add(path.dirname(map.riversBmpPath));
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
