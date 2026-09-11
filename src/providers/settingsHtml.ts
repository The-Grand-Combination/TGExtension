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
  /** `victorianTools.localisation.keyPattern`; empty means every value is checked. */
  readonly locKeyPattern: string;
  /** `victorianTools.flags.namePattern`; empty means every flag is checked. */
  readonly flagNamePattern: string;
  /** `victorianTools.nullTags.pattern`; empty means no tag is treated as null. */
  readonly nullTagPattern: string;
  /** `victorianTools.ignoreMarker`; empty means no line can be silenced. */
  readonly ignoreMarker: string;
  readonly warning?: string;
}

/** The settings the page shows, read from the workspace configuration. */
export interface CurrentSettings {
  readonly gamePathSetting: string;
  readonly selected: readonly string[];
  readonly locKeyPattern: string;
  readonly flagNamePattern: string;
  readonly nullTagPattern: string;
  readonly ignoreMarker: string;
}

/** The state the page draws for the installed mods, the game folder, the selection and the loc pattern. */
export function settingsState(installed: ModsResult, current: CurrentSettings): SettingsState {
  const { gameRoot, mods } = installed;
  const stack = resolveSelection(mods, current.selected);
  const missing = missingDependencies(mods, stack);
  return {
    gamePathSetting: current.gamePathSetting,
    gameRoot,
    groups: groupsOf(mods),
    selected: current.selected,
    order: stack.map((mod) => mod.name),
    locKeyPattern: current.locKeyPattern,
    flagNamePattern: current.flagNamePattern,
    nullTagPattern: current.nullTagPattern,
    ignoreMarker: current.ignoreMarker,
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
 * messages it receives and posts `gamePath`, `browse`, `select`, `locKeyPattern`,
 * `flagNamePattern`, `nullTagPattern`, `ignoreMarker` or `refresh`.
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

<h2>Localisation key pattern</h2>
<p class="hint">A regular expression deciding which <code>title</code>, <code>desc</code> and <code>name</code> values are localisation keys. A value that does not match is treated as literal display text and is never reported as a missing key, so <code>desc = "Death of Dom Pedro II"</code> stays silent while <code>desc = "EVTDESC48300"</code> is still checked against <code>localisation/</code>. Leave empty to check every value. Stored in the workspace settings (<code>victorianTools.localisation.keyPattern</code>); the default is <code>^EVT</code>.</p>
<div class="field">
  <input id="locPattern" type="text" placeholder="Empty: check every value" spellcheck="false">
  <button id="locDefault" class="secondary">Default</button>
  <button id="locSave" class="secondary">Save</button>
</div>
<div id="locStatus" class="status"></div>

<h2>Flag name pattern</h2>
<p class="hint">A regular expression narrowing the never-set flag check. A <code>has_country_flag</code> or <code>has_global_flag</code> value whose name does not match is never reported as checked-but-never-set, which exempts flags the mod sets outside the files the index reads. Leave empty to check every flag. Stored in the workspace settings (<code>victorianTools.flags.namePattern</code>); the default is empty.</p>
<div class="field">
  <input id="flagPattern" type="text" placeholder="Empty: check every flag" spellcheck="false">
  <button id="flagDefault" class="secondary">Default</button>
  <button id="flagSave" class="secondary">Save</button>
</div>
<div id="flagStatus" class="status"></div>

<h2>Null TAG exception</h2>
<p class="hint">A regular expression matching the tags a script uses to mean <i>no country</i>. A country value that matches becomes a warning instead of an unknown-tag error, so <code>war = { target = --- }</code> and <code>secede_province = QQQ</code> stay legible while a genuine typo is still an error. Matched case-insensitively. Leave empty to allow no exception: every unknown tag is then an error. Stored in the workspace settings (<code>victorianTools.nullTags.pattern</code>).</p>
<div class="field">
  <input id="nullTagPattern" type="text" placeholder="Empty: no exception" spellcheck="false">
  <button id="nullTagDefault" class="secondary">Default</button>
  <button id="nullTagSave" class="secondary">Save</button>
</div>
<div id="nullTagStatus" class="status"></div>

<h2>Skip-validation marker</h2>
<p class="hint">Write this on a line and every finding on it is silenced. Make it a comment so the game ignores it: <code>prestige = 5 #VT - Skip Validation</code>. Matched anywhere in the line, case-insensitively, and it silences every rule &mdash; syntax, structure, semantics, the map CSVs and cross-file duplicates. Leave empty to turn the escape hatch off. Stored in the workspace settings (<code>victorianTools.ignoreMarker</code>).</p>
<div class="field">
  <input id="ignoreMarker" type="text" placeholder="Empty: no line can be silenced" spellcheck="false">
  <button id="ignoreDefault" class="secondary">Default</button>
  <button id="ignoreSave" class="secondary">Save</button>
</div>
<div id="ignoreStatus" class="status"></div>

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

  /**
   * A regex setting: input, Default and Save, plus a status line that compiles
   * what is typed. A broken pattern is silently ignored by the server, so it is
   * caught here instead. Returns the function that redraws it from state.
   */
  function patternField(ids, messageType, defaultValue, words) {
    const input = document.getElementById(ids.input);
    const status = document.getElementById(ids.status);
    const save = () => vscode.postMessage({ type: messageType, value: input.value });
    const show = () => {
      const source = input.value;
      if (source === '') {
        status.className = 'status';
        status.textContent = words.empty;
        return;
      }
      if (!words.plain) {
        try {
          new RegExp(source);
        } catch (error) {
          status.className = 'status error';
          status.textContent = 'Not a valid regular expression: ' + error.message + '. Saving it would ' + words.invalid + '.';
          return;
        }
      }
      status.className = 'status ok';
      status.textContent = words.matching + ' ' + source + '.';
    };
    document.getElementById(ids.save).addEventListener('click', save);
    document.getElementById(ids.reset).addEventListener('click', () => { input.value = defaultValue; save(); });
    input.addEventListener('input', show);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') save(); });
    return (value) => {
      if (document.activeElement !== input) input.value = value;
      show();
    };
  }

  const renderLocPattern = patternField(
    { input: 'locPattern', status: 'locStatus', save: 'locSave', reset: 'locDefault' },
    'locKeyPattern',
    '^EVT',
    {
      empty: 'Every title, desc and name value is checked against localisation/.',
      invalid: 'check every value',
      matching: 'Checking values that match'
    });

  const renderFlagPattern = patternField(
    { input: 'flagPattern', status: 'flagStatus', save: 'flagSave', reset: 'flagDefault' },
    'flagNamePattern',
    '',
    {
      empty: 'Every country and global flag is checked for never being set.',
      invalid: 'check every flag',
      matching: 'Checking flags whose name matches'
    });

  const renderNullTagPattern = patternField(
    { input: 'nullTagPattern', status: 'nullTagStatus', save: 'nullTagSave', reset: 'nullTagDefault' },
    'nullTagPattern',
    '^(QQQ|---|null)$',
    {
      empty: 'No tag is treated as null: every unknown country tag is an error.',
      invalid: 'allow no exception',
      matching: 'Warning instead of an error for tags matching'
    });

  const renderIgnoreMarker = patternField(
    { input: 'ignoreMarker', status: 'ignoreStatus', save: 'ignoreSave', reset: 'ignoreDefault' },
    'ignoreMarker',
    '#VT - Skip Validation',
    {
      plain: true,
      empty: 'No line can be silenced; every finding is reported.',
      matching: 'Silencing every finding on a line containing'
    });

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
      renderLocPattern(state.locKeyPattern);
      renderFlagPattern(state.flagNamePattern);
      renderNullTagPattern(state.nullTagPattern);
      renderIgnoreMarker(state.ignoreMarker);
      renderMods();
    }
  });
  vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
}
