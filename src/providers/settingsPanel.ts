import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import {
  affectsSettingsPage,
  readActiveMods,
  readCountryColorsTint,
  readFlagNamePattern,
  readGamePath,
  readIgnoreMarker,
  readLocKeyPattern,
  readNullTagPattern,
  readNullTagSuppress,
  readProvinceFolderPattern,
  writeActiveMods,
  writeCountryColorsTint,
  writeFlagNamePattern,
  writeGamePath,
  writeIgnoreMarker,
  writeLocKeyPattern,
  writeNullTagPattern,
  writeNullTagSuppress,
  writeProvinceFolderPattern,
} from '../config.js';
import { LAYOUT_CHANGED_NOTIFICATION, MODS_REQUEST, type ModsResult } from '../model/modDescriptor.js';
import { settingsHtml, settingsState, type SettingsState } from './settingsHtml.js';
import { request } from './request.js';

type SettingsMessage =
  | { readonly type: 'gamePath'; readonly value: string }
  | { readonly type: 'browse' }
  | { readonly type: 'select'; readonly mods: readonly string[] }
  | { readonly type: 'locKeyPattern'; readonly value: string }
  | { readonly type: 'flagNamePattern'; readonly value: string }
  | { readonly type: 'nullTagPattern'; readonly value: string }
  | { readonly type: 'nullTagSuppress'; readonly value: boolean }
  | { readonly type: 'ignoreMarker'; readonly value: string }
  | { readonly type: 'provinceFolderPattern'; readonly value: string }
  | { readonly type: 'countryColorsTint'; readonly value: number }
  | { readonly type: 'refresh' };

/**
 * The **Victorian Tools Settings** editor tab, itself in two tabs: *Extension*
 * (the game folder, typed or browsed; the skip marker; the Map Editor tint; the
 * mods being worked on, in any combination) and *Regex Patterns* (localisation
 * keys, flag names, null tags and the Map Editor's province folders). All are
 * plain settings; the page redraws when they change and when the server has
 * re-read the install, so what it shows is what the server uses.
 */
export class SettingsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly getClient: () => LanguageClient | undefined) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsSettingsPage(event)) {
          void this.refresh();
        }
      }),
    );
  }

  /** Called once the client exists: the server tells us when it has re-read the install. */
  listenTo(client: LanguageClient): void {
    this.subscriptions.push(
      client.onNotification(LAYOUT_CHANGED_NOTIFICATION, () => {
        void this.refresh();
      }),
    );
  }

  dispose(): void {
    this.panel?.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'victorianTools.settings',
      'Victorian Tools Settings',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = settingsHtml(panel.webview.cspSource);
    panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handle(message);
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel = panel;
  }

  async refresh(): Promise<void> {
    const panel = this.panel;
    if (!panel) {
      return;
    }
    const state = await this.currentState();
    void panel.webview.postMessage({ type: 'state', ...state });
  }

  private async handle(message: unknown): Promise<void> {
    const parsed = asMessage(message);
    switch (parsed?.type) {
      case 'gamePath':
        await writeGamePath(parsed.value);
        return;
      case 'browse':
        await this.browse();
        return;
      case 'select':
        await writeActiveMods(parsed.mods);
        return;
      case 'locKeyPattern':
        await writeLocKeyPattern(parsed.value);
        return;
      case 'flagNamePattern':
        await writeFlagNamePattern(parsed.value);
        return;
      case 'nullTagPattern':
        await writeNullTagPattern(parsed.value);
        return;
      case 'nullTagSuppress':
        await writeNullTagSuppress(parsed.value);
        return;
      case 'ignoreMarker':
        await writeIgnoreMarker(parsed.value);
        return;
      case 'provinceFolderPattern':
        await writeProvinceFolderPattern(parsed.value);
        return;
      case 'countryColorsTint':
        await writeCountryColorsTint(parsed.value);
        return;
      case 'refresh':
        await this.refresh();
        return;
      case undefined:
        return;
    }
  }

  private async browse(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      title: 'Victoria 2 install folder (holds mod/, common/ and map/)',
      openLabel: 'Use this folder',
    });
    const folder = picked?.[0];
    if (folder) {
      await writeGamePath(folder.fsPath);
    }
  }

  private async currentState(): Promise<SettingsState> {
    const client = this.getClient();
    const installed: ModsResult = client
      ? await request(client, MODS_REQUEST)
      : { gameRoot: undefined, mods: [] };
    return settingsState(installed, {
      gamePathSetting: readGamePath(),
      selected: readActiveMods(),
      locKeyPattern: readLocKeyPattern(),
      flagNamePattern: readFlagNamePattern(),
      nullTagPattern: readNullTagPattern(),
      nullTagSuppress: readNullTagSuppress(),
      ignoreMarker: readIgnoreMarker(),
      provinceFolderPattern: readProvinceFolderPattern(),
      countryColorsTint: readCountryColorsTint(),
    });
  }
}

function asMessage(message: unknown): SettingsMessage | undefined {
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }
  // The page is ours, but its messages arrive untyped; every field is checked before use.
  const record = message as Record<string, unknown>;
  switch (record['type']) {
    case 'refresh':
    case 'browse':
      return { type: record['type'] };
    case 'gamePath':
    case 'locKeyPattern':
    case 'flagNamePattern':
    case 'nullTagPattern':
    case 'ignoreMarker':
    case 'provinceFolderPattern':
      return typeof record['value'] === 'string' ? { type: record['type'], value: record['value'] } : undefined;
    case 'nullTagSuppress':
      return typeof record['value'] === 'boolean' ? { type: 'nullTagSuppress', value: record['value'] } : undefined;
    case 'countryColorsTint':
      return asTintMessage(record['value']);
    case 'select':
      return Array.isArray(record['mods'])
        ? { type: 'select', mods: record['mods'].filter((item): item is string => typeof item === 'string') }
        : undefined;
    default:
      return undefined;
  }
}

function asTintMessage(value: unknown): SettingsMessage | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? { type: 'countryColorsTint', value } : undefined;
}
