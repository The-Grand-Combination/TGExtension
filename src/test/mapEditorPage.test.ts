import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  MAP_EDITOR_COUNTRY_COLORS_REQUEST,
  MAP_EDITOR_POSITIONS_REQUEST,
  type MapCountryColorsResult,
  type MapEditorMap,
  type MapEditorReveal,
  type MapPositionsResult,
} from '../model/mapEditor.js';
import { mapEditorHtml } from '../providers/mapEditorHtml.js';
import { EXTENSION_ID } from './extensionId.js';
import { encodeBmp24 } from './unit/bmpFixtures.js';

const TGC_MAP = 'F:/SteamLibrary/steamapps/common/Victoria 2/mod/TGC/map/provinces.bmp';

interface PageRun {
  readonly logs: string[];
  /** Province ids the page asked the host for, in order. */
  readonly selected: number[];
}

/**
 * Drive the Map Editor page in a real webview and collect what it logs until the
 * map is ready or fails. With a `reveal`, the run goes on until the page picks a
 * province for that pixel.
 */
async function loadPage(
  bmpPath: string,
  definitions: MapEditorMap['definitions'],
  timeoutMs: number,
  reveal?: MapEditorReveal,
): Promise<PageRun> {
  const folder = path.dirname(bmpPath);
  // The page's script now ships as dist/mapEditorPage.js, so the extension's
  // own folder has to be a resource root too or the <script src> is refused.
  const extensionUri = extensionRoot();
  const panel = vscode.window.createWebviewPanel('victorianTools.mapEditorTest', 'Map Editor test', vscode.ViewColumn.One, {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(folder), extensionUri],
  });
  const logs: string[] = [];
  const selected: number[] = [];
  const map: MapEditorMap = {
    kind: 'ready',
    targetName: 'Test',
    targetRoot: folder,
    provincesBmpPath: bmpPath,
    riversBmpPath: undefined,
    definitions,
    seaProvinces: [],
    popDates: ['1836.1.1'],
    historyFolders: [''],
    popFiles: { '1836.1.1': [] },
  };
  const done = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const finish = (): void => {
      clearTimeout(timer);
      resolve();
    };
    panel.webview.onDidReceiveMessage((message: { type?: string; message?: string; provinceId?: number }) => {
      if (message.type === 'ready') {
        const bmpUri = panel.webview.asWebviewUri(vscode.Uri.file(bmpPath)).toString();
        void panel.webview.postMessage({ type: 'map', map, bmpUri });
      } else if (message.type === 'select' && message.provinceId !== undefined) {
        selected.push(message.provinceId);
        finish();
      } else if (message.type === 'log' && message.message !== undefined) {
        logs.push(message.message);
        if (message.message.startsWith('Could not') || message.message.startsWith('Page error')) {
          finish();
        } else if (message.message.startsWith('map ready')) {
          if (reveal) {
            void panel.webview.postMessage({ type: 'revealPixel', ...reveal });
          } else {
            finish();
          }
        }
      }
    });
  });
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'mapEditorPage.js'));
  panel.webview.html = mapEditorHtml(panel.webview.cspSource, scriptUri.toString());
  await done;
  panel.dispose();
  return { logs, selected };
}

suite('Map Editor page', () => {
  test('fetches, decodes and draws a small provinces.bmp inside a webview', async function () {
    this.timeout(30000);
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2-map-'));
    const bmpPath = path.join(folder, 'provinces.bmp');
    fs.writeFileSync(bmpPath, encodeBmp24(4, 2, [1, 1, 2, 2, 3, 3, 4, 4]));
    const { logs } = await loadPage(bmpPath, [{ id: 1, color: 1, name: 'One' }], 20000);
    assert.ok(logs.includes('map ready; overlay none'), `page did not finish or the overlay stayed: ${logs.join(' | ')}`);
  });

  test('loads the TGC provinces.bmp when it is installed', async function () {
    this.timeout(120000);
    if (!fs.existsSync(TGC_MAP)) {
      this.skip();
      return;
    }
    const { logs } = await loadPage(TGC_MAP, [{ id: 1, color: 0xcce598, name: 'Sitka' }], 110000);
    assert.ok(logs.includes('map ready; overlay none'), `page did not finish or the overlay stayed: ${logs.join(' | ')}`);
  });

  // A map report pixel is top-down, the canvas draws the file's rows as the game
  // reads them, so revealing one has to flip y. Without the flip these two swap.
  test('a revealed pixel selects the province under it, flipping the report y', async function () {
    this.timeout(30000);
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2-reveal-'));
    const bmpPath = path.join(folder, 'provinces.bmp');
    // Top row of the image is color 1, bottom row is color 3.
    fs.writeFileSync(bmpPath, encodeBmp24(4, 2, [1, 1, 1, 1, 3, 3, 3, 3]));
    const definitions = [
      { id: 11, color: 1, name: 'Top' },
      { id: 33, color: 3, name: 'Bottom' },
    ];
    const top = await loadPage(bmpPath, definitions, 20000, { file: 'map/provinces.bmp', x: 0, y: 0 });
    assert.deepStrictEqual(top.selected, [11], top.logs.join(' | '));
    const bottom = await loadPage(bmpPath, definitions, 20000, { file: 'map/provinces.bmp', x: 0, y: 1 });
    assert.deepStrictEqual(bottom.selected, [33], bottom.logs.join(' | '));
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
      riversBmpPath: undefined,
      definitions: [{ id: 1, color: 1, name: 'One' }],
      seaProvinces: [],
      popDates: ['1836.1.1'],
      historyFolders: [''],
      popFiles: { '1836.1.1': [] },
    };
    const fakeClient = {
      sendRequest: (method: string): Promise<MapEditorMap | MapPositionsResult | MapCountryColorsResult> =>
        Promise.resolve(answerFor(method, map)),
      outputChannel: { appendLine: (line: string): void => { logs.push(line); } },
    };
    // The panel only calls sendRequest and outputChannel on the client.
    const panel = new MapEditorPanel(
      () => fakeClient as unknown as import('vscode-languageclient/node').LanguageClient,
      extensionRoot(),
    );
    await panel.open({ workspaceFolders: [], mods: [] });
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline && !logs.some((line) => line.includes('map ready') || line.includes('Could not') || line.includes('Page error'))) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    panel.dispose();
    assert.ok(logs.some((line) => line.includes('map ready; overlay none')), `panel did not finish or the overlay stayed: ${logs.join(' | ')}`);
  });
});

function answerFor(method: string, map: MapEditorMap): MapEditorMap | MapPositionsResult | MapCountryColorsResult {
  if (method === MAP_EDITOR_POSITIONS_REQUEST) {
    return { kind: 'ready', markers: [] };
  }
  if (method === MAP_EDITOR_COUNTRY_COLORS_REQUEST) {
    return { kind: 'ready', owners: {}, colors: {} };
  }
  return map;
}

/** The installed extension's folder, which is where dist/mapEditorPage.js lives. */
function extensionRoot(): vscode.Uri {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`extension ${EXTENSION_ID} is not installed in the test host`);
  }
  return extension.extensionUri;
}
