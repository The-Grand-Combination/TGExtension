import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { MapEditorMap } from '../model/mapEditor.js';
import { mapEditorHtml } from '../providers/mapEditorHtml.js';
import { encodeBmp24 } from './unit/bmpFixtures.js';

const TGC_MAP = 'F:/SteamLibrary/steamapps/common/Victoria 2/mod/TGC/map/provinces.bmp';

/** Drive the Map Editor page in a real webview and collect what it logs until the map is ready or fails. */
async function loadPage(bmpPath: string, definitions: MapEditorMap['definitions'], timeoutMs: number): Promise<string[]> {
  const folder = path.dirname(bmpPath);
  const panel = vscode.window.createWebviewPanel('victorianTools.mapEditorTest', 'Map Editor test', vscode.ViewColumn.One, {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(folder)],
  });
  const logs: string[] = [];
  const map: MapEditorMap = {
    kind: 'ready',
    targetName: 'Test',
    targetRoot: folder,
    provincesBmpPath: bmpPath,
    definitions,
    seaProvinces: [],
    popDates: ['1836.1.1'],
    historyFolders: [''],
    popFiles: { '1836.1.1': [] },
  };
  const done = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    panel.webview.onDidReceiveMessage((message: { type?: string; message?: string }) => {
      if (message.type === 'ready') {
        const bmpUri = panel.webview.asWebviewUri(vscode.Uri.file(bmpPath)).toString();
        void panel.webview.postMessage({ type: 'map', map, bmpUri });
      } else if (message.type === 'log' && message.message !== undefined) {
        logs.push(message.message);
        if (message.message.startsWith('map ready') || message.message.startsWith('Could not') || message.message.startsWith('Page error')) {
          clearTimeout(timer);
          resolve();
        }
      }
    });
  });
  panel.webview.html = mapEditorHtml(panel.webview.cspSource);
  await done;
  panel.dispose();
  return logs;
}

suite('Map Editor page', () => {
  test('fetches, decodes and draws a small provinces.bmp inside a webview', async function () {
    this.timeout(30000);
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2-map-'));
    const bmpPath = path.join(folder, 'provinces.bmp');
    fs.writeFileSync(bmpPath, encodeBmp24(4, 2, [1, 1, 2, 2, 3, 3, 4, 4]));
    const logs = await loadPage(bmpPath, [{ id: 1, color: 1, name: 'One' }], 20000);
    assert.ok(logs.includes('map ready; overlay none'), `page did not finish or the overlay stayed: ${logs.join(' | ')}`);
  });

  test('loads the TGC provinces.bmp when it is installed', async function () {
    this.timeout(120000);
    if (!fs.existsSync(TGC_MAP)) {
      this.skip();
      return;
    }
    const logs = await loadPage(TGC_MAP, [{ id: 1, color: 0xcce598, name: 'Sitka' }], 110000);
    assert.ok(logs.includes('map ready; overlay none'), `page did not finish or the overlay stayed: ${logs.join(' | ')}`);
  });
});

suite('Map Editor panel', () => {
  test('the panel loads the map through the same steps as the command', async function () {
    this.timeout(60000);
    const { MapEditorPanel } = await import('../providers/mapEditorPanel.js');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2-map-'));
    const bmpPath = path.join(folder, 'provinces.bmp');
    fs.writeFileSync(bmpPath, encodeBmp24(4, 2, [1, 1, 2, 2, 3, 3, 4, 4]));
    const logs: string[] = [];
    const map: MapEditorMap = {
      kind: 'ready',
      targetName: 'Test',
      targetRoot: folder,
      provincesBmpPath: bmpPath,
      definitions: [{ id: 1, color: 1, name: 'One' }],
      seaProvinces: [],
      popDates: ['1836.1.1'],
      historyFolders: [''],
      popFiles: { '1836.1.1': [] },
    };
    const fakeClient = {
      sendRequest: (): Promise<MapEditorMap> => Promise.resolve(map),
      outputChannel: { appendLine: (line: string): void => { logs.push(line); } },
    };
    // The panel only calls sendRequest and outputChannel on the client.
    const panel = new MapEditorPanel(() => fakeClient as unknown as import('vscode-languageclient/node').LanguageClient);
    await panel.open({ workspaceFolders: [], mods: [] });
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline && !logs.some((line) => line.includes('map ready') || line.includes('Could not') || line.includes('Page error'))) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    panel.dispose();
    assert.ok(logs.some((line) => line.includes('map ready; overlay none')), `panel did not finish or the overlay stayed: ${logs.join(' | ')}`);
  });
});
