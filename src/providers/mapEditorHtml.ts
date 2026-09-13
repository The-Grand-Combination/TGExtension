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
export function mapEditorHtml(cspSource: string, scriptUri: string): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src ${cspSource} 'nonce-${nonce}'; connect-src ${cspSource}; img-src ${cspSource} data: blob:;">
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
    <div id="mapControls">
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
      </div>
      <button id="saveAllButton" title="Write every province whose positions were moved and not saved" hidden></button>
    </div>
    <div id="loading">Loading provinces.bmp…</div>
  </div>
  <div id="side"><p class="hint">Click a province on the map to edit it.</p></div>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
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
  /* The overlay controls sit bottom-left. Save all is a sibling of the options
     box rather than a child of it: its label carries a province count, and a
     child that wide would stretch the box every time the count changed. */
  #mapControls { position: absolute; left: 10px; bottom: 10px; display: flex; align-items: flex-end; gap: 8px; max-width: calc(100% - 20px); user-select: none; }
  #layers { flex: none; display: flex; flex-direction: column; gap: 4px; padding: 6px 10px; background: rgba(30, 30, 30, 0.6); color: #eee; border-radius: 4px; font-size: 0.9em; }
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
  #saveAllButton { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; }
  #saveAllButton[hidden] { display: none; }
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
  label.check { display: flex; gap: 6px; align-items: center; opacity: 0.9; margin-top: 2px; position: relative; top: 2px; }
  .tabs { display: flex; gap: 2px; margin: 10px 0 4px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .tabs button { background: transparent; color: var(--vscode-foreground); opacity: 0.7; border-radius: 0; padding: 6px 14px; border-bottom: 2px solid transparent; }
  .tabs button:hover { background: var(--vscode-list-hoverBackground); }
  .tabs button.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
  .tabs button:disabled { opacity: 0.35; cursor: default; }
  .tabs button:disabled:hover { background: transparent; }
  /* A part of the form the province cannot have: greyed, and it takes no input. */
  .locked { opacity: 0.5; }
`;
