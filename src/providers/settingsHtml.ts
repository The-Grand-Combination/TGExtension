import * as crypto from 'node:crypto';
import type { ModDescriptor, ModsResult } from '../model/modDescriptor.js';
import { baseMods, missingDependencies, resolveSelection, submodsOf } from '../services/modLayout.js';

export interface ModEntry {
  readonly name: string;
  readonly path: string;
  readonly dependencies: readonly string[];
}

/** One base mod and the submods that depend on it; `base` is undefined for mods whose dependency is absent. */
export interface ModGroup {
  readonly base: ModEntry | undefined;
  readonly submods: readonly ModEntry[];
}

/** Everything the settings page draws; sent as one message and rendered client-side. */
export interface SettingsState {
  /** `victorianTools.gamePath` as the user typed it; empty when the install is detected. */
  readonly gamePathSetting: string;
  /** The install actually in use, detected or configured. */
  readonly gameRoot: string | undefined;
  readonly groups: readonly ModGroup[];
  readonly selected: readonly string[];
  /** The selection in load order, dependencies first. */
  readonly order: readonly string[];
  readonly warning?: string;
}

/** The state the page draws for the installed mods, the game folder and the current selection. */
export function settingsState(installed: ModsResult, gamePathSetting: string, selected: readonly string[]): SettingsState {
  const { gameRoot, mods } = installed;
  const stack = resolveSelection(mods, selected);
  const missing = missingDependencies(mods, stack);
  return {
    gamePathSetting,
    gameRoot,
    groups: groupsOf(mods),
    selected,
    order: stack.map((mod) => mod.name),
    ...(missing.length === 0 ? {} : { warning: `Dependency not installed: ${missing.join(', ')}` }),
  };
}

/** Base mods with their submods nested; mods whose dependency is absent form a last group. */
function groupsOf(mods: readonly ModDescriptor[]): ModGroup[] {
  const placed = new Set<string>();
  const groups: ModGroup[] = baseMods(mods).map((base) => {
    const submods = submodsOf(mods, base.name);
    placed.add(base.name);
    for (const submod of submods) {
      placed.add(submod.name);
    }
    return { base: entryOf(base), submods: submods.map(entryOf) };
  });
  const orphans = mods.filter((mod) => !placed.has(mod.name));
  return orphans.length === 0 ? groups : [...groups, { base: undefined, submods: orphans.map(entryOf) }];
}

function entryOf(mod: ModDescriptor): ModEntry {
  return { name: mod.name, path: mod.path, dependencies: mod.dependencies };
}

/**
 * The settings page. It holds no data of its own: it renders the `state`
 * messages it receives and posts `gamePath`, `browse`, `select` or `refresh`.
 * Styling uses the editor's theme variables.
 */
export function settingsHtml(cspSource: string): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Victorian Tools Settings</title>
<style nonce="${nonce}">
  body { max-width: 760px; margin: 0 auto; padding: 16px 24px 32px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  h1 { font-size: 1.5em; font-weight: 600; margin: 8px 0 20px; }
  h2 { font-size: 1.1em; font-weight: 600; margin: 24px 0 6px; }
  p.hint { margin: 0 0 10px; opacity: 0.75; line-height: 1.5; }
  .field { display: flex; gap: 8px; align-items: center; }
  input[type=text] { flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font-family: inherit; font-size: inherit; }
  input[type=text]:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  button { padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .status { margin-top: 8px; line-height: 1.5; }
  .ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green)); }
  .warning { color: var(--vscode-editorWarning-foreground); }
  .error { color: var(--vscode-errorForeground); }
  .list { margin-top: 8px; padding: 4px 0; background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, transparent)); border-radius: 2px; }
  label.row { display: flex; align-items: center; gap: 8px; padding: 4px 10px; cursor: pointer; }
  label.row:hover { background: var(--vscode-list-hoverBackground); }
  label.row.submod { padding-left: 34px; }
  label.row input { margin: 0; flex: none; }
  label.row .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  label.row .path { flex: none; opacity: 0.6; font-size: 0.9em; }
  .group-title { padding: 8px 10px 2px; font-size: 0.85em; opacity: 0.7; text-transform: uppercase; }
  .order { margin-top: 10px; line-height: 1.5; word-break: break-word; }
  .order b { font-weight: 600; opacity: 0.8; }
  code { font-family: var(--vscode-editor-font-family); font-size: 0.95em; }
</style>
</head>
<body>
<h1>Victorian Tools Settings</h1>

