import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import {
  MAP_EDITOR_MAP_REQUEST,
  MAP_EDITOR_PROVINCE_REQUEST,
  MAP_EDITOR_SAVE_REQUEST,
  MAP_EDITOR_TERRAIN_PICTURE_REQUEST,
  type MapEditorMap,
  type MapEditorMapResult,
  type MapEditorReveal,
  type MapEditorTargetParams,
  type ProvinceResult,
  type SaveParams,
  type SaveResult,
  type TerrainPictureResult,
} from '../model/mapEditor.js';
import { asPageMessage, type PageMessage } from './mapEditorMessages.js';
import { mapEditorHtml, mapEditorNoticeHtml } from './mapEditorHtml.js';

/**
 * The **Map Editor** tab: `provinces.bmp` drawn on a canvas, and a side panel
 * that edits the clicked province's localisation, history file and pops. The
 * page fetches the bitmap itself; everything else goes through the server.
 */
export class MapEditorPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private params: MapEditorTargetParams | undefined;
  private map: MapEditorMap | undefined;
  private reveal: MapEditorReveal | undefined;

  constructor(private readonly getClient: () => LanguageClient | undefined) {}

  dispose(): void {
    this.panel?.dispose();
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
    panel.webview.html = mapEditorNoticeHtml('Reading the map…');
    const result = await client.sendRequest<MapEditorMapResult>(MAP_EDITOR_MAP_REQUEST, this.params);
    if (result.kind === 'unavailable') {
      panel.webview.html = mapEditorNoticeHtml(result.reason);
      return;
    }
    this.map = result;
    panel.title = `Map Editor: ${result.targetName}`;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.dirname(result.provincesBmpPath))],
    };
    panel.webview.html = mapEditorHtml(panel.webview.cspSource);
  }

  private async handle(message: PageMessage | undefined): Promise<void> {
    const panel = this.panel;
    const client = this.getClient();
    if (!panel || !client || !message) {
      return;
    }
    switch (message.type) {
      case 'ready':
        this.sendMap(panel);
        return;
      case 'reload':
        await this.load(panel);
        return;
      case 'log':
        client.outputChannel.appendLine(`Map editor page: ${message.message}`);
        return;
      case 'select':
        await this.select(panel, client, message.provinceId, message.popDate);
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
    const result = await client.sendRequest<TerrainPictureResult>(MAP_EDITOR_TERRAIN_PICTURE_REQUEST, {
      ...this.params,
      terrain,
    });
    void panel.webview.postMessage({ type: 'terrainPicture', ...result });
  }

  private sendMap(panel: vscode.WebviewPanel): void {
    if (!this.map) {
      return;
    }
    const bmpUri = panel.webview.asWebviewUri(vscode.Uri.file(this.map.provincesBmpPath)).toString();
    void panel.webview.postMessage({ type: 'map', map: this.map, bmpUri });
    if (this.reveal) {
      void panel.webview.postMessage({ type: 'revealPixel', ...this.reveal });
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
    const result = await client.sendRequest<ProvinceResult>(MAP_EDITOR_PROVINCE_REQUEST, {
      ...this.params,
      provinceId,
      popDate,
    });
    if (result.kind === 'details') {
      void panel.webview.postMessage({ type: 'details', details: result.details });
    } else {
      void panel.webview.postMessage({ type: 'error', message: result.reason });
    }
  }

  private async save(panel: vscode.WebviewPanel, client: LanguageClient, params: SaveParams): Promise<void> {
    if (!this.params) {
      return;
    }
    const result = await client.sendRequest<SaveResult>(MAP_EDITOR_SAVE_REQUEST, { ...params, ...this.params });
    void panel.webview.postMessage({ type: 'saved', result });
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Victorian Tools: ${result.reason}`);
    }
  }
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
