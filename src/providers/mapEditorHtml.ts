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
      <div id="controlStack">
        <div id="tools">
          <div class="pad">
            <button id="toolHand" class="tool hand" title="Move the map, and click a province to edit it"></button>
            <button id="toolPencil" class="tool pencil" title="Paint the chosen colour over what you draw on"></button>
            <button id="toolDraw" class="tool draw" title="Draw a line out of a province of the chosen colour and back into it: what the line closes off is filled"></button>
            <button id="toolBucket" class="tool bucket" title="Give the chosen colour to everything that touches the pixel you click"></button>
            <button id="toolPick" class="tool pick" title="Take the colour of the pixel you click"></button>
          </div>
          <label id="brushRow" class="size slider" title="Brush width, in map pixels">
            <span class="range"><input id="brushSize" type="range" min="1" max="16" step="1" value="1"></span>
            <span id="brushSizeValue" class="readout">1</span>
          </label>
          <div class="tint">
            <input id="paintColor" type="color" value="#ff0000" title="The colour the pencil and the bucket paint with">
            <span id="paintColorText">#ff0000</span>
          </div>
          <div class="actions">
            <button id="savePaintButton" class="secondary" title="Write the painted pixels into map/provinces.bmp">Save</button>
            <button id="resetPaintButton" class="secondary" title="Put every painted pixel back the way the file has it">Reset</button>
          </div>
        </div>
        <div id="layers">
          <label><input type="checkbox" id="layerCountry"> Country Colors</label>
          <label><input type="checkbox" id="layerRivers"> Show Rivers</label>
          <label><input type="checkbox" id="layerPositions" checked> Positions</label>
          <div class="actions">
            <button id="fitButton" class="secondary" title="Fit the whole map in the view">Fit</button>
            <button id="reloadButton" class="secondary" title="Re-read the map and the mod files">Reload</button>
          </div>
          <div class="find">
            <input id="goto" type="text" spellcheck="false" placeholder="ID / Name" title="Center the map on a province: its id, or a name from definition.csv">
            <button id="gotoButton" class="secondary">Go</button>
          </div>
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
  /* The box is only as wide as its widest layer name: the buttons and the search
     under it share that width rather than each asking for one of its own. */
  #layers { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 6px 10px; background: rgba(30, 30, 30, 0.6); color: #eee; border-radius: 4px; font-size: 0.9em; }
  #layers label { display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
  #layers input { margin: 0; }
  #layers .actions { display: flex; gap: 6px; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.15); }
  #layers .actions button { flex: 1 1 0; min-width: 0; padding: 2px 4px; }
  /* The tool box sits over the layers box and takes its width: the tools are a
     2 x 2 pad, so the box below is always the wider of the two. */
  #controlStack { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
  /* Zero wide, then as wide as the stack: the box below decides the width, and
     a long Save label can never push the two boxes apart. */
  #tools { width: 0; min-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 5px; padding: 6px 10px; background: rgba(30, 30, 30, 0.6); color: #eee; border-radius: 4px; font-size: 0.9em; }
  #tools .pad { display: grid; grid-template-columns: repeat(3, 26px); gap: 3px; }
  #tools .tool { width: 26px; height: 24px; padding: 0; display: inline-flex; background: transparent; border-radius: 3px; opacity: 0.75; }
  /* The glyphs are VS Code's own codicons (grabber, edit-compact, share-window,
     paintcan, copy), drawn as masks so they take the box's colour. */
  #tools .tool::before { content: ''; margin: auto; width: 15px; height: 15px; background-color: #eee; }
  #tools .tool:hover { opacity: 1; background: rgba(255, 255, 255, 0.14); }
  #tools .tool.active { opacity: 1; background: var(--vscode-button-background, #0e639c); }
  #tools .hand::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2.5 9H13.5C13.7761 9 14 9.22386 14 9.5C14 9.74546 13.8231 9.94961 13.5899 9.99194L13.5 10H2.5C2.22386 10 2 9.77614 2 9.5C2 9.25454 2.17688 9.05039 2.41012 9.00806L2.5 9H13.5H2.5ZM2.5 6H13.5C13.7761 6 14 6.22386 14 6.5C14 6.74546 13.8231 6.94961 13.5899 6.99194L13.5 7H2.5C2.22386 7 2 6.77614 2 6.5C2 6.25454 2.17688 6.05039 2.41012 6.00806L2.5 6H13.5H2.5Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2.5 9H13.5C13.7761 9 14 9.22386 14 9.5C14 9.74546 13.8231 9.94961 13.5899 9.99194L13.5 10H2.5C2.22386 10 2 9.77614 2 9.5C2 9.25454 2.17688 9.05039 2.41012 9.00806L2.5 9H13.5H2.5ZM2.5 6H13.5C13.7761 6 14 6.22386 14 6.5C14 6.74546 13.8231 6.94961 13.5899 6.99194L13.5 7H2.5C2.22386 7 2 6.77614 2 6.5C2 6.25454 2.17688 6.05039 2.41012 6.00806L2.5 6H13.5H2.5Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .pencil::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.62999 0C10.9399 9.73611e-05 12.0098 1.07 12.0099 2.37988C12.0099 3.00987 11.7594 3.60957 11.3194 4.05957L10.6896 4.67969L4.50988 10.8604C4.2899 11.0803 3.99948 11.2396 3.68956 11.3096L0.620227 11.9902C0.620227 11.9902 0.549888 12 0.509876 12H0.50011C0.37011 12 0.239524 11.9496 0.149524 11.8496C0.0297368 11.7296 -0.0203258 11.5595 0.0196415 11.3896L0.699329 8.32031C0.769311 8.01039 0.919624 7.72997 1.14952 7.5L7.94933 0.700195C8.39933 0.250195 8.99999 0 9.62999 0ZM1.83995 8.20996C1.74995 8.29996 1.69027 8.41004 1.66027 8.54004L1.14952 10.8398L3.44933 10.3301C3.56914 10.3001 3.68946 10.2402 3.77941 10.1504L9.60949 4.32031L7.67003 2.37988L1.83995 8.20996ZM9.62023 1C9.25023 1 8.90952 1.14039 8.64952 1.40039L8.38488 1.66504L10.3341 3.61426L10.5997 3.34961C10.8596 3.08962 11.0001 2.73981 11.0001 2.37988C11 1.62007 10.38 1.00022 9.62023 1Z'/%3E%3C/svg%3E") center / 12px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.62999 0C10.9399 9.73611e-05 12.0098 1.07 12.0099 2.37988C12.0099 3.00987 11.7594 3.60957 11.3194 4.05957L10.6896 4.67969L4.50988 10.8604C4.2899 11.0803 3.99948 11.2396 3.68956 11.3096L0.620227 11.9902C0.620227 11.9902 0.549888 12 0.509876 12H0.50011C0.37011 12 0.239524 11.9496 0.149524 11.8496C0.0297368 11.7296 -0.0203258 11.5595 0.0196415 11.3896L0.699329 8.32031C0.769311 8.01039 0.919624 7.72997 1.14952 7.5L7.94933 0.700195C8.39933 0.250195 8.99999 0 9.62999 0ZM1.83995 8.20996C1.74995 8.29996 1.69027 8.41004 1.66027 8.54004L1.14952 10.8398L3.44933 10.3301C3.56914 10.3001 3.68946 10.2402 3.77941 10.1504L9.60949 4.32031L7.67003 2.37988L1.83995 8.20996ZM9.62023 1C9.25023 1 8.90952 1.14039 8.64952 1.40039L8.38488 1.66504L10.3341 3.61426L10.5997 3.34961C10.8596 3.08962 11.0001 2.73981 11.0001 2.37988C11 1.62007 10.38 1.00022 9.62023 1Z'/%3E%3C/svg%3E") center / 12px no-repeat; }
  #tools .draw::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M14 1H6C4.9 1 4 1.9 4 3V5H2C0.9 5 0 5.9 0 7V13C0 14.1 0.9 15 2 15H10C11.1 15 12 14.1 12 13V11H14C15.1 11 16 10.1 16 9V3C16 1.9 15.1 1 14 1ZM11 13C11 13.55 10.55 14 10 14H2C1.45 14 1 13.55 1 13V7C1 6.45 1.45 6 2 6H4V9C4 10.1 4.9 11 6 11H11V13ZM15 9C15 9.55 14.55 10 14 10H12V7C12 5.9 11.1 5 10 5H5V3C5 2.45 5.45 2 6 2H14C14.55 2 15 2.45 15 3V9Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M14 1H6C4.9 1 4 1.9 4 3V5H2C0.9 5 0 5.9 0 7V13C0 14.1 0.9 15 2 15H10C11.1 15 12 14.1 12 13V11H14C15.1 11 16 10.1 16 9V3C16 1.9 15.1 1 14 1ZM11 13C11 13.55 10.55 14 10 14H2C1.45 14 1 13.55 1 13V7C1 6.45 1.45 6 2 6H4V9C4 10.1 4.9 11 6 11H11V13ZM15 9C15 9.55 14.55 10 14 10H12V7C12 5.9 11.1 5 10 5H5V3C5 2.45 5.45 2 6 2H14C14.55 2 15 2.45 15 3V9Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .bucket::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.49998 1C7.77613 1 7.99998 1.22386 7.99998 1.5V2.42763C8.15702 2.4998 8.30415 2.60053 8.43355 2.72983L12.1458 6.43921C12.7319 7.02493 12.7321 7.97499 12.1462 8.56093L7.0781 13.629C6.48218 14.2249 5.51243 14.2131 4.93123 13.6028L1.31095 9.80152C0.749447 9.21194 0.760786 8.28209 1.3365 7.70638L6.31263 2.73023C6.50977 2.53309 6.74814 2.4023 6.99998 2.33785V1.5C6.99998 1.22386 7.22384 1 7.49998 1ZM6.99998 4.5V3.4571L2.45709 8H11.2929L11.4391 7.85383C11.6344 7.65851 11.6343 7.34182 11.4389 7.14658L7.99998 3.71027V4.5C7.99998 4.77614 7.77613 5 7.49998 5C7.22384 5 6.99998 4.77614 6.99998 4.5ZM1.95461 9C1.97565 9.03992 2.00247 9.07761 2.03509 9.11187L5.65537 12.9132C5.8491 13.1166 6.17235 13.1205 6.37099 12.9219L10.2929 9H1.95461ZM12.9211 10.222C12.6981 9.96719 12.3018 9.96719 12.0789 10.222L10.9285 11.5367C9.74705 12.8869 10.7059 15 12.5 15C14.2941 15 15.2529 12.8869 14.0715 11.5367L12.9211 10.222ZM11.681 12.1952L12.5 11.2593L13.3189 12.1952C13.9346 12.8989 13.4349 14 12.5 14C11.5651 14 11.0654 12.8989 11.681 12.1952Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.49998 1C7.77613 1 7.99998 1.22386 7.99998 1.5V2.42763C8.15702 2.4998 8.30415 2.60053 8.43355 2.72983L12.1458 6.43921C12.7319 7.02493 12.7321 7.97499 12.1462 8.56093L7.0781 13.629C6.48218 14.2249 5.51243 14.2131 4.93123 13.6028L1.31095 9.80152C0.749447 9.21194 0.760786 8.28209 1.3365 7.70638L6.31263 2.73023C6.50977 2.53309 6.74814 2.4023 6.99998 2.33785V1.5C6.99998 1.22386 7.22384 1 7.49998 1ZM6.99998 4.5V3.4571L2.45709 8H11.2929L11.4391 7.85383C11.6344 7.65851 11.6343 7.34182 11.4389 7.14658L7.99998 3.71027V4.5C7.99998 4.77614 7.77613 5 7.49998 5C7.22384 5 6.99998 4.77614 6.99998 4.5ZM1.95461 9C1.97565 9.03992 2.00247 9.07761 2.03509 9.11187L5.65537 12.9132C5.8491 13.1166 6.17235 13.1205 6.37099 12.9219L10.2929 9H1.95461ZM12.9211 10.222C12.6981 9.96719 12.3018 9.96719 12.0789 10.222L10.9285 11.5367C9.74705 12.8869 10.7059 15 12.5 15C14.2941 15 15.2529 12.8869 14.0715 11.5367L12.9211 10.222ZM11.681 12.1952L12.5 11.2593L13.3189 12.1952C13.9346 12.8989 13.4349 14 12.5 14C11.5651 14 11.0654 12.8989 11.681 12.1952Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .pick::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 5V12.73C2.4 12.38 2 11.74 2 11V5C2 2.79 3.79 1 6 1H9C9.74 1 10.38 1.4 10.73 2H6C4.35 2 3 3.35 3 5ZM11 15H6C4.897 15 4 14.103 4 13V5C4 3.897 4.897 3 6 3H11C12.103 3 13 3.897 13 5V13C13 14.103 12.103 15 11 15ZM12 5C12 4.448 11.552 4 11 4H6C5.448 4 5 4.448 5 5V13C5 13.552 5.448 14 6 14H11C11.552 14 12 13.552 12 13V5Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 5V12.73C2.4 12.38 2 11.74 2 11V5C2 2.79 3.79 1 6 1H9C9.74 1 10.38 1.4 10.73 2H6C4.35 2 3 3.35 3 5ZM11 15H6C4.897 15 4 14.103 4 13V5C4 3.897 4.897 3 6 3H11C12.103 3 13 3.897 13 5V13C13 14.103 12.103 15 11 15ZM12 5C12 4.448 11.552 4 11 4H6C5.448 4 5 4.448 5 5V13C5 13.552 5.448 14 6 14H11C11.552 14 12 13.552 12 13V5Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .size { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  /* The brush slider is the panel's own, narrowed and with no field behind it:
     the box it would draw is a black slab over the translucent controls. */
  #tools .size .readout { flex: 0 0 14px; }
  #tools .size input[type=range] { background: transparent; border-color: transparent; }
  #tools .size.off { opacity: 0.4; }
  /* The colour the brush writes: picked from the map with the eye drop, or chosen outright. */
  #tools .tint { display: flex; align-items: center; gap: 6px; }
  #tools .tint input { width: 36px; height: 20px; padding: 0 1px; }
  #tools .tint span { font-family: var(--vscode-editor-font-family); opacity: 0.85; }
  #tools .actions { display: flex; gap: 6px; }
  #tools .actions button { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 2px 4px; }
  #mapArea.painting { cursor: crosshair; }
  #mapArea.picking { cursor: copy; }
  /* The middle button pans under every tool, so it shows the hand it would with the hand. */
  #mapArea.dragging.painting, #mapArea.dragging.picking { cursor: grabbing; }
  /* The scrollbar gutter is always reserved and stands in for the right padding:
     a list growing past the window gets its bar where the margin already was, so
     nothing under it moves and no empty strip is left when there is no bar. */
  #side { width: 420px; flex: none; overflow-y: auto; scrollbar-gutter: stable; border-left: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); padding: 14px 0 24px 14px; box-sizing: border-box; }
  /* The picture keeps the panel's own margin on every side, so it lines up with
     the text under it and stands the same distance off the top. */
  .header { margin: 0; padding: 0; background-size: cover; background-position: center; }
  .header.pictured { padding: 12px 14px 10px; aspect-ratio: 374 / 94; display: flex; align-items: flex-end; color: #fff; text-shadow: 0 1px 3px #000, 0 0 8px #000; box-sizing: border-box; }
  .header.pictured .file, .header.pictured .id { opacity: 0.95; }
  h1 { font-size: 1.2em; margin: 6px 0 2px; display: flex; align-items: baseline; gap: 8px; min-width: 0; white-space: nowrap; }
  .header.pictured h1 { margin: 0; flex: 1; }
  h1 .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  h1 .id { font-weight: 400; opacity: 0.7; flex: none; }
  h1 .file { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
  h2 { font-size: 1.05em; font-weight: 600; margin: 16px 0 8px; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  h2 .title { flex: none; font-size: 1.2em; font-weight: 700; letter-spacing: 0.01em; }
  h2 .file { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  /* Only a path is trimmed from the left; a sentence keeps its own direction. */
  h2 .file.path { direction: rtl; text-align: left; }
  h2 button { flex: none; align-self: center; }
  h3 { font-size: 0.85em; font-weight: 700; margin: 12px 0 6px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.07em; display: flex; align-items: center; gap: 6px; }
  /* A rule opens every section and every group inside one, so a Save always
     sits under exactly what it writes. */
  .section + .section { margin-top: 18px; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .form > .group { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .form > .group:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  p.hint { margin: 4px 0 8px; opacity: 0.75; line-height: 1.4; }
  .file { font-family: var(--vscode-editor-font-family); font-size: 0.85em; opacity: 0.75; word-break: break-all; margin: 2px 0 6px; }
  .warning { color: var(--vscode-editorWarning-foreground); }
  .error { color: var(--vscode-errorForeground); }
  .ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green)); }
  input, select { padding: 3px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font-family: inherit; font-size: inherit; box-sizing: border-box; min-width: 0; }
  /* One height for every control, so a slider stands level with the fields beside it. */
  input:not([type=checkbox]), select { height: 24px; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  input[type=number] { width: 90px; }
  #layers .find { display: flex; gap: 6px; margin-top: 4px; }
  #layers .find input { flex: 1 1 0; width: 0; min-width: 0; }
  #layers .find button { flex: none; padding: 2px 6px; }
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
  /* A row standing on its own above a form or a table keeps a grid's own gap under it. */
  .grid.lone { margin-bottom: 6px; }
  .rows { display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .row input, .row select, .row .combo { flex: 1; }
  .row .narrow { flex: 0 0 70px; }
  .row .half { flex: 0 0 50%; }
  .row .slider { flex: 1; }
  .slider { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .slider .range { position: relative; flex: 1; min-width: 0; display: flex; }
  /* The range keeps the box every other field has — same height, same corners — and draws its track inside it. */
  .slider input[type=range] { -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; margin: 0; padding: 0 6px; cursor: pointer; }
  .slider input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4)); }
  .slider input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px; border-radius: 50%; background: var(--vscode-button-background, #0e639c); }
  /* One dot per step, under the thumb, so a short slider shows the levels it picks from. Inset by the
     field's border and padding plus half a thumb, which is where the thumb's centre starts and ends. */
  .slider .rail { position: absolute; inset: 0 13px; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
  .slider .rail span { width: 3px; height: 3px; border-radius: 50%; background: var(--vscode-foreground); opacity: 0.45; }
  .slider .readout { flex: 0 0 26px; text-align: right; font-variant-numeric: tabular-nums; opacity: 0.85; }
  /* A stepped slider picks from a handful of levels: it takes a third of the field, and its name takes the rest. */
  .slider.stepped .range { flex: 0 0 33%; }
  .slider.stepped .readout { flex: 1; text-align: left; }
  .combo { position: relative; min-width: 0; display: flex; }
  .combo input { width: 100%; padding-right: 22px; }
  .combo::after { content: ''; position: absolute; right: 4px; top: 0; bottom: 0; margin: auto; width: 16px; height: 16px; pointer-events: none; background-color: var(--vscode-foreground); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z'/%3E%3C/svg%3E") center / 16px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z'/%3E%3C/svg%3E") center / 16px no-repeat; }
  .combo-list { position: absolute; top: 100%; left: 0; min-width: 100%; max-width: 380px; z-index: 10; max-height: 240px; overflow-y: auto; background: var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background, #252526)); color: var(--vscode-editorSuggestWidget-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border, #454545)); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
  .combo-item { padding: 3px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .combo-item.active, .combo-item:hover { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .combo-item.empty { opacity: 0.7; font-style: italic; }
  .row .remove { flex: none; }
  /* An empty list keeps one row to show what goes in it: dimmed until it is
     used, and its placeholders name the field rather than give a real value. */
  .row.ghost { opacity: 0.5; }
  .row.ghost:focus-within { opacity: 1; }
  .row.ghost input::placeholder { font-style: italic; }
  .head { display: flex; gap: 4px; font-size: 0.8em; opacity: 0.7; padding: 0 30px 0 0; position: relative; top: -2px; }
  .head span { flex: 1; }
  .head span.narrow { flex: 0 0 70px; }
  .head span.half { flex: 0 0 50%; }
  .head span.tick { flex: 0 0 70px; text-align: center; }
  .row .tick { flex: 0 0 70px; display: flex; align-items: center; justify-content: center; }
  .tick input { margin: 0; }
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
  /* A running total that belongs to a list's title sits after its + button, as an aside rather than a heading. */
  h3 .total { margin: 0; font-style: italic; font-weight: 400; text-transform: none; letter-spacing: normal; opacity: 0.6; }
  h3 .total.warning { opacity: 1; }
  /* The legend: the same colour the map draws the position with. */
  .swatch { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .pos-row .pos-label { flex: 0 0 78px; opacity: 0.85; margin-left: 4px; }
  .pos-row input { flex: 1; min-width: 0; width: auto; }
  .pos-head { padding-left: 96px; }
  label.check { display: flex; gap: 6px; align-items: center; opacity: 0.9; margin-top: 2px; position: relative; top: 2px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 2px; margin: 10px 0 4px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .tabs button { background: transparent; color: var(--vscode-foreground); opacity: 0.7; border-radius: 0; padding: 6px 10px; border-bottom: 2px solid transparent; }
  .tabs button:hover { background: var(--vscode-list-hoverBackground); }
  .tabs button.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
  .tabs button:disabled { opacity: 0.35; cursor: default; }
  .tabs button:disabled:hover { background: transparent; }
  /* A part of the form the province cannot have: greyed, and it takes no input. */
  .locked { opacity: 0.5; }
`;