<h2>Game folder</h2>
<p class="hint">The Victoria 2 install: the folder holding <code>mod/</code>, <code>common/</code> and <code>map/</code>. Leave empty to detect it above the workspace folder. Mods are read on top of the game files they do not <code>replace_path</code>. Stored in your user settings (<code>victorianTools.gamePath</code>).</p>
<div class="field">
  <input id="gamePath" type="text" placeholder="Detected automatically" spellcheck="false">
  <button id="browse">Browse…</button>
  <button id="save" class="secondary">Save</button>
</div>
<div id="gameStatus" class="status"></div>

<h2>Mods and submods</h2>
<p class="hint">Nothing needs ticking for everyday work: every mod is read on top of the game files it does not <code>replace_path</code>, and a submod on top of the mods it depends on. Tick mods here only to work on them <b>together</b>: the ticked mods and their dependencies then form one stack, in load order, for validation and for the full report. Any combination is allowed, as in the launcher. Stored in the workspace settings (<code>victorianTools.activeMods</code>). <a id="refresh" href="#">Refresh</a> after adding or editing a <code>.mod</code> file outside the workspace.</p>
<div id="mods"></div>
<div id="order" class="order"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const gamePath = document.getElementById('gamePath');
  const gameStatus = document.getElementById('gameStatus');
  const modsBox = document.getElementById('mods');
  const orderBox = document.getElementById('order');
  let state = null;
  let selected = new Set();

  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function row(entry, kind) {
    const checked = selected.has(entry.name) ? ' checked' : '';
    return '<label class="row ' + kind + '">'
      + '<input type="checkbox" data-name="' + escape(entry.name) + '"' + checked + '>'
      + '<span class="name">' + escape(entry.name) + '</span><span class="path">' + escape(entry.path) + '</span></label>';
  }

  function renderGame() {
    if (document.activeElement !== gamePath) gamePath.value = state.gamePathSetting;
    if (state.gameRoot === undefined) {
      gameStatus.className = 'status error';
      gameStatus.textContent = state.gamePathSetting
        ? 'No mod/ folder inside ' + state.gamePathSetting + '. Pick the Victoria 2 install folder.'
        : 'No Victoria 2 install found above the workspace. Pick the install folder.';
      return;
    }
    if (state.gamePathSetting && state.gamePathSetting.replace(/[\\\\/]+$/, '').toLowerCase() !== state.gameRoot.replace(/[\\\\/]+$/, '').toLowerCase()) {
      gameStatus.className = 'status warning';
      gameStatus.textContent = 'The configured folder has no mod/ folder; using the detected install at ' + state.gameRoot + '.';
      return;
    }
    gameStatus.className = 'status ok';
    gameStatus.textContent = (state.gamePathSetting ? 'Using ' : 'Detected ') + state.gameRoot;
  }

  function renderMods() {
    if (state.gameRoot === undefined) {
      modsBox.innerHTML = '<p class="hint">Set the game folder first.</p>';
      orderBox.innerHTML = '';
      return;
    }
    if (state.groups.length === 0) {
      modsBox.innerHTML = '<p class="hint">No .mod file in ' + escape(state.gameRoot) + '/mod.</p>';
      orderBox.innerHTML = '';
      return;
    }
    modsBox.innerHTML = '<div class="list">' + state.groups.map((group) => {
      if (!group.base) {
        return '<div class="group-title">Dependency not installed</div>' + group.submods.map((m) => row(m, 'orphan')).join('');
      }
      return row(group.base, 'base') + group.submods.map((m) => row(m, 'submod')).join('');
    }).join('') + '</div>';
    orderBox.innerHTML = (state.order.length === 0
        ? 'Nothing ticked: each mod is read on top of the game files and of its dependencies.'
        : '<b>Load order:</b> game &rsaquo; ' + state.order.map(escape).join(' &rsaquo; '))
      + (state.warning ? '<div class="warning">' + escape(state.warning) + '</div>' : '');
    for (const box of modsBox.querySelectorAll('input[type=checkbox]')) {
      box.addEventListener('change', () => {
        if (box.checked) selected.add(box.dataset.name); else selected.delete(box.dataset.name);
        vscode.postMessage({ type: 'select', mods: [...selected] });
      });
    }
  }

  document.getElementById('browse').addEventListener('click', () => vscode.postMessage({ type: 'browse' }));
  document.getElementById('save').addEventListener('click', () => vscode.postMessage({ type: 'gamePath', value: gamePath.value }));
  gamePath.addEventListener('keydown', (event) => { if (event.key === 'Enter') vscode.postMessage({ type: 'gamePath', value: gamePath.value }); });
  document.getElementById('refresh').addEventListener('click', (event) => { event.preventDefault(); vscode.postMessage({ type: 'refresh' }); });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'state') {
      state = event.data;
      selected = new Set(state.selected);
      renderGame();
      renderMods();
    }
  });
  vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
}
