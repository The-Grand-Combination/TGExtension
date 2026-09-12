import * as crypto from 'node:crypto';

/** A page with one message and nothing else: shown while the map loads or when it cannot. */
export function mapEditorNoticeHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<title>Map Editor</title>
</head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px;">
<p>${escapeHtml(message)}</p>
</body>
</html>`;
}

/**
 * The Map Editor page. It fetches `provinces.bmp` itself (the extension allows
 * the map folder as a local resource), decodes it, and draws it on a canvas
 * with pan and zoom. A click maps the pixel color to a province through
 * definition.csv and asks the extension for that province's details; the side
 * panel edits them and posts one save per section.
 */
export function mapEditorHtml(cspSource: string): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src ${cspSource}; img-src ${cspSource} data: blob:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Map Editor</title>
<style nonce="${nonce}">
${PAGE_STYLE}
</style>
</head>
<body>
<div id="toolbar">
  <span id="target" class="target"></span>
  <span class="spacer"></span>
  <span id="status" class="status"></span>
</div>
<div id="main">
  <div id="mapArea">
    <canvas id="canvas"></canvas>
    <div id="tooltip" hidden></div>
    <div id="layers">
      <label><input type="checkbox" id="layerCountry"> Country Colors</label>
      <label><input type="checkbox" id="layerRivers"> Show Rivers</label>
      <label><input type="checkbox" id="layerPositions" checked> Positions</label>
      <div class="actions">
        <button id="fitButton" class="secondary" title="Fit the whole map in the view">Fit</button>
        <button id="reloadButton" class="secondary" title="Re-read the map and the mod files">Reload</button>
      </div>
      <div class="find">
        <input id="goto" type="text" spellcheck="false" placeholder="id or name" title="Center the map on a province: its id, or a name from definition.csv">
        <button id="gotoButton" class="secondary">Go</button>
      </div>
      <button id="saveAllButton" title="Write every province whose positions were moved and not saved" hidden></button>
    </div>
    <div id="loading">Loading provinces.bmp…</div>
  </div>
  <div id="side"><p class="hint">Click a province on the map to edit it.</p></div>
</div>
<script nonce="${nonce}">
${PAGE_SCRIPT}
</script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const PAGE_STYLE = String.raw`
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body { display: flex; flex-direction: column; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); background: var(--vscode-editor-background); }
  #toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); flex: none; }
  #toolbar .target { font-weight: 600; }
  #toolbar .spacer { flex: 1; }
  #toolbar .status { opacity: 0.8; min-width: 120px; text-align: right; }
  #main { display: flex; flex: 1; min-height: 0; }
  #mapArea { position: relative; flex: 1; min-width: 0; overflow: hidden; background: #111; cursor: grab; }
  #mapArea.dragging { cursor: grabbing; }
  #mapArea.moving { cursor: move; }
  #canvas { display: block; width: 100%; height: 100%; }
  #tooltip { position: absolute; pointer-events: none; padding: 2px 6px; background: var(--vscode-editorHoverWidget-background, #252526); color: var(--vscode-editorHoverWidget-foreground, #ccc); border: 1px solid var(--vscode-editorHoverWidget-border, #454545); border-radius: 3px; font-size: 0.9em; white-space: nowrap; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 1.1em; background: rgba(0, 0, 0, 0.55); }
  #loading[hidden], #tooltip[hidden] { display: none; }
  /* Map layers: a translucent box over the map's bottom-left corner. */
  #layers { position: absolute; left: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 4px; padding: 6px 10px; background: rgba(30, 30, 30, 0.6); color: #eee; border-radius: 4px; font-size: 0.9em; user-select: none; }
  #layers label { display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
  #layers input { margin: 0; }
  #layers .actions { display: flex; gap: 6px; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.15); }
  #layers .actions button { flex: 1; padding: 2px 8px; }
  #side { width: 420px; flex: none; overflow-y: auto; border-left: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); padding: 14px 14px 24px; box-sizing: border-box; }
  /* The picture keeps the panel's own margin on every side, so it lines up with
     the text under it and stands the same distance off the top. */
  .header { margin: 0; padding: 0; background-size: cover; background-position: center; }
  .header.pictured { padding: 12px 14px 10px; aspect-ratio: 374 / 94; display: flex; align-items: flex-end; color: #fff; text-shadow: 0 1px 3px #000, 0 0 8px #000; box-sizing: border-box; }
  .header.pictured .file, .header.pictured .id { opacity: 0.95; }
  h1 { font-size: 1.2em; margin: 6px 0 2px; display: flex; align-items: baseline; gap: 8px; min-width: 0; white-space: nowrap; }
  .header.pictured h1 { margin: 0; flex: 1; }
  h1 .id { font-weight: 400; opacity: 0.7; flex: none; }
  h1 .file { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
  h1 .badge { flex: none; }
  h2 { font-size: 1.05em; font-weight: 600; margin: 16px 0 8px; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  h2 .title { flex: none; font-size: 1.2em; font-weight: 700; letter-spacing: 0.01em; }
  h2 .file { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; direction: rtl; text-align: left; }
  h2 button { flex: none; align-self: center; }
  h3 { font-size: 0.85em; font-weight: 700; margin: 12px 0 6px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.07em; display: flex; align-items: center; gap: 6px; }
  /* A rule opens every section and every group inside one, so a Save always
     sits under exactly what it writes. */
  .section + .section { margin-top: 18px; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .form > .group { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .form > .group:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  p.hint { margin: 4px 0 8px; opacity: 0.75; line-height: 1.4; }
  .badge { font-size: 0.8em; padding: 1px 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .file { font-family: var(--vscode-editor-font-family); font-size: 0.85em; opacity: 0.75; word-break: break-all; margin: 2px 0 6px; }
  .warning { color: var(--vscode-editorWarning-foreground); }
  .error { color: var(--vscode-errorForeground); }
  .ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green)); }
  input, select { padding: 3px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font-family: inherit; font-size: inherit; box-sizing: border-box; min-width: 0; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  input[type=number] { width: 90px; }
  #layers .find { display: flex; gap: 6px; margin-top: 4px; }
  #layers .find input { flex: 1; width: 92px; min-width: 0; }
  #layers .find button { flex: none; padding: 2px 8px; }
  #layers #saveAllButton { margin-top: 6px; padding: 3px 8px; }
  #layers #saveAllButton[hidden] { display: none; }
  button { padding: 3px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: inherit; white-space: nowrap; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.icon { padding: 1px 6px; line-height: 1.2; }
  /* Small buttons draw their glyph instead of typing one: a character never lines up. */
  button.glyph { flex: none; width: 13px; height: 13px; padding: 0; display: inline-flex; background: transparent; border: 1px solid var(--vscode-foreground); border-radius: 3px; opacity: 0.85; }
  button.glyph::before { content: ''; margin: auto; width: 9px; height: 9px; background-color: var(--vscode-foreground); }
  button.glyph:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
  button.glyph:disabled:hover { background: transparent; }
  button.plus::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8.5 3v4.5H13v1H8.5V13h-1V8.5H3v-1h4.5V3z'/%3E%3C/svg%3E") center / 9px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8.5 3v4.5H13v1H8.5V13h-1V8.5H3v-1h4.5V3z'/%3E%3C/svg%3E") center / 9px no-repeat; }
  button.center::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.5 1h1v3.5h-1zM7.5 11.5h1V15h-1zM1 7.5h3.5v1H1zM11.5 7.5H15v1h-3.5zM6.4 6.4h3.2v3.2H6.4z'/%3E%3C/svg%3E") center / 9px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.5 1h1v3.5h-1zM7.5 11.5h1V15h-1zM1 7.5h3.5v1H1zM11.5 7.5H15v1h-3.5zM6.4 6.4h3.2v3.2H6.4z'/%3E%3C/svg%3E") center / 9px no-repeat; }
  button.outline { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-foreground); border-radius: 3px; opacity: 0.85; padding: 2px 8px; line-height: 1.4; font-size: 0.9em; }
  button.outline:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
  .grid { display: grid; grid-template-columns: 110px 1fr; gap: 6px 8px; align-items: center; }
  .grid label { opacity: 0.85; }
  .rows { display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .row input, .row select, .row .combo { flex: 1; }
  .row .narrow { flex: 0 0 70px; }
  .combo { position: relative; min-width: 0; display: flex; }
  .combo input { width: 100%; padding-right: 22px; }
  .combo::after { content: ''; position: absolute; right: 4px; top: 0; bottom: 0; margin: auto; width: 16px; height: 16px; pointer-events: none; background-color: var(--vscode-foreground); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z'/%3E%3C/svg%3E") center / 16px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z'/%3E%3C/svg%3E") center / 16px no-repeat; }
  .combo-list { position: absolute; top: 100%; left: 0; min-width: 100%; max-width: 380px; z-index: 10; max-height: 240px; overflow-y: auto; background: var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background, #252526)); color: var(--vscode-editorSuggestWidget-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border, #454545)); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
  .combo-item { padding: 3px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .combo-item.active, .combo-item:hover { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .combo-item.empty { opacity: 0.7; font-style: italic; }
  /* A suggestion input (building, ideology, pops file) wears the same shell as a
     pick list: the browser draws its own arrow, which never matches ours. */
  input[list]::-webkit-calendar-picker-indicator { display: none; }
  .combo.picker::after { pointer-events: auto; cursor: pointer; }
  .row .remove { flex: none; }
  /* An empty list keeps one row to show what goes in it: dimmed until it is
     used, and its placeholders name the field rather than give a real value. */
  .row.ghost { opacity: 0.5; }
  .row.ghost:focus-within { opacity: 1; }
  .row.ghost input::placeholder { font-style: italic; }
  .head { display: flex; gap: 4px; font-size: 0.8em; opacity: 0.7; padding: 0 30px 0 0; position: relative; top: -2px; }
  .head span { flex: 1; }
  .head span.narrow { flex: 0 0 70px; }
  .actions { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); flex-wrap: wrap; }
  .inline { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .inline label { flex: none; opacity: 0.85; }
  .inline input[type=text] { flex: 1; min-width: 0; }
  .inline .status { flex: none; opacity: 0.85; }
  .actions .status { opacity: 0.85; }
  details.dated { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444)); border-radius: 3px; padding: 4px 8px; margin: 4px 0; }
  details.dated summary { display: flex; gap: 6px; align-items: center; cursor: pointer; }
  details.dated summary input { width: 120px; }
  .total { opacity: 0.8; font-size: 0.9em; margin-top: 4px; }
  /* The legend: the same colour the map draws the position with. */
  .swatch { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .pos-row .pos-label { flex: 0 0 78px; opacity: 0.85; margin-left: 4px; }
  .pos-row input { flex: 1; min-width: 0; width: auto; }
  .pos-head { padding-left: 96px; }
  label.check { display: flex; gap: 6px; align-items: center; opacity: 0.9; margin-top: 2px; }
  .tabs { display: flex; gap: 2px; margin: 10px 0 4px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .tabs button { background: transparent; color: var(--vscode-foreground); opacity: 0.7; border-radius: 0; padding: 6px 14px; border-bottom: 2px solid transparent; }
  .tabs button:hover { background: var(--vscode-list-hoverBackground); }
  .tabs button.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
  .tabs button:disabled { opacity: 0.35; cursor: default; }
  .tabs button:disabled:hover { background: transparent; }
  /* A part of the form the province cannot have: greyed, and it takes no input. */
  .locked { opacity: 0.5; }
`;

const PAGE_SCRIPT = String.raw`
(function () {
  'use strict';
  var vscode = acquireVsCodeApi();

  // --- State --------------------------------------------------------------------
  var map = null;            // MapEditorMap from the extension
  var idByColor = new Map(); // packed rgb -> province id
  var definitionById = new Map();
  var seaIds = new Set();
  var image = null;          // { width, height, tiles: [{ x, y, canvas }], packed: Uint32Array }
  var TILE = 1024;           // one bitmap of 20 megapixels never settles on some GPUs; tiles always do
  var view = { scale: 1, x: 0, y: 0 };
  var selection = null;      // { id, color, canvas, x, y, width, height }
  var selectedId = null;     // the province the side panel is about, set before its answer arrives
  var details = null;
  var pendingReveal = null;  // { file, x, y } from a map report link, applied once the bitmap is decoded
  var popDate = '';
  var saving = false;
  var activeTab = 'definition';
  var terrainPictures = {};      // terrain name -> data URI or null (asked, none), per map
  var headerBox = null;
  var headerTerrainLabel = null;
  var previewTerrain = '';       // the terrain the header currently shows
  // map/positions.txt: every point of the map as the file has it, drawn once
  // the view is close enough; the selected province draws its draft instead.
  var markers = [];              // [{ id, kind, x, y }], y from the bottom of the map
  var draft = null;              // { kind: { x, y } | undefined } of the selected province, as the form holds it
  // Points moved but not written, province by province. They survive moving to
  // the next province, draw on the map, and go out together on Save all.
  var pendingPositions = {};     // province id -> { kind: { x, y } | undefined }
  var draftBaseline = null;      // the selected province's points as the file has them
  var pendingTimer = null;
  var positionInputs = {};       // kind -> { x, y } inputs of the Positions tab, kept in step with a drag
  var MARKER_MIN_SCALE = 4;      // screen pixels per map pixel before positions are drawn
  // Map layers (the box over the bottom-left corner). Country Colors tints
  // every province towards its start-date owner's colour; the pixels the
  // clicks read (image.packed) stay the definition colours.
  var showPositions = true;
  var showCountryColors = false;
  var countryColors = null;      // { owners: { id: TAG }, colors: { TAG: [r, g, b] } } from the extension
  var tintedTiles = null;        // tiles of the tinted bitmap, built the first time the layer is shown
  var SEA_TINT = [150, 190, 230];
  var UNOWNED_TINT = [150, 150, 150];
  var TINT_WEIGHT = 0.82;        // share of the owner's colour (victorianTools.mapEditor.countryColorsTint / 100)
  // Show Rivers: map/rivers.bmp (8-bit, every index below 254 is river) drawn as blue over the map.
  var showRivers = false;
  var riversUri = null;          // webview URI of rivers.bmp, or null when the stack has none
  var riverTiles = null;         // tiles of the river overlay (transparent where there is no river)
  var riversLoading = false;
  var RIVER_COLOR = [47, 128, 255];
  var RIVER_SEA_INDEX = 254;
  var POSITION_KINDS = [
    { kind: 'unit', label: 'Unit', color: '#ff3b30' },
    { kind: 'city', label: 'City', color: '#ffd60a' },
    { kind: 'factory', label: 'Factory', color: '#ff9f0a' },
    { kind: 'fort', label: 'Fort', color: '#30d158' },
    { kind: 'railroad', label: 'Railroad', color: '#0a84ff' },
    { kind: 'naval_base', label: 'Naval base', color: '#bf5af2' }
  ];
  var COLOR_OF = {};
  POSITION_KINDS.forEach(function (spec) { COLOR_OF[spec.kind] = spec.color; });

  var mapArea = document.getElementById('mapArea');
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var tooltip = document.getElementById('tooltip');
  var loading = document.getElementById('loading');
  var layerCountry = document.getElementById('layerCountry');
  var layerPositions = document.getElementById('layerPositions');
  var saveAllButton = document.getElementById('saveAllButton');
  var layerRivers = document.getElementById('layerRivers');
  var side = document.getElementById('side');
  var statusBox = document.getElementById('status');
  var targetBox = document.getElementById('target');

  function setStatus(text, kind) {
    statusBox.textContent = text || '';
    statusBox.className = 'status ' + (kind || '');
  }

  // --- DOM helpers --------------------------------------------------------------
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === undefined || value === null || value === false) { return; }
        if (key === 'class') { node.className = value; }
        else if (key.indexOf('on') === 0) { node.addEventListener(key.slice(2), value); }
        else if (value === true) { node.setAttribute(key, ''); }
        else { node.setAttribute(key, String(value)); }
      });
    }
    for (var index = 2; index < arguments.length; index++) { appendChildren(node, arguments[index]); }
    return node;
  }
  /** The square outlined button that adds a row; the plus is drawn, not typed. */
  function plusButton(title, onClick) {
    return h('button', { class: 'glyph plus', title: title, 'aria-label': title, onclick: onClick });
  }
  function appendChildren(node, child) {
    if (child === undefined || child === null || child === false) { return; }
    if (Array.isArray(child)) { child.forEach(function (item) { appendChildren(node, item); }); return; }
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  function textInput(value, listId, type, extraClass) {
    var input = h('input', { type: type || 'text', list: listId || undefined, class: 'field' + (extraClass ? ' ' + extraClass : ''), spellcheck: 'false' });
    input.value = value === undefined || value === null ? '' : String(value);
    return input;
  }
  /**
   * A datalist input in the pick lists' shell, so its arrow is the same one and
   * still opens the suggestions when clicked.
   */
  function withChevron(input) {
    var wrapper = h('div', { class: 'combo picker' }, input);
    wrapper.addEventListener('mousedown', function (event) { if (event.target === wrapper) { event.preventDefault(); } });
    wrapper.addEventListener('click', function (event) {
      if (event.target !== wrapper) { return; }
      input.focus();
      if (input.showPicker) { try { input.showPicker(); } catch (error) { /* the browser may refuse; the field still takes typing */ } }
    });
    return wrapper;
  }
  /** The element that takes the caret and the placeholder: a plain input, or the one inside a combo. */
  function fieldInput(node) {
    return node.tagName === 'INPUT' ? node : node.querySelector('input');
  }
  /** Grey a part of the form out and stop it taking input: the province cannot have it. */
  function lock(node) {
    node.classList.add('locked');
    node.querySelectorAll('input, select, button, textarea').forEach(function (element) { element.disabled = true; });
  }
  /** The example row steps aside for the first real one; it comes back when the last row goes. */
  function dropGhost(rows) {
    var ghost = rows.querySelector('.row.ghost');
    if (ghost) { ghost.remove(); }
  }
  function valueOf(input) {
    var value = String(input.value).trim();
    return value === '' ? undefined : value;
  }
  function option(value, label) {
    var node = h('option', { value: value }, label);
    return node;
  }
  var COMBO_LIMIT = 80;
  /**
   * A searchable pick list over { id, label } entries: typing filters by id or
   * label, arrows move, Enter picks, Escape reverts. The element's value is
   * the picked id; a value the list lacks is kept (and shown as such), and a
   * typed text that matches nothing is taken as a raw id.
   */
  function selectInput(value, entries, emptyLabel) {
    var byId = new Map();
    entries.forEach(function (entry) { byId.set(entry.id, entry); });
    var input = h('input', { type: 'text', spellcheck: 'false', placeholder: emptyLabel || '' });
    var list = h('div', { class: 'combo-list', hidden: true });
    var wrapper = h('div', { class: 'combo field' }, input, list);
    var selected = '';
    var shown = [];
    var activeIndex = -1;
    function labelOf(id) {
      var entry = byId.get(id);
      return entry ? entry.label : (id === '' ? '' : id + ' (not in the mod)');
    }
    function setValue(id) {
      selected = id === undefined || id === null ? '' : String(id);
      input.value = labelOf(selected);
    }
    function pick(id) {
      setValue(id);
      close();
      wrapper.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function close() { list.hidden = true; activeIndex = -1; }
    function render(filter) {
      var needle = filter.toLowerCase();
      shown = entries.filter(function (entry) {
        return needle === '' || entry.id.toLowerCase().indexOf(needle) !== -1 || entry.label.toLowerCase().indexOf(needle) !== -1;
      }).slice(0, COMBO_LIMIT);
      if (emptyLabel !== undefined && needle === '') { shown.unshift({ id: '', label: emptyLabel, empty: true }); }
      list.replaceChildren();
      shown.forEach(function (entry, index) {
        list.append(h('div', {
          class: 'combo-item' + (index === activeIndex ? ' active' : '') + (entry.empty ? ' empty' : ''),
          onmousedown: function (event) { event.preventDefault(); pick(entry.id); }
        }, entry.label));
      });
      list.hidden = shown.length === 0;
      var active = list.querySelector('.active');
      if (active) { active.scrollIntoView({ block: 'nearest' }); }
    }
    // Only an entry of the list (or nothing) can be picked; other text reverts to the current value.
    function commit() {
      var text = input.value.trim();
      if (text === labelOf(selected)) { return; }
      if (text === '') { pick(''); return; }
      var lower = text.toLowerCase();
      var match = entries.find(function (entry) { return entry.label.toLowerCase() === lower || entry.id.toLowerCase() === lower; });
      if (match) { pick(match.id); } else if (shown.length === 1 && !shown[0].empty) { pick(shown[0].id); } else { setValue(selected); }
    }
    input.addEventListener('focus', function () { input.select(); activeIndex = -1; render(''); });
    input.addEventListener('input', function () { activeIndex = -1; render(input.value.trim()); });
    input.addEventListener('blur', function () { commit(); close(); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) { render(input.value.trim()); }
        activeIndex = Math.max(0, Math.min(shown.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
        render(input.value.trim());
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (activeIndex >= 0 && shown[activeIndex]) { pick(shown[activeIndex].id); } else { commit(); close(); }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setValue(selected);
        close();
      }
    });
    Object.defineProperty(wrapper, 'value', { get: function () { return selected; }, set: function (next) { setValue(next); } });
    wrapper.focus = function () { input.focus(); };
    setValue(value);
    return wrapper;
  }

  // --- Map loading --------------------------------------------------------------
  /** The BMP header fields the decoders need; the name only labels errors. */
  function bmpHeader(buffer, name) {
    var header = new DataView(buffer);
    if (header.getUint16(0, true) !== 0x4d42) { throw new Error(name + ' is not a BMP file.'); }
    var pixelOffset = header.getUint32(10, true);
    var headerSize = header.getUint32(14, true);
    var width, height, bitsPerPixel;
    if (headerSize === 12) {
      width = header.getUint16(18, true); height = header.getInt16(20, true); bitsPerPixel = header.getUint16(24, true);
    } else {
      width = header.getInt32(18, true); height = header.getInt32(22, true); bitsPerPixel = header.getUint16(28, true);
    }
    // Paradox maps are stored upside down on purpose: the game reads the rows as they
    // come, so the view shows them in storage order, which flips a normal BMP vertically.
    return { pixelOffset: pixelOffset, width: width, height: Math.abs(height), bitsPerPixel: bitsPerPixel, storedTopDown: height < 0 };
  }
  function decodeBmp(buffer) {
    var info = bmpHeader(buffer, 'provinces.bmp');
    var pixelOffset = info.pixelOffset, width = info.width, height = info.height, bitsPerPixel = info.bitsPerPixel, storedTopDown = info.storedTopDown;
    if (bitsPerPixel !== 24 && bitsPerPixel !== 32) { throw new Error(bitsPerPixel + '-bit provinces.bmp; only 24-bit and 32-bit maps can be shown.'); }
    var bytesPerPixel = bitsPerPixel / 8;
    var stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
    var bytes = new Uint8Array(buffer);
    var rgba = new Uint8ClampedArray(width * height * 4);
    var packed = new Uint32Array(width * height);
    for (var y = 0; y < height; y++) {
      var source = pixelOffset + (storedTopDown ? height - 1 - y : y) * stride;
      var target = y * width;
      for (var x = 0; x < width; x++) {
        var blue = bytes[source], green = bytes[source + 1], red = bytes[source + 2];
        var out = target * 4;
        rgba[out] = red; rgba[out + 1] = green; rgba[out + 2] = blue; rgba[out + 3] = 255;
        packed[target] = (red << 16) | (green << 8) | blue;
        source += bytesPerPixel; target++;
      }
    }
    return { width: width, height: height, rgba: rgba, packed: packed };
  }
  /** rivers.bmp as a transparent overlay: every palette index below 254 (source, merge, widths) becomes a blue pixel. */
  function decodeRiversBmp(buffer) {
    var info = bmpHeader(buffer, 'rivers.bmp');
    if (info.bitsPerPixel !== 8) { throw new Error(info.bitsPerPixel + '-bit rivers.bmp; the game reads an 8-bit one.'); }
    var width = info.width, height = info.height;
    var stride = Math.ceil(width / 4) * 4;
    var bytes = new Uint8Array(buffer);
    var rgba = new Uint8ClampedArray(width * height * 4);
    for (var y = 0; y < height; y++) {
      var source = info.pixelOffset + (info.storedTopDown ? height - 1 - y : y) * stride;
      var out = y * width * 4;
      for (var x = 0; x < width; x++, source++, out += 4) {
        if (bytes[source] < RIVER_SEA_INDEX) {
          rgba[out] = RIVER_COLOR[0]; rgba[out + 1] = RIVER_COLOR[1]; rgba[out + 2] = RIVER_COLOR[2]; rgba[out + 3] = 255;
        }
      }
    }
    return { width: width, height: height, rgba: rgba };
  }

  function log(message) {
    vscode.postMessage({ type: 'log', message: String(message) });
  }
  function showLoading(text) {
    loading.hidden = false;
    loading.textContent = text;
    log(text);
  }
  function readBody(response) {
    var total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !response.body.getReader) { return response.arrayBuffer(); }
    var reader = response.body.getReader();
    var chunks = [];
    var received = 0;
    function step() {
      return reader.read().then(function (result) {
        if (result.done) {
          var joined = new Uint8Array(received);
          var offset = 0;
          chunks.forEach(function (chunk) { joined.set(chunk, offset); offset += chunk.length; });
          return joined.buffer;
        }
        chunks.push(result.value);
        received += result.value.length;
        showLoading('Loading provinces.bmp… ' + (received / 1048576).toFixed(1) + (total ? ' / ' + (total / 1048576).toFixed(1) : '') + ' MB');
        return step();
      });
    }
    return step();
  }
  function loadMap(bmpUri) {
    showLoading('Loading provinces.bmp…');
    log('fetching ' + bmpUri);
    fetch(bmpUri)
      .then(function (response) {
        log('response ' + response.status + ' ' + (response.headers.get('content-type') || '') + ' ' + (response.headers.get('content-length') || '?') + ' bytes');
        if (!response.ok) { throw new Error('provinces.bmp could not be read (HTTP ' + response.status + ').'); }
        return readBody(response);
      })
      .then(function (buffer) {
        showLoading('Decoding provinces.bmp (' + (buffer.byteLength / 1048576).toFixed(1) + ' MB)…');
        return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () { return decodeBmp(buffer); });
      })
      .then(function (decoded) {
        showLoading('Drawing ' + decoded.width + ' x ' + decoded.height + '…');
        return buildTiles(decoded.rgba, decoded.width, decoded.height, 'Drawing').then(function (tiles) {
          image = { width: decoded.width, height: decoded.height, tiles: tiles, packed: decoded.packed };
          loading.hidden = true;
          fitView();
          render();
          if (showCountryColors && countryColors) { buildTintedTiles(); }
          if (showRivers && riversUri) { loadRivers(); }
          setStatus(decoded.width + ' x ' + decoded.height + ', ' + definitionById.size + ' provinces');
          log('map ready; overlay ' + getComputedStyle(loading).display);
          applyReveal();
        });
      })
      .catch(function (error) {
        var text = error && error.message ? error.message : String(error);
        showLoading('Could not show the map: ' + text);
      });
  }
  window.addEventListener('error', function (event) { showLoading('Page error: ' + (event.message || event.error)); });
  window.addEventListener('unhandledrejection', function (event) { showLoading('Page error: ' + (event.reason && event.reason.message ? event.reason.message : event.reason)); });

  /** Copy pixels into TILE x TILE canvases, one row of tiles per turn of the event loop. */
  function buildTiles(rgba, imageWidth, imageHeight, verb) {
    var tiles = [];
    var rows = Math.ceil(imageHeight / TILE);
    var columns = Math.ceil(imageWidth / TILE);
    var full = new ImageData(rgba, imageWidth, imageHeight);
    return new Promise(function (resolve, reject) {
      var row = 0;
      function next() {
        try {
          for (var column = 0; column < columns; column++) {
            var x = column * TILE, y = row * TILE;
            var width = Math.min(TILE, imageWidth - x), height = Math.min(TILE, imageHeight - y);
            var tile = document.createElement('canvas');
            tile.width = width; tile.height = height;
            var context = tile.getContext('2d');
            if (!context) { throw new Error('The browser refused a ' + width + ' x ' + height + ' canvas.'); }
            context.putImageData(full, -x, -y);
            tiles.push({ x: x, y: y, canvas: tile });
          }
          row++;
          showLoading(verb + ' ' + imageWidth + ' x ' + imageHeight + '… ' + Math.round((row / rows) * 100) + '%');
          if (row < rows) { setTimeout(next, 0); } else { resolve(tiles); }
        } catch (error) { reject(error); }
      }
      next();
    });
  }

  // --- Map layers ---------------------------------------------------------------
  layerPositions.addEventListener('change', function () { showPositions = layerPositions.checked; render(); });
  layerRivers.addEventListener('change', function () {
    showRivers = layerRivers.checked;
    if (showRivers && !riversUri && map) {
      setStatus('The picked mods have no map/rivers.bmp.', 'error');
      showRivers = false; layerRivers.checked = false;
      return;
    }
    if (showRivers && !riverTiles && image) { loadRivers(); }
    render();
  });
  /** Fetch and decode rivers.bmp once; the overlay is kept until the map is reloaded. */
  function loadRivers() {
    if (riversLoading || riverTiles || !riversUri) { return; }
    riversLoading = true;
    var forImage = image;
    showLoading('Loading rivers.bmp…');
    fetch(riversUri)
      .then(function (response) {
        if (!response.ok) { throw new Error('rivers.bmp could not be read (HTTP ' + response.status + ').'); }
        return readBody(response);
      })
      .then(function (buffer) { return decodeRiversBmp(buffer); })
      .then(function (decoded) {
        if (image && (decoded.width !== image.width || decoded.height !== image.height)) {
          setStatus('rivers.bmp is ' + decoded.width + ' x ' + decoded.height + ', the map ' + image.width + ' x ' + image.height, 'error');
        }
        return buildTiles(decoded.rgba, decoded.width, decoded.height, 'Drawing rivers');
      })
      .then(function (tiles) {
        riversLoading = false;
        if (image !== forImage) { return; }
        riverTiles = tiles;
        loading.hidden = true;
        render();
      })
      .catch(function (error) {
        riversLoading = false;
        loading.hidden = true;
        showRivers = false; layerRivers.checked = false;
        setStatus('Could not show rivers: ' + (error && error.message ? error.message : error), 'error');
      });
  }
  layerCountry.addEventListener('change', function () {
    showCountryColors = layerCountry.checked;
    if (showCountryColors && !tintedTiles) { buildTintedTiles(); }
    render();
  });
  /** One tint per province colour: the owner's colour with a share of the province's own, so neighbours still differ. */
  function tintByPacked() {
    var tints = new Map();
    map.definitions.forEach(function (definition) {
      var tag = countryColors.owners[String(definition.id)];
      var base = seaIds.has(definition.id) ? SEA_TINT : (tag && countryColors.colors[tag]) || UNOWNED_TINT;
      var own = definition.color;
      var red = Math.round(TINT_WEIGHT * base[0] + (1 - TINT_WEIGHT) * ((own >> 16) & 255));
      var green = Math.round(TINT_WEIGHT * base[1] + (1 - TINT_WEIGHT) * ((own >> 8) & 255));
      var blue = Math.round(TINT_WEIGHT * base[2] + (1 - TINT_WEIGHT) * (own & 255));
      tints.set(own, (red << 16) | (green << 8) | blue);
    });
    return tints;
  }
  /** Repaint the whole bitmap by owner and cut it into tiles; drawn instead of image.tiles while the layer is on. */
  function buildTintedTiles() {
    if (!image || !countryColors || !map) { return; }
    var packed = image.packed, count = packed.length;
    var rgba = new Uint8ClampedArray(count * 4);
    var tints = tintByPacked();
    var lastColor = -1, lastTint = -1;
    for (var index = 0, out = 0; index < count; index++, out += 4) {
      var color = packed[index];
      if (color !== lastColor) {
        lastColor = color;
        var tint = tints.get(color);
        lastTint = tint === undefined ? color : tint;
      }
      rgba[out] = (lastTint >> 16) & 255; rgba[out + 1] = (lastTint >> 8) & 255; rgba[out + 2] = lastTint & 255; rgba[out + 3] = 255;
    }
    var forImage = image;
    buildTiles(rgba, image.width, image.height, 'Tinting').then(function (tiles) {
      if (image !== forImage) { return; }
      tintedTiles = tiles;
      loading.hidden = true;
      render();
    }).catch(function (error) { showLoading('Could not tint the map: ' + (error && error.message ? error.message : error)); });
  }

  // --- View and rendering -------------------------------------------------------
  function resizeCanvas() {
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(1, Math.floor(mapArea.clientWidth * ratio));
    var height = Math.max(1, Math.floor(mapArea.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }
  function fitView() {
    if (!image) { return; }
    var scale = Math.min(mapArea.clientWidth / image.width, mapArea.clientHeight / image.height);
    view = { scale: scale, x: (mapArea.clientWidth - image.width * scale) / 2, y: (mapArea.clientHeight - image.height * scale) / 2 };
  }
  function render() {
    resizeCanvas();
    var ratio = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) { return; }
    ctx.imageSmoothingEnabled = view.scale < 1;
    ctx.setTransform(ratio * view.scale, 0, 0, ratio * view.scale, ratio * view.x, ratio * view.y);
    var left = -view.x / view.scale, top = -view.y / view.scale;
    var right = left + mapArea.clientWidth / view.scale, bottom = top + mapArea.clientHeight / view.scale;
    var tiles = showCountryColors && tintedTiles ? tintedTiles : image.tiles;
    tiles.forEach(function (tile) {
      if (tile.x + tile.canvas.width < left || tile.x > right || tile.y + tile.canvas.height < top || tile.y > bottom) { return; }
      ctx.drawImage(tile.canvas, tile.x, tile.y);
    });
    if (showRivers && riverTiles) {
      ctx.imageSmoothingEnabled = false;
      riverTiles.forEach(function (tile) {
        if (tile.x + tile.canvas.width < left || tile.x > right || tile.y + tile.canvas.height < top || tile.y > bottom) { return; }
        ctx.drawImage(tile.canvas, tile.x, tile.y);
      });
    }
    if (selection) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(selection.canvas, selection.x, selection.y);
    }
    drawMarkers(left, top, right, bottom);
  }
  // Positions are one map pixel each, so they only appear once a map pixel is
  // a few screen pixels wide. The selected province's points come from the
  // form's draft and get a white rim; a point being edited moves live.
  function drawMarkers(left, top, right, bottom) {
    ctx.imageSmoothingEnabled = false;
    if (showPositions && view.scale >= MARKER_MIN_SCALE) {
      for (var index = 0; index < markers.length; index++) {
        var marker = markers[index];
        if (draft && marker.id === selectedId) { continue; }
        if (pendingPositions[marker.id]) { continue; }
        var px = Math.floor(marker.x), py = Math.floor(image.height - marker.y);
        if (px < left - 1 || px > right || py < top - 1 || py > bottom) { continue; }
        ctx.fillStyle = COLOR_OF[marker.kind];
        ctx.fillRect(px, py, 1, 1);
      }
    }
    // Points edited and not yet written are the edit itself, so neither the zoom
    // nor the layer switch hides them, and below one map pixel they are drawn
    // big enough to see. The province being edited also gets a rim.
    var size = Math.max(1, 3 / view.scale);
    Object.keys(pendingPositions).forEach(function (id) {
      if (Number(id) === selectedId) { return; }
      POSITION_KINDS.forEach(function (spec) {
        var point = pendingPositions[id][spec.kind];
        var x = point ? Number(point.x) : NaN, y = point ? Number(point.y) : NaN;
        if (!isFinite(x) || !isFinite(y)) { return; }
        ctx.fillStyle = spec.color;
        ctx.fillRect(Math.floor(x), Math.floor(image.height - y), size, size);
      });
    });
    if (!draft) { return; }
    var rim = 1.5 / view.scale;
    POSITION_KINDS.forEach(function (spec) {
      if (details && details.isSea && spec.kind !== 'unit') { return; }
      var point = draftPoint(spec.kind);
      if (!point) { return; }
      var x = Math.floor(point.x), y = Math.floor(image.height - point.y);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - rim, y - rim, size + 2 * rim, size + 2 * rim);
      ctx.fillStyle = spec.color;
      ctx.fillRect(x, y, size, size);
    });
  }
  function clonePoints(points) {
    var out = {};
    POSITION_KINDS.forEach(function (spec) {
      var point = points ? points[spec.kind] : undefined;
      out[spec.kind] = point ? { x: String(point.x), y: String(point.y) } : undefined;
    });
    return out;
  }
  function samePoints(one, other) {
    return POSITION_KINDS.every(function (spec) {
      var a = one ? one[spec.kind] : undefined, b = other ? other[spec.kind] : undefined;
      if (!a || !b) { return !a && !b; }
      return String(a.x) === String(b.x) && String(a.y) === String(b.y);
    });
  }
  /** Hold the selected province's points when they no longer match its file, or let them go when they do. */
  function capturePending() {
    if (!details || !draft) { return; }
    if (samePoints(draft, draftBaseline)) { delete pendingPositions[details.id]; }
    else { pendingPositions[details.id] = clonePoints(draft); }
    refreshPending();
  }
  function pendingIds() { return Object.keys(pendingPositions); }
  function refreshPending() {
    var ids = pendingIds();
    saveAllButton.hidden = ids.length === 0;
    saveAllButton.textContent = ids.length === 1 ? 'Save 1 province' : 'Save ' + ids.length + ' provinces';
    if (pendingTimer) { clearTimeout(pendingTimer); }
    pendingTimer = setTimeout(sendPending, 400);
  }
  /** The extension keeps the same list, so closing the tab can still offer to write it. */
  function sendPending() {
    pendingTimer = null;
    vscode.postMessage({ type: 'pending', edits: pendingIds().map(function (id) {
      return { provinceId: Number(id), data: pendingPositions[id] };
    }) });
  }
  /** The draft's point of a kind as numbers, or null when unset or not numeric. */
  function draftPoint(kind) {
    var point = draft ? draft[kind] : null;
    if (!point) { return null; }
    var x = Number(point.x), y = Number(point.y);
    return isFinite(x) && isFinite(y) && point.x !== '' && point.y !== '' ? { x: x, y: y } : null;
  }
  /** The kind of the selected province's point under the pointer, when close enough to grab. */
  function markerAt(clientX, clientY) {
    if (!showPositions || !image || !draft || view.scale < MARKER_MIN_SCALE) { return null; }
    var rect = mapArea.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var best = null, bestDistance = Math.max(6, view.scale / 2 + 2);
    POSITION_KINDS.forEach(function (spec) {
      if (details && details.isSea && spec.kind !== 'unit') { return; }
      var point = draftPoint(spec.kind);
      if (!point) { return; }
      var sx = view.x + (Math.floor(point.x) + 0.5) * view.scale;
      var sy = view.y + (Math.floor(image.height - point.y) + 0.5) * view.scale;
      var distance = Math.hypot(sx - px, sy - py);
      if (distance <= bestDistance) { best = spec.kind; bestDistance = distance; }
    });
    return best;
  }
  /** Move one draft point to a map place (x right, y up from the bottom), and show it in the tab and on the map. */
  function setDraftPoint(kind, x, y) {
    if (!draft || !image) { return; }
    var clampedX = Math.min(image.width, Math.max(0, x)), clampedY = Math.min(image.height, Math.max(0, y));
    draft[kind] = { x: clampedX.toFixed(2), y: clampedY.toFixed(2) };
    var inputs = positionInputs[kind];
    if (inputs) { inputs.x.value = draft[kind].x; inputs.y.value = draft[kind].y; }
    capturePending();
    render();
  }
  /**
   * Where to put a point that should sit "in" the province: its centre of mass,
   * moved to the nearest pixel the province owns, because a crescent-shaped one
   * has its centre outside itself. A map place, y up from the bottom.
   */
  function selectionCenter() {
    if (!selection || !image) { return null; }
    var color = selection.color, packed = image.packed, width = image.width;
    var sumX = 0, sumY = 0, count = 0, y, x, row;
    for (y = selection.y; y < selection.y + selection.height; y++) {
      row = y * width;
      for (x = selection.x; x < selection.x + selection.width; x++) {
        if (packed[row + x] === color) { sumX += x; sumY += y; count++; }
      }
    }
    if (count === 0) { return null; }
    var meanX = sumX / count, meanY = sumY / count;
    var best = null, bestDistance = Infinity;
    for (y = selection.y; y < selection.y + selection.height; y++) {
      row = y * width;
      for (x = selection.x; x < selection.x + selection.width; x++) {
        if (packed[row + x] !== color) { continue; }
        var distance = (x - meanX) * (x - meanX) + (y - meanY) * (y - meanY);
        if (distance < bestDistance) { bestDistance = distance; best = { x: x + 0.5, y: image.height - y - 0.5 }; }
      }
    }
    return best;
  }
  /** Replace what the map knows about one province's points with what the disk now holds. */
  function replaceMarkers(id, positions) {
    markers = markers.filter(function (marker) { return marker.id !== id; });
    if (!positions || !positions.data) { return; }
    POSITION_KINDS.forEach(function (spec) {
      var point = positions.data[spec.kind];
      var x = point ? Number(point.x) : NaN, y = point ? Number(point.y) : NaN;
      if (isFinite(x) && isFinite(y)) { markers.push({ id: id, kind: spec.kind, x: x, y: y }); }
    });
  }
  function toImage(clientX, clientY) {
    var exact = toImageExact(clientX, clientY);
    return { x: Math.floor(exact.x), y: Math.floor(exact.y) };
  }
  function toImageExact(clientX, clientY) {
    var rect = mapArea.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  }
  function provinceAt(point) {
    if (!image || point.x < 0 || point.y < 0 || point.x >= image.width || point.y >= image.height) { return undefined; }
    return idByColor.get(image.packed[point.y * image.width + point.x]);
  }
  function zoomAt(clientX, clientY, factor) {
    if (!image) { return; }
    var rect = mapArea.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var minScale = Math.min(mapArea.clientWidth / image.width, mapArea.clientHeight / image.height) * 0.5;
    var scale = Math.min(64, Math.max(minScale, view.scale * factor));
    var ratio = scale / view.scale;
    view = { scale: scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
    render();
  }

  // --- Interaction --------------------------------------------------------------
  var drag = null;
  mapArea.addEventListener('mousedown', function (event) {
    if (event.button !== 0) { return; }
    // A press on one of the selected province's points moves that point instead of the map.
    var marker = event.target === canvas ? markerAt(event.clientX, event.clientY) : null;
    drag = { startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false, marker: marker };
    mapArea.classList.add(marker ? 'moving' : 'dragging');
  });
  window.addEventListener('mousemove', function (event) {
    if (drag && drag.marker) {
      drag.moved = true;
      var place = toImageExact(event.clientX, event.clientY);
      setDraftPoint(drag.marker, place.x, image.height - place.y);
      return;
    }
    if (drag) {
      var dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; }
      view.x = drag.viewX + dx; view.y = drag.viewY + dy;
      render();
      return;
    }
    showTooltip(event);
  });
  window.addEventListener('mouseup', function (event) {
    if (!drag) { return; }
    var wasClick = !drag.moved && !drag.marker;
    drag = null;
    mapArea.classList.remove('dragging');
    if (wasClick && event.target === canvas) {
      var id = provinceAt(toImage(event.clientX, event.clientY));
      if (id !== undefined) { selectProvince(id); }
    }
  });
  mapArea.addEventListener('mouseleave', function () { tooltip.hidden = true; });
  mapArea.addEventListener('wheel', function (event) {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });
  new ResizeObserver(function () { render(); }).observe(mapArea);

  function showTooltip(event) {
    if (!image || event.target !== canvas) { tooltip.hidden = true; mapArea.classList.remove('moving'); return; }
    var kind = markerAt(event.clientX, event.clientY);
    mapArea.classList.toggle('moving', !!kind);
    var id = kind ? selectedId : provinceAt(toImage(event.clientX, event.clientY));
    if (id === undefined || id === null) { tooltip.hidden = true; return; }
    var definition = definitionById.get(id);
    tooltip.textContent = kind
      ? POSITION_KINDS.filter(function (spec) { return spec.kind === kind; })[0].label + ' · ' + id + ' (drag to move)'
      : id + (definition && definition.name ? ' · ' + definition.name : '') + (seaIds.has(id) ? ' (sea)' : '');
    tooltip.hidden = false;
    var rect = mapArea.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
    tooltip.style.top = (event.clientY - rect.top + 12) + 'px';
  }

  // --- Selection ----------------------------------------------------------------
  function highlightOf(id) {
    var definition = definitionById.get(id);
    if (!definition || !image) { return null; }
    var color = definition.color;
    var packed = image.packed;
    var width = image.width;
    var minX = width, minY = image.height, maxX = -1, maxY = -1;
    for (var index = 0; index < packed.length; index++) {
      if (packed[index] === color) {
        var x = index % width, y = (index - x) / width;
        if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
        if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
      }
    }
    if (maxX < 0) { return null; }
    var boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
    var mask = new Uint8ClampedArray(boxWidth * boxHeight * 4);
    for (var yy = 0; yy < boxHeight; yy++) {
      var rowStart = (minY + yy) * width + minX;
      for (var xx = 0; xx < boxWidth; xx++) {
        if (packed[rowStart + xx] === color) {
          var out = (yy * boxWidth + xx) * 4;
          mask[out] = 255; mask[out + 1] = 255; mask[out + 2] = 255; mask[out + 3] = 150;
        }
      }
    }
    var overlay = document.createElement('canvas');
    overlay.width = boxWidth; overlay.height = boxHeight;
    overlay.getContext('2d').putImageData(new ImageData(mask, boxWidth, boxHeight), 0, 0);
    return { id: id, color: color, canvas: overlay, x: minX, y: minY, width: boxWidth, height: boxHeight };
  }
  function selectProvince(id) {
    capturePending();
    selection = highlightOf(id);
    selectedId = id;
    details = null;
    draft = null;
    render();
    renderSide(id);
    setStatus('Reading province ' + id + '…');
    vscode.postMessage({ type: 'select', provinceId: id, popDate: popDate });
  }
  function centerOn(id) {
    var found = highlightOf(id);
    if (!found) { setStatus('Province ' + id + ' is not on the map.', 'warning'); return; }
    var scale = Math.min(8, Math.max(view.scale, Math.min(mapArea.clientWidth / (found.width * 3), mapArea.clientHeight / (found.height * 3))));
    var centerX = found.x + found.width / 2, centerY = found.y + found.height / 2;
    view = { scale: scale, x: mapArea.clientWidth / 2 - centerX * scale, y: mapArea.clientHeight / 2 - centerY * scale };
    selectProvince(id);
  }
  // The map report gives pixels as an image editor shows them, top-left origin,
  // while the canvas draws the file's rows as the game reads them. That flips y.
  function applyReveal() {
    if (!pendingReveal || !image) { return; }
    var reveal = pendingReveal;
    pendingReveal = null;
    var point = { x: reveal.x, y: image.height - 1 - reveal.y };
    if (point.x < 0 || point.y < 0 || point.x >= image.width || point.y >= image.height) {
      setStatus('Pixel ' + reveal.x + ', ' + reveal.y + ' is outside the map.', 'warning');
      return;
    }
    var scale = Math.max(view.scale, 8);
    view = { scale: scale, x: mapArea.clientWidth / 2 - point.x * scale, y: mapArea.clientHeight / 2 - point.y * scale };
    var id = provinceAt(point);
    var where = reveal.file + ' at ' + reveal.x + ', ' + reveal.y;
    if (id === undefined) {
      render();
      setStatus(where + ': no province there.', 'warning');
      return;
    }
    selectProvince(id);
    setStatus(where + ': province ' + id);
  }

  /** A province by id, else by its definition.csv name: the whole name, then one starting with the text, then one holding it. */
  function findProvince(text) {
    var needle = text.trim().toLowerCase();
    if (needle === '') { return undefined; }
    if (/^[0-9]+$/.test(needle)) { return Number(needle); }
    var exact, starts, holds;
    definitionById.forEach(function (definition, id) {
      var name = String(definition.name || '').toLowerCase();
      if (name === '') { return; }
      if (name === needle) { if (exact === undefined) { exact = id; } }
      else if (name.indexOf(needle) === 0) { if (starts === undefined) { starts = id; } }
      else if (name.indexOf(needle) !== -1) { if (holds === undefined) { holds = id; } }
    });
    return exact !== undefined ? exact : starts !== undefined ? starts : holds;
  }
  function goToProvince() {
    var text = String(document.getElementById('goto').value);
    var id = findProvince(text);
    if (id === undefined) {
      if (text.trim() !== '') { setStatus('No province is called "' + text.trim() + '".', 'warning'); }
      return;
    }
    centerOn(id);
  }
  document.getElementById('gotoButton').addEventListener('click', goToProvince);
  document.getElementById('goto').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { goToProvince(); }
  });
  saveAllButton.addEventListener('click', function () {
    var count = pendingIds().length;
    if (count === 0) { return; }
    sendPending();
    vscode.postMessage({ type: 'saveAll' });
    saveAllButton.disabled = true;
    setStatus('Saving ' + count + (count === 1 ? ' province…' : ' provinces…'));
  });
  document.getElementById('fitButton').addEventListener('click', function () { fitView(); render(); });
  document.getElementById('reloadButton').addEventListener('click', function () { vscode.postMessage({ type: 'reload' }); });

  // --- Side panel ---------------------------------------------------------------
  function renderSide(id) {
    side.replaceChildren();
    var definition = definitionById.get(id);
    var title = details && details.localisation.text ? details.localisation.text : (definition ? definition.name : '');
    var tooltip = 'definition.csv: ' + (definition ? definition.name : '(no row)') + '\nEdits go to ' + map.targetName + '\n' + map.targetRoot;
    var terrain = details ? details.terrain : null;
    var terrainLabel = terrain && terrain.name ? (function () {
      var entry = details.vocabulary.terrains.find(function (item) { return item.id === terrain.name; });
      return entry ? entry.label : terrain.name;
    })() : '';
    headerTerrainLabel = h('span', { class: 'file' }, terrainLabel || map.targetName);
    var heading = h('h1', { title: tooltip + (terrainLabel ? '\nTerrain: ' + terrainLabel + (terrain.fromHistory ? ' (from the history file)' : ' (from terrain.bmp)') : '') },
      title || 'Province ' + id,
      h('span', { class: 'id' }, '- ' + id + ' -'),
      headerTerrainLabel,
      seaIds.has(id) ? h('span', { class: 'badge' }, 'sea') : null);
    headerBox = h('div', { class: 'header' }, heading);
    previewTerrain = terrain && terrain.name ? terrain.name : '';
    if (terrain && terrain.name && terrain.pictureDataUri) { terrainPictures[terrain.name] = terrain.pictureDataUri; }
    applyHeaderPicture(terrain ? terrain.pictureDataUri : null);
    side.append(headerBox);
    if (!details) { side.append(h('p', { class: 'hint' }, 'Loading…')); return; }
    renderDatalists(details.vocabulary);
    // The disk is the truth after every read: the draft restarts from it.
    draft = {};
    POSITION_KINDS.forEach(function (spec) {
      var point = details.positions.data ? details.positions.data[spec.kind] : undefined;
      draft[spec.kind] = point ? { x: point.x, y: point.y } : undefined;
    });
    draftBaseline = clonePoints(draft);
    // An edit made before moving away stays until it is saved or dropped.
    if (pendingPositions[details.id]) { draft = clonePoints(pendingPositions[details.id]); }
    var history = historySections();
    var panes = {
      definition: h('div', null, localisationSection(), history.definition),
      positions: h('div', null, positionsSection()),
      buildings: history.buildings,
      dates: history.dates,
      pops: h('div', null, popsSection())
    };
    var labels = { definition: 'Definition', positions: 'Positions', buildings: 'Buildings', dates: 'Extra Dates', pops: 'Pops' };
    var names = ['definition', 'positions', 'buildings', 'dates', 'pops'];
    // A sea province has no history file and no pops: the game gives it a name
    // and a unit point, so only those two are editable and the rest is locked.
    var closed = {};
    if (details.isSea) {
      lock(history.definition);
      ['buildings', 'dates', 'pops'].forEach(function (name) { lock(panes[name]); closed[name] = true; });
    }
    render();
    if (!panes[activeTab] || closed[activeTab]) { activeTab = 'definition'; }
    var tabs = h('div', { class: 'tabs' }, names.map(function (name) {
      return h('button', { class: 'tab' + (activeTab === name ? ' active' : ''), 'data-tab': name, disabled: closed[name] || undefined, title: closed[name] ? 'A sea province has no ' + labels[name].toLowerCase() : undefined, onclick: function () {
        activeTab = name;
        names.forEach(function (key) { panes[key].hidden = key !== name; });
        tabs.querySelectorAll('button').forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-tab') === name); });
      } }, labels[name]);
    }));
    names.forEach(function (key) { panes[key].hidden = key !== activeTab; });
    side.append(tabs);
    names.forEach(function (name) { side.append(panes[name]); });
  }

  function applyHeaderPicture(uri) {
    if (!headerBox) { return; }
    headerBox.classList.toggle('pictured', !!uri);
    headerBox.style.backgroundImage = uri ? 'linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.55)), url(' + uri + ')' : '';
  }
  /** Show the picture of the terrain the form now holds (or the bitmap's terrain when cleared), fetching it once per map. */
  function showTerrain(name) {
    var effective = name || (details && details.terrain.dominant) || '';
    previewTerrain = effective;
    if (headerTerrainLabel) {
      var entry = details.vocabulary.terrains.find(function (item) { return item.id === effective; });
      headerTerrainLabel.textContent = entry ? entry.label : (effective || map.targetName);
    }
    if (!effective) { applyHeaderPicture(null); return; }
    if (effective in terrainPictures) { applyHeaderPicture(terrainPictures[effective]); return; }
    vscode.postMessage({ type: 'terrainPicture', terrain: effective });
  }

  function renderDatalists(vocabulary) {
    var lists = { ideologies: 'dl-ideologies', buildings: 'dl-buildings', rebelTypes: 'dl-rebeltypes' };
    Object.keys(lists).forEach(function (key) {
      var list = h('datalist', { id: lists[key] });
      (vocabulary[key] || []).forEach(function (name) { list.append(option(name, name)); });
      side.append(list);
    });
  }

  /** Title, file path (grey, trimmed from the left) and an Open File button on one line. */
  function sectionHeader(title, section, whenMissing) {
    var file = section.file;
    var text = !file ? whenMissing : section.inTarget ? file.absolutePath.replace(map.targetRoot, '').replace(/^[\\/]/, '') : file.absolutePath;
    var open = file ? h('button', { class: 'outline', onclick: function () { vscode.postMessage({ type: 'openFile', absolutePath: file.absolutePath, line: file.line }); } }, 'Open File') : null;
    return h('h2', null, h('span', { class: 'title' }, title), h('span', { class: 'file' + (file && section.inTarget ? '' : ' warning'), title: text }, '\u200e' + text), open);
  }
  function layerNote(section) {
    if (!section.file || section.inTarget) { return null; }
    return h('div', { class: 'file warning' }, 'Read from a layer below ' + map.targetName + '; saving writes a copy into it.');
  }
  function saveBar(onSave) {
    var status = h('span', { class: 'status' });
    var button = h('button', { onclick: function () {
      if (saving) { return; }
      saving = true; button.disabled = true; status.textContent = 'Saving…'; status.className = 'status';
      onSave();
    } }, 'Save');
    // Every tab edits one province, so dropping the changes means reading it
    // back from what the server last sent: the file, unchanged.
    var cancel = h('button', { class: 'secondary', title: 'Put every field back as the file has it', onclick: function () {
      if (saving || !details) { return; }
      delete pendingPositions[details.id];
      refreshPending();
      renderSide(details.id);
      setStatus('Changes dropped; the form is back to the file.');
    } }, 'Cancel');
    return { node: h('div', { class: 'actions' }, button, cancel, status), status: status, button: button, cancel: cancel };
  }
  function postSave(payload) {
    payload.type = 'save';
    payload.provinceId = details.id;
    payload.popDate = popDate;
    vscode.postMessage(payload);
  }

  // Localisation
  function localisationSection() {
    var loc = details.localisation;
    var input = textInput(loc.text);
    var rename = h('input', { type: 'checkbox' });
    rename.checked = true;
    var bar = saveBar(function () { postSave({ section: 'localisation', text: input.value, renameHistoryFile: rename.checked }); });
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') { bar.button.click(); } });
    return h('div', { class: 'section' },
      sectionHeader('Localisation', loc, loc.key + ' is not defined; saving adds it to the mod\'s province names file.'),
      layerNote(loc),
      h('div', { class: 'inline' }, h('label', null, loc.key), input, bar.button, bar.cancel, bar.status),
      h('label', { class: 'check' }, rename, 'Rename the history file to match'));
  }

  // History — one form behind four tabs. Cores, Buildings and the dated blocks
  // live in the same history file, so every Save posts the whole form and the
  // tabs never drift.
  function historySections() {
    var history = details.history;
    var form = historyForm(history.data || emptyHistory(), true);
    var folder = null;
    var folderRow = null;
    if (!history.data) {
      folder = h('select', null, (map.historyFolders.length ? map.historyFolders : ['']).map(function (name) { return option(name, name || '(history/provinces)'); }));
      folderRow = h('div', { class: 'grid' }, h('label', null, 'Folder'), folder);
    }
    function pane(title, body) {
      var bar = saveBar(function () { postSave({ section: 'history', data: form.read(), createInFolder: folder ? folder.value : undefined }); });
      return h('div', { class: 'section' }, sectionHeader(title, history, 'No history file; saving creates one'), layerNote(history), body, bar.node);
    }
    return {
      definition: pane('History', h('div', null, folderRow, form.node)),
      buildings: pane('Buildings', form.buildings),
      dates: pane('Extra Dates', form.dated)
    };
  }
  function emptyHistory() {
    return { owner: undefined, controller: undefined, cores: [], removeCores: [], tradeGoods: undefined, lifeRating: undefined, terrain: undefined, colonial: undefined, colony: undefined, isSlave: undefined, buildings: [], partyLoyalty: [], stateBuildings: [], setFlags: [], clrFlags: [], dated: [] };
  }
  // topLevel is the province's own history: it allows dated blocks and hands the
  // Cores, Buildings and dated-block groups back separately, for their own tabs.
  // A dated block keeps every group inside its one node.
  function historyForm(data, topLevel) {
    var vocabulary = details.vocabulary;
    var fields = [
      ['owner', 'Owner', vocabulary.countries], ['controller', 'Controller', vocabulary.countries],
      ['tradeGoods', 'Trade goods', vocabulary.goods], ['lifeRating', 'Life rating', null],
      ['terrain', 'Terrain', vocabulary.terrains], ['colonial', 'Colonial', null], ['colony', 'Colony', null]
    ];
    var inputs = {};
    var grid = h('div', { class: 'grid' });
    fields.forEach(function (spec) {
      inputs[spec[0]] = spec[2] ? selectInput(data[spec[0]], spec[2], '(none)') : textInput(data[spec[0]], null, 'number');
      grid.append(h('label', null, spec[1]), inputs[spec[0]]);
    });
    // Ticked writes is_slave = yes; unticked drops the line (the game's default is no).
    if (topLevel) { inputs.terrain.addEventListener('input', function () { showTerrain(String(inputs.terrain.value)); }); }
    var isSlave = h('input', { type: 'checkbox' });
    isSlave.checked = (data.isSlave || '').toLowerCase() === 'yes';
    grid.append(h('label', null, 'Slave state'), h('div', null, isSlave));
    var cores = listEditor('Cores', data.cores, vocabulary.countries, 'country');
    // Only a dated block edits remove_core: at the start date a core is simply
    // listed or not. A remove_core line already in the file rides along.
    var removeCores = topLevel ? null : listEditor('Remove cores', data.removeCores, vocabulary.countries, 'country');
    var buildings = rowsEditor('Buildings', data.buildings, [['key', 'building', 'dl-buildings'], ['value', 'level', null, 'number', 'narrow']], function () { return { key: '', value: '1' }; });
    var partyLoyalty = rowsEditor('Party loyalty', data.partyLoyalty, [['ideology', 'ideology', 'dl-ideologies'], ['loyaltyValue', 'loyalty', null, 'number', 'narrow']], function () { return { ideology: '', loyaltyValue: '' }; });
    var stateBuildings = rowsEditor('State buildings', data.stateBuildings, [['building', 'building', 'dl-buildings'], ['level', 'level', null, 'number', 'narrow'], ['upgrade', 'upgrade', null, 'text', 'narrow']], function () { return { building: '', level: '1', upgrade: 'yes' }; });
    var dated = topLevel ? datedEditor(data.dated) : null;
    var coresGroup = h('div', { class: 'form' }, cores.node, removeCores ? removeCores.node : null);
    var buildingsGroup = h('div', { class: 'form' }, buildings.node, stateBuildings.node);
    // The province's own cores sit in the Definition tab, under Party loyalty;
    // a dated block keeps every group inside its one node.
    var node = topLevel
      ? h('div', { class: 'form' }, grid, partyLoyalty.node, cores.node)
      : h('div', { class: 'form' }, grid, coresGroup, buildingsGroup, partyLoyalty.node);
    return {
      node: node,
      buildings: buildingsGroup,
      dated: dated ? dated.node : null,
      read: function () {
        return {
          owner: valueOf(inputs.owner), controller: valueOf(inputs.controller),
          cores: cores.read(), removeCores: removeCores ? removeCores.read() : (data.removeCores || []),
          tradeGoods: valueOf(inputs.tradeGoods), lifeRating: valueOf(inputs.lifeRating), terrain: valueOf(inputs.terrain),
          colonial: valueOf(inputs.colonial), colony: valueOf(inputs.colony), isSlave: isSlave.checked ? 'yes' : undefined,
          buildings: buildings.read(), partyLoyalty: partyLoyalty.read(), stateBuildings: stateBuildings.read(),
          // Province flags are not edited here; the ones in the file are kept as they are.
          setFlags: data.setFlags || [], clrFlags: data.clrFlags || [], dated: dated ? dated.read() : []
        };
      }
    };
  }
  // An empty list still shows one row, dimmed and with the field named in its
  // placeholder; the first keystroke wakes it, and it is dropped on save.
  function listEditor(title, values, entries, placeholder) {
    var rows = h('div', { class: 'rows' });
    function addRow(value, ghost) {
      var input = entries ? selectInput(value, entries, '(pick)') : textInput(value, null);
      var row = h('div', { class: 'row' + (ghost ? ' ghost' : '') }, input, h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); keepOne(); } }, '×'));
      if (ghost) {
        fieldInput(input).placeholder = placeholder || '';
        row.addEventListener('input', function () { row.classList.remove('ghost'); });
      }
      rows.append(row);
      return input;
    }
    function keepOne() { if (!rows.children.length) { addRow('', true); } }
    (values || []).forEach(function (value) { addRow(value); });
    keepOne();
    var node = h('div', { class: 'group' }, h('h3', null, title, plusButton('Add to ' + title, function () { dropGhost(rows); fieldInput(addRow('')).focus(); })), rows);
    return { node: node, read: function () { return Array.prototype.map.call(rows.querySelectorAll('.field'), function (field) { return String(field.value).trim(); }).filter(function (value) { return value !== ''; }); } };
  }
  function rowsEditor(title, items, columns, blank, options) {
    options = options || {};
    var rows = h('div', { class: 'rows' });
    function addRow(item, ghost) {
      var inputs = columns.map(function (column) {
        var input = column[5] ? selectInput(item[column[0]], column[5], '(pick)') : textInput(item[column[0]], column[2], column[3], column[4]);
        if (column[4]) { input.classList.add(column[4]); }
        return input;
      });
      // inputs stays the list of fields, in column order, for readRow; a
      // suggestion field goes into the page inside its chevron shell.
      var fields = inputs.map(function (input, index) { return columns[index][2] ? withChevron(input) : input; });
      var row = h('div', { class: 'row' + (ghost ? ' ghost' : '') }, fields,
        options.duplicate ? h('button', { class: 'secondary icon', title: 'Duplicate', onclick: function () { addRow(readRow(row)); } }, '⧉') : null,
        h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); keepOne(); rows.dispatchEvent(new Event('input', { bubbles: true })); } }, '×'));
      if (ghost) {
        // The column heads name the fields; an empty table repeats them in the row.
        inputs.forEach(function (input, index) { fieldInput(input).placeholder = columns[index][1]; });
        row.addEventListener('input', function () { row.classList.remove('ghost'); });
      }
      // Fields the table does not show (a pop's militancy, rebel_type) ride along unchanged.
      row.hiddenFields = {};
      Object.keys(item).forEach(function (key) { if (!columns.some(function (column) { return column[0] === key; })) { row.hiddenFields[key] = item[key]; } });
      rows.append(row);
      return row;
    }
    function readRow(row) {
      var inputs = row.querySelectorAll('.field');
      var out = Object.assign({}, row.hiddenFields || {});
      columns.forEach(function (column, index) { out[column[0]] = inputs[index] ? String(inputs[index].value).trim() : ''; });
      return out;
    }
    function keepOne() { if (!rows.children.length) { addRow({}, true); } }
    (items || []).forEach(function (item) { addRow(item); });
    keepOne();
    var head = h('div', { class: 'head' }, columns.map(function (column) { return h('span', { class: column[4] || undefined }, column[1]); }));
    var node = h('div', { class: 'group' }, h('h3', null, title, plusButton('Add to ' + title, function () { dropGhost(rows); addRow(blank()).querySelector('input').focus(); })), head, rows);
    return {
      node: node, rows: rows,
      read: function () { return Array.prototype.map.call(rows.children, readRow).filter(function (item) { return item[columns[0][0]] !== ''; }); }
    };
  }
  function datedEditor(blocks) {
    var rows = h('div', { class: 'rows' });
    var forms = [];
    function addBlock(block) {
      var date = textInput(block.date);
      var form = historyForm(block.entries, false);
      var entry = { date: date, form: form };
      forms.push(entry);
      var node = h('details', { class: 'dated' },
        h('summary', null, 'Dated block ', date, h('span', { class: 'spacer' }), h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function (event) { event.preventDefault(); forms.splice(forms.indexOf(entry), 1); node.remove(); } }, '×')),
        form.node);
      date.addEventListener('click', function (event) { event.preventDefault(); });
      rows.append(node);
      return node;
    }
    (blocks || []).forEach(addBlock);
    var node = h('div', { class: 'group' }, h('h3', null, 'Dated blocks', plusButton('Add a dated block', function () { addBlock({ date: '1861.1.1', entries: emptyHistory() }).open = true; })), rows);
    return {
      node: node,
      read: function () {
        return forms.map(function (entry) { return { date: entry.date.value.trim(), entries: entry.form.read() }; }).filter(function (block) { return block.date !== ''; });
      }
    };
  }

  // Positions: one row per kind, the swatch doubling as the map legend. Typing
  // moves the point on the map at once; dragging the point fills the row.
  function positionsSection() {
    var section = details.positions;
    positionInputs = {};
    var rows = h('div', { class: 'rows' });
    POSITION_KINDS.forEach(function (spec) {
      var point = draft[spec.kind];
      var x = textInput(point ? point.x : '', null, 'number');
      var y = textInput(point ? point.y : '', null, 'number');
      x.step = '0.01'; y.step = '0.01'; x.placeholder = 'x'; y.placeholder = 'y';
      function changed() {
        var xText = x.value.trim(), yText = y.value.trim();
        draft[spec.kind] = xText !== '' && yText !== '' ? { x: xText, y: yText } : undefined;
        capturePending();
        render();
      }
      x.addEventListener('input', changed);
      y.addEventListener('input', changed);
      var swatch = h('span', { class: 'swatch', title: spec.label });
      swatch.style.background = spec.color;
      var clear = h('button', { class: 'secondary icon remove', title: 'Clear ' + spec.label, onclick: function () { x.value = ''; y.value = ''; changed(); } }, '×');
      var center = h('button', { class: 'glyph center', title: 'Put ' + spec.label + ' in the middle of the province', 'aria-label': 'Center ' + spec.label, onclick: function () {
        var point = selectionCenter();
        if (!point) { setStatus('The province has no pixels to centre on.', 'warning'); return; }
        setDraftPoint(spec.kind, point.x, point.y);
      } });
      positionInputs[spec.kind] = { x: x, y: y };
      var row = h('div', { class: 'row pos-row' }, swatch, h('span', { class: 'pos-label' }, spec.label), center, x, y, clear);
      // A sea province only ever carries the unit point; the rest is land's.
      if (details.isSea && spec.kind !== 'unit') { lock(row); }
      rows.append(row);
    });
    var bar = saveBar(function () {
      var data = {};
      POSITION_KINDS.forEach(function (spec) { data[spec.kind] = draft[spec.kind]; });
      postSave({ section: 'positions', data: data });
    });
    return h('div', { class: 'section' },
      sectionHeader('Positions', section, 'No entry in map/positions.txt; saving adds one'),
      layerNote(section),
      h('p', { class: 'hint' }, details.isSea
        ? 'A sea province carries one point: where the game draws fleets in it. y counts from the bottom of the map. Zoom in until the point shows; drag it to move it, or type here.'
        : 'Where the game draws the province\'s unit, city, factory and buildings. y counts from the bottom of the map. Zoom in until the points show; drag one to move it, or type here.'),
      h('div', { class: 'head pos-head' }, h('span', null, 'x'), h('span', null, 'y')),
      rows,
      bar.node);
  }

  // Pops
  function popsSection() {
    var pops = details.pops;
    var parts = [sectionHeader('Pops', pops, 'No pops in history/pops/' + popDate + '; pick a file below'), layerNote(pops)];
    if (map.popDates.length > 1) {
      var dateSelect = h('select', { onchange: function () { popDate = dateSelect.value; selectProvince(details.id); } }, map.popDates.map(function (date) { return option(date, date); }));
      dateSelect.value = popDate;
      parts.push(h('div', { class: 'grid' }, h('label', null, 'Start date'), dateSelect));
    }
    var fileInput = null;
    if (!pops.pops) {
      var listId = 'dl-popfiles';
      var list = h('datalist', { id: listId }, (map.popFiles[popDate] || []).map(function (name) { return option(name, name); }));
      fileInput = textInput('', listId);
      fileInput.placeholder = 'Existing or new file name';
      parts.push(list, h('div', { class: 'grid' }, h('label', null, 'File'), withChevron(fileInput)));
    }
    var vocabulary = details.vocabulary;
    var table = rowsEditor('Pops', pops.pops || [], [
      ['type', 'type', null, null, null, vocabulary.popTypes], ['culture', 'culture', null, null, null, vocabulary.cultures],
      ['religion', 'religion', null, null, null, vocabulary.religions], ['size', 'size', null, 'number', 'narrow']
    ], function () { return { type: 'farmers', culture: '', religion: '', size: '1000' }; }, { duplicate: true });
    var total = h('div', { class: 'total' });
    function updateTotal() {
      var sum = table.read().reduce(function (acc, pop) { return acc + (Number(pop.size) || 0); }, 0);
      total.textContent = 'Total size: ' + sum.toLocaleString();
    }
    table.rows.addEventListener('input', updateTotal);
    updateTotal();
    var bar = saveBar(function () {
      var rows = table.read().map(function (pop) { return { type: pop.type, culture: pop.culture, religion: pop.religion, size: pop.size, militancy: pop.militancy || undefined, rebelType: pop.rebelType || undefined }; });
      postSave({ section: 'pops', pops: rows, createInFile: fileInput ? fileInput.value : undefined });
    });
    parts.push(table.node, total, bar.node);
    return h('div', { class: 'section' }, parts);
  }

  // --- Messages from the extension ----------------------------------------------
  window.addEventListener('message', function (event) {
    var message = event.data || {};
    try { handleMessage(message); } catch (error) { showLoading('Page error: ' + (error && error.message ? error.message : error)); }
  });
  function handleMessage(message) {
    if (message.type === 'map') {
      map = message.map;
      idByColor = new Map(); definitionById = new Map(); seaIds = new Set(map.seaProvinces);
      map.definitions.forEach(function (definition) { idByColor.set(definition.color, definition.id); definitionById.set(definition.id, definition); });
      popDate = map.popDates[0] || '';
      terrainPictures = {};
      targetBox.textContent = map.targetName;
      selection = null; selectedId = null; details = null; draft = null; markers = [];
      pendingPositions = {}; draftBaseline = null; refreshPending();
      countryColors = null; tintedTiles = null;
      riversUri = message.riversUri || null; riverTiles = null; riversLoading = false;
      side.replaceChildren(h('p', { class: 'hint' }, 'Click a province on the map to edit it.'));
      loadMap(message.bmpUri);
    } else if (message.type === 'revealPixel') {
      pendingReveal = { file: message.file, x: message.x, y: message.y };
      applyReveal();
    } else if (message.type === 'details') {
      // Two clicks in a row race: a late answer would redraw the province we
      // left, terrain picture and all, over the one we are now on.
      if (selectedId !== message.details.id) { return; }
      details = message.details;
      replaceMarkers(details.id, details.positions);
      renderSide(details.id);
      setStatus('Province ' + details.id);
    } else if (message.type === 'positions') {
      markers = message.markers || [];
      render();
    } else if (message.type === 'settings') {
      var weight = Math.min(100, Math.max(0, Number(message.countryColorsTint))) / 100;
      if (isFinite(weight) && weight !== TINT_WEIGHT) {
        TINT_WEIGHT = weight;
        tintedTiles = null;
        if (showCountryColors) { buildTintedTiles(); }
        render();
      }
    } else if (message.type === 'countryColors') {
      countryColors = { owners: message.owners || {}, colors: message.colors || {} };
      tintedTiles = null;
      if (showCountryColors) { buildTintedTiles(); }
    } else if (message.type === 'saved') {
      saving = false;
      var result = message.result;
      if (result.ok) {
        delete pendingPositions[result.details.id];
        refreshPending();
        replaceMarkers(result.details.id, result.details.positions);
        if (selectedId !== result.details.id) { setStatus('Saved province ' + result.details.id, 'ok'); render(); return; }
        details = result.details;
        renderSide(details.id);
        setStatus(result.written.length ? 'Saved ' + result.written.map(function (file) { return file.split(/[\\/]/).pop(); }).join(', ') : 'Nothing to save', 'ok');
      } else {
        side.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
        setStatus(result.reason, 'error');
      }
    } else if (message.type === 'savedAll') {
      saveAllButton.disabled = false;
      (message.written || []).forEach(function (id) {
        // The file now holds what was pending, so the map reads it from there again.
        if (pendingPositions[id]) { replaceMarkers(id, { data: pendingPositions[id] }); }
        delete pendingPositions[id];
        if (details && details.id === id) { draftBaseline = clonePoints(draft); }
      });
      refreshPending();
      var failed = message.failed || [];
      setStatus(failed.length
        ? failed.length + ' province(s) could not be saved; they are still held.'
        : 'Saved ' + (message.written || []).length + ' province(s)', failed.length ? 'error' : 'ok');
      render();
    } else if (message.type === 'error') {
      saving = false;
      setStatus(message.message, 'error');
    } else if (message.type === 'terrainPicture') {
      terrainPictures[message.terrain] = message.pictureDataUri || null;
      if (message.terrain === previewTerrain) { applyHeaderPicture(message.pictureDataUri || null); }
    }
  }
  vscode.postMessage({ type: 'ready' });
})();
`;
