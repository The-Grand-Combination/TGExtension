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
        <div id="layersBox">
          <div class="title">Layers</div>
          <div id="fixedLayers"></div>
          <div id="referenceLayers" class="references" title="Pictures to draw against, over the map"></div>
          <button id="addReferenceButton" class="secondary add" title="Pick a picture from disk; it is copied into the mod's map/references">Add Reference</button>
        </div>
        <div id="tools">
          <div class="pad">
            <button id="toolHand" class="tool hand" title="Move the map, and click a province to edit it"></button>
            <button id="toolReference" class="tool reference" title="Edit the reference pictures: click one to select it, drag to move, grips to resize (Shift keeps proportions, Ctrl distorts)"></button>
            <button id="toolPencil" class="tool pencil" title="Paint the chosen colour over what you draw on; click again for the eraser, which only takes back what you painted"></button>
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
            <span id="paintColorText">255 0 0</span>
          </div>
          <label class="lock" title="Paint only where map/terrain.bmp has land: pixels over its water are left as they are"><input type="checkbox" id="terrainLock" checked> Terrain Lock</label>
          <button id="generateColorButton" class="secondary generate" title="Take a colour at random that no province and no pixel of the map is using">Generate Color</button>
          <div class="actions">
            <button id="savePaintButton" class="secondary" title="Write the painted pixels into map/provinces.bmp">Save</button>
            <button id="resetPaintButton" class="secondary" title="Put every painted pixel back the way the file has it">Reset</button>
          </div>
        </div>
        <div id="layers">
          <label><input type="checkbox" id="layerCountry"> Country Colors</label>
          <label><input type="checkbox" id="layerState" title="Every province in the colour of the first map/region.txt state listing it"> State Colors</label>
          <label><input type="checkbox" id="layerPositions" checked> Positions</label>
          <label><input type="checkbox" id="layerText" checked title="Draw each province's name where map/positions.txt puts it, turned and sized as the game draws it"> Text Positions</label>
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
  <div id="side">
    <div id="sideBody"><p class="hint">Click a province on the map to edit it.</p></div>
    <div id="sideDock" hidden></div>
  </div>
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
  #mapControls { position: absolute; left: 10px; bottom: 10px; display: flex; align-items: flex-end; gap: 8px; max-width: calc(100% - 20px); user-select: none; --tool: 26px; --tool-gap: 3px; --box-pad: 8px; }
  /* Three tools wide and not a pixel more: the boxes sit over the map, and the
     map is what is being looked at. Everything in both of them is measured
     against that one width, so nothing inside can stretch a box on its own. */
  #controlStack { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 8px; width: calc(3 * var(--tool) + 2 * var(--tool-gap) + 2 * var(--box-pad)); }
  #layers, #tools, #layersBox { box-sizing: border-box; width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 6px var(--box-pad); background: rgba(30, 30, 30, 0.6); color: #eee; border-radius: 4px; font-size: 0.78em; }
  /* A layer name stays on one line even when it runs into the padding: two
     lines for one switch reads worse than a name that reaches the edge. */
  #layers label { display: flex; align-items: center; gap: 5px; cursor: pointer; line-height: 1.3; white-space: nowrap; }
  #layers input { margin: 0; flex: none; }
  #layers .actions { display: flex; gap: 4px; margin-top: 2px; padding-top: 5px; border-top: 1px solid rgba(255, 255, 255, 0.15); }
  #layers .actions button { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 1px 2px; }
  #tools { gap: 5px; }
  /* The Layers box: the three map bitmaps with an opacity each, and under them
     the pictures dropped in as references. Three reference rows show; more roll
     inside the same height, so the box never grows and never pushes the two
     boxes under it about. */
  /* Tighter than its neighbours: the row is a thumbnail two lines tall with the
     name beside it and the slider under the name, and at this width every pixel
     of padding is a letter of the name. */
  #layersBox { gap: 2px; padding: 5px 5px 6px; }
  #layersBox .title { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.9em; opacity: 0.85; padding-bottom: 1px; }
  #layersBox .layer { display: grid; grid-template-columns: 20px minmax(0, 1fr); column-gap: 4px; row-gap: 1px; align-items: center; padding: 2px 1px; border-radius: 3px; }
  #layersBox .layer.off { opacity: 0.45; }
  /* Not .head: that class is the side panel's column headings, and its 30px of
     right padding was what kept eating the names here. */
  #layersBox .layer .caption { display: flex; align-items: center; gap: 3px; min-width: 0; }
  #layersBox .layer .thumb { grid-row: 1 / span 2; align-self: center; width: 20px; height: 20px; border-radius: 2px; background: rgba(255, 255, 255, 0.08) center / cover no-repeat; }
  #layersBox .references .layer .thumb { cursor: pointer; }
  /* Switched off: the thumbnail goes grey and the name fades, the slider stays where it was. */
  #layersBox .layer.hidden-picture .thumb { filter: grayscale(1); opacity: 0.35; }
  #layersBox .layer.hidden-picture .name { opacity: 0.5; }
  #layersBox .layer .name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #layersBox .layer .remove { flex: none; padding: 0 3px; line-height: 1.1; }
  #layersBox .layer .slider { height: 14px; min-width: 0; }
  #layersBox .layer .slider input[type=range] { background: transparent; border-color: transparent; height: 14px; padding: 0 5px; }
  #layersBox .layer .slider input[type=range]::-webkit-slider-thumb { width: 10px; height: 10px; margin-top: -3px; }
  #layersBox .layer .slider input[type=range]:focus { outline: none; }
  #layersBox .layer .slider input[type=range]:focus-visible { outline: 1px solid var(--vscode-focusBorder, #0e639c); outline-offset: 1px; }
  /* The number is on the slider's tooltip: the track wants the whole line. */
  #layersBox .layer .slider .readout { display: none; }
  /* A reference row is picked by clicking its head: the frame appears over the map. */
  #layersBox .references .layer .caption { cursor: pointer; }
  #layersBox .references .layer.active { background: rgba(255, 255, 255, 0.14); }
  #layersBox .references .layer.loading { opacity: 0.5; }
  #layersBox .references { max-height: 130px; overflow-y: auto; border-top: 1px solid rgba(255, 255, 255, 0.15); padding-top: 3px; }
  #layersBox .add { padding: 1px 2px; }
  #layersBox.dropping, #mapArea.dropping #layersBox { outline: 1px dashed rgba(255, 255, 255, 0.6); outline-offset: -1px; }
  #mapArea.dropping #canvas { outline: 2px dashed rgba(255, 255, 255, 0.45); outline-offset: -3px; }
  #tools .pad { display: grid; grid-template-columns: repeat(3, var(--tool)); gap: var(--tool-gap); }
  #tools .tool { width: var(--tool); height: 24px; padding: 0; display: inline-flex; background: transparent; border-radius: 3px; opacity: 0.75; }
  /* The glyphs are VS Code's own codicons (cursor, file-media, edit-compact,
     share-window, paintcan, copy), drawn as masks so they take the box's colour. */
  #tools .tool::before { content: ''; margin: auto; width: 15px; height: 15px; background-color: #eee; }
  #tools .tool:hover { opacity: 1; background: rgba(255, 255, 255, 0.14); }
  #tools .tool.active { opacity: 1; background: var(--vscode-button-background, #0e639c); }
  #tools .reference::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6 1C4.89543 1 4 1.89543 4 3V6H5V3C5 2.44772 5.44772 2 6 2H9V4.5C9 5.32843 9.67157 6 10.5 6H13V13C13 13.5523 12.5523 14 12 14H10.9646C10.9141 14.3531 10.8109 14.6891 10.6632 15H12C13.1046 15 14 14.1046 14 13V5.41421C14 5.01639 13.842 4.63486 13.5607 4.35355L10.6464 1.43934C10.3651 1.15804 9.98361 1 9.58579 1H6ZM12.7929 5H10.5C10.2239 5 10 4.77614 10 4.5V2.20711L12.7929 5ZM1 9.5C1 8.11929 2.11929 7 3.5 7H7.5C8.88071 7 10 8.11929 10 9.5V13.5C10 14.0095 9.84756 14.4835 9.5858 14.8787L6.56066 11.8536C5.97487 11.2678 5.02513 11.2678 4.43934 11.8536L1.4142 14.8787C1.15244 14.4835 1 14.0095 1 13.5V9.5ZM8 9.75C8 9.33579 7.66421 9 7.25 9C6.83579 9 6.5 9.33579 6.5 9.75C6.5 10.1642 6.83579 10.5 7.25 10.5C7.66421 10.5 8 10.1642 8 9.75ZM2.12131 15.5858C2.51652 15.8476 2.99046 16 3.5 16H7.5C8.00954 16 8.48348 15.8476 8.87869 15.5858L5.85355 12.5607C5.65829 12.3654 5.34171 12.3654 5.14645 12.5607L2.12131 15.5858Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6 1C4.89543 1 4 1.89543 4 3V6H5V3C5 2.44772 5.44772 2 6 2H9V4.5C9 5.32843 9.67157 6 10.5 6H13V13C13 13.5523 12.5523 14 12 14H10.9646C10.9141 14.3531 10.8109 14.6891 10.6632 15H12C13.1046 15 14 14.1046 14 13V5.41421C14 5.01639 13.842 4.63486 13.5607 4.35355L10.6464 1.43934C10.3651 1.15804 9.98361 1 9.58579 1H6ZM12.7929 5H10.5C10.2239 5 10 4.77614 10 4.5V2.20711L12.7929 5ZM1 9.5C1 8.11929 2.11929 7 3.5 7H7.5C8.88071 7 10 8.11929 10 9.5V13.5C10 14.0095 9.84756 14.4835 9.5858 14.8787L6.56066 11.8536C5.97487 11.2678 5.02513 11.2678 4.43934 11.8536L1.4142 14.8787C1.15244 14.4835 1 14.0095 1 13.5V9.5ZM8 9.75C8 9.33579 7.66421 9 7.25 9C6.83579 9 6.5 9.33579 6.5 9.75C6.5 10.1642 6.83579 10.5 7.25 10.5C7.66421 10.5 8 10.1642 8 9.75ZM2.12131 15.5858C2.51652 15.8476 2.99046 16 3.5 16H7.5C8.00954 16 8.48348 15.8476 8.87869 15.5858L5.85355 12.5607C5.65829 12.3654 5.34171 12.3654 5.14645 12.5607L2.12131 15.5858Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .hand::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.00165 2.99863C4.00165 2.17447 4.94264 1.70412 5.60184 2.19877L13.5993 8.19993C14.3679 8.77665 13.96 9.99978 12.9991 9.99978H9.05388C8.74293 9.99978 8.44968 10.1444 8.26043 10.3911L5.7951 13.6051C5.21352 14.3633 4.00165 13.952 4.00165 12.9964V2.99863ZM12.9991 8.99978L5.00165 2.99863V12.9964L7.46698 9.78251C7.84548 9.28907 8.43199 8.99978 9.05388 8.99978L12.9991 8.99978Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.00165 2.99863C4.00165 2.17447 4.94264 1.70412 5.60184 2.19877L13.5993 8.19993C14.3679 8.77665 13.96 9.99978 12.9991 9.99978H9.05388C8.74293 9.99978 8.44968 10.1444 8.26043 10.3911L5.7951 13.6051C5.21352 14.3633 4.00165 13.952 4.00165 12.9964V2.99863ZM12.9991 8.99978L5.00165 2.99863V12.9964L7.46698 9.78251C7.84548 9.28907 8.43199 8.99978 9.05388 8.99978L12.9991 8.99978Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .pencil::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.62999 0C10.9399 9.73611e-05 12.0098 1.07 12.0099 2.37988C12.0099 3.00987 11.7594 3.60957 11.3194 4.05957L10.6896 4.67969L4.50988 10.8604C4.2899 11.0803 3.99948 11.2396 3.68956 11.3096L0.620227 11.9902C0.620227 11.9902 0.549888 12 0.509876 12H0.50011C0.37011 12 0.239524 11.9496 0.149524 11.8496C0.0297368 11.7296 -0.0203258 11.5595 0.0196415 11.3896L0.699329 8.32031C0.769311 8.01039 0.919624 7.72997 1.14952 7.5L7.94933 0.700195C8.39933 0.250195 8.99999 0 9.62999 0ZM1.83995 8.20996C1.74995 8.29996 1.69027 8.41004 1.66027 8.54004L1.14952 10.8398L3.44933 10.3301C3.56914 10.3001 3.68946 10.2402 3.77941 10.1504L9.60949 4.32031L7.67003 2.37988L1.83995 8.20996ZM9.62023 1C9.25023 1 8.90952 1.14039 8.64952 1.40039L8.38488 1.66504L10.3341 3.61426L10.5997 3.34961C10.8596 3.08962 11.0001 2.73981 11.0001 2.37988C11 1.62007 10.38 1.00022 9.62023 1Z'/%3E%3C/svg%3E") center / 12px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.62999 0C10.9399 9.73611e-05 12.0098 1.07 12.0099 2.37988C12.0099 3.00987 11.7594 3.60957 11.3194 4.05957L10.6896 4.67969L4.50988 10.8604C4.2899 11.0803 3.99948 11.2396 3.68956 11.3096L0.620227 11.9902C0.620227 11.9902 0.549888 12 0.509876 12H0.50011C0.37011 12 0.239524 11.9496 0.149524 11.8496C0.0297368 11.7296 -0.0203258 11.5595 0.0196415 11.3896L0.699329 8.32031C0.769311 8.01039 0.919624 7.72997 1.14952 7.5L7.94933 0.700195C8.39933 0.250195 8.99999 0 9.62999 0ZM1.83995 8.20996C1.74995 8.29996 1.69027 8.41004 1.66027 8.54004L1.14952 10.8398L3.44933 10.3301C3.56914 10.3001 3.68946 10.2402 3.77941 10.1504L9.60949 4.32031L7.67003 2.37988L1.83995 8.20996ZM9.62023 1C9.25023 1 8.90952 1.14039 8.64952 1.40039L8.38488 1.66504L10.3341 3.61426L10.5997 3.34961C10.8596 3.08962 11.0001 2.73981 11.0001 2.37988C11 1.62007 10.38 1.00022 9.62023 1Z'/%3E%3C/svg%3E") center / 12px no-repeat; }
  #tools .pencil.erasing::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M14.5 6C14.5 5.6 14.344 5.223 14.061 4.939L11.062 1.939C10.496 1.372 9.504 1.372 8.94 1.939L1.439 9.439C1.156 9.722 1 10.099 1 10.5C1 10.901 1.156 11.277 1.439 11.561L3.439 13.561C3.722 13.844 4.099 14 4.5 14H11.5C11.776 14 12 13.776 12 13.5C12 13.224 11.776 13 11.5 13H8.121L14.06 7.061C14.343 6.778 14.499 6.401 14.499 6H14.5ZM4.146 12.854L2.146 10.854C2.051 10.759 2 10.634 2 10.5C2 10.366 2.052 10.241 2.146 10.146L4.293 8L8 11.707L6.707 13H4.5C4.366 13 4.241 12.948 4.146 12.854ZM13.354 6.354L8.708 11L5.001 7.293L9.648 2.646C9.742 2.552 9.867 2.5 10.001 2.5C10.135 2.5 10.26 2.552 10.355 2.646L13.355 5.646C13.45 5.741 13.501 5.866 13.501 6C13.501 6.134 13.448 6.259 13.354 6.354Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M14.5 6C14.5 5.6 14.344 5.223 14.061 4.939L11.062 1.939C10.496 1.372 9.504 1.372 8.94 1.939L1.439 9.439C1.156 9.722 1 10.099 1 10.5C1 10.901 1.156 11.277 1.439 11.561L3.439 13.561C3.722 13.844 4.099 14 4.5 14H11.5C11.776 14 12 13.776 12 13.5C12 13.224 11.776 13 11.5 13H8.121L14.06 7.061C14.343 6.778 14.499 6.401 14.499 6H14.5ZM4.146 12.854L2.146 10.854C2.051 10.759 2 10.634 2 10.5C2 10.366 2.052 10.241 2.146 10.146L4.293 8L8 11.707L6.707 13H4.5C4.366 13 4.241 12.948 4.146 12.854ZM13.354 6.354L8.708 11L5.001 7.293L9.648 2.646C9.742 2.552 9.867 2.5 10.001 2.5C10.135 2.5 10.26 2.552 10.355 2.646L13.355 5.646C13.45 5.741 13.501 5.866 13.501 6C13.501 6.134 13.448 6.259 13.354 6.354Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .draw::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M14 1H6C4.9 1 4 1.9 4 3V5H2C0.9 5 0 5.9 0 7V13C0 14.1 0.9 15 2 15H10C11.1 15 12 14.1 12 13V11H14C15.1 11 16 10.1 16 9V3C16 1.9 15.1 1 14 1ZM11 13C11 13.55 10.55 14 10 14H2C1.45 14 1 13.55 1 13V7C1 6.45 1.45 6 2 6H4V9C4 10.1 4.9 11 6 11H11V13ZM15 9C15 9.55 14.55 10 14 10H12V7C12 5.9 11.1 5 10 5H5V3C5 2.45 5.45 2 6 2H14C14.55 2 15 2.45 15 3V9Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M14 1H6C4.9 1 4 1.9 4 3V5H2C0.9 5 0 5.9 0 7V13C0 14.1 0.9 15 2 15H10C11.1 15 12 14.1 12 13V11H14C15.1 11 16 10.1 16 9V3C16 1.9 15.1 1 14 1ZM11 13C11 13.55 10.55 14 10 14H2C1.45 14 1 13.55 1 13V7C1 6.45 1.45 6 2 6H4V9C4 10.1 4.9 11 6 11H11V13ZM15 9C15 9.55 14.55 10 14 10H12V7C12 5.9 11.1 5 10 5H5V3C5 2.45 5.45 2 6 2H14C14.55 2 15 2.45 15 3V9Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .bucket::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.49998 1C7.77613 1 7.99998 1.22386 7.99998 1.5V2.42763C8.15702 2.4998 8.30415 2.60053 8.43355 2.72983L12.1458 6.43921C12.7319 7.02493 12.7321 7.97499 12.1462 8.56093L7.0781 13.629C6.48218 14.2249 5.51243 14.2131 4.93123 13.6028L1.31095 9.80152C0.749447 9.21194 0.760786 8.28209 1.3365 7.70638L6.31263 2.73023C6.50977 2.53309 6.74814 2.4023 6.99998 2.33785V1.5C6.99998 1.22386 7.22384 1 7.49998 1ZM6.99998 4.5V3.4571L2.45709 8H11.2929L11.4391 7.85383C11.6344 7.65851 11.6343 7.34182 11.4389 7.14658L7.99998 3.71027V4.5C7.99998 4.77614 7.77613 5 7.49998 5C7.22384 5 6.99998 4.77614 6.99998 4.5ZM1.95461 9C1.97565 9.03992 2.00247 9.07761 2.03509 9.11187L5.65537 12.9132C5.8491 13.1166 6.17235 13.1205 6.37099 12.9219L10.2929 9H1.95461ZM12.9211 10.222C12.6981 9.96719 12.3018 9.96719 12.0789 10.222L10.9285 11.5367C9.74705 12.8869 10.7059 15 12.5 15C14.2941 15 15.2529 12.8869 14.0715 11.5367L12.9211 10.222ZM11.681 12.1952L12.5 11.2593L13.3189 12.1952C13.9346 12.8989 13.4349 14 12.5 14C11.5651 14 11.0654 12.8989 11.681 12.1952Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7.49998 1C7.77613 1 7.99998 1.22386 7.99998 1.5V2.42763C8.15702 2.4998 8.30415 2.60053 8.43355 2.72983L12.1458 6.43921C12.7319 7.02493 12.7321 7.97499 12.1462 8.56093L7.0781 13.629C6.48218 14.2249 5.51243 14.2131 4.93123 13.6028L1.31095 9.80152C0.749447 9.21194 0.760786 8.28209 1.3365 7.70638L6.31263 2.73023C6.50977 2.53309 6.74814 2.4023 6.99998 2.33785V1.5C6.99998 1.22386 7.22384 1 7.49998 1ZM6.99998 4.5V3.4571L2.45709 8H11.2929L11.4391 7.85383C11.6344 7.65851 11.6343 7.34182 11.4389 7.14658L7.99998 3.71027V4.5C7.99998 4.77614 7.77613 5 7.49998 5C7.22384 5 6.99998 4.77614 6.99998 4.5ZM1.95461 9C1.97565 9.03992 2.00247 9.07761 2.03509 9.11187L5.65537 12.9132C5.8491 13.1166 6.17235 13.1205 6.37099 12.9219L10.2929 9H1.95461ZM12.9211 10.222C12.6981 9.96719 12.3018 9.96719 12.0789 10.222L10.9285 11.5367C9.74705 12.8869 10.7059 15 12.5 15C14.2941 15 15.2529 12.8869 14.0715 11.5367L12.9211 10.222ZM11.681 12.1952L12.5 11.2593L13.3189 12.1952C13.9346 12.8989 13.4349 14 12.5 14C11.5651 14 11.0654 12.8989 11.681 12.1952Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .pick::before { -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 5V12.73C2.4 12.38 2 11.74 2 11V5C2 2.79 3.79 1 6 1H9C9.74 1 10.38 1.4 10.73 2H6C4.35 2 3 3.35 3 5ZM11 15H6C4.897 15 4 14.103 4 13V5C4 3.897 4.897 3 6 3H11C12.103 3 13 3.897 13 5V13C13 14.103 12.103 15 11 15ZM12 5C12 4.448 11.552 4 11 4H6C5.448 4 5 4.448 5 5V13C5 13.552 5.448 14 6 14H11C11.552 14 12 13.552 12 13V5Z'/%3E%3C/svg%3E") center / 15px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 5V12.73C2.4 12.38 2 11.74 2 11V5C2 2.79 3.79 1 6 1H9C9.74 1 10.38 1.4 10.73 2H6C4.35 2 3 3.35 3 5ZM11 15H6C4.897 15 4 14.103 4 13V5C4 3.897 4.897 3 6 3H11C12.103 3 13 3.897 13 5V13C13 14.103 12.103 15 11 15ZM12 5C12 4.448 11.552 4 11 4H6C5.448 4 5 4.448 5 5V13C5 13.552 5.448 14 6 14H11C11.552 14 12 13.552 12 13V5Z'/%3E%3C/svg%3E") center / 15px no-repeat; }
  #tools .size { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
  /* The brush slider is the panel's own, narrowed and with no field behind it:
     the box it would draw is a black slab over the translucent controls. */
  /* Left-aligned and hugging the track: right-aligned, a single digit would sit a
     whole readout away from the slider it belongs to. */
  #tools .size .readout { flex: 0 0 14px; text-align: left; }
  #tools .size input[type=range] { background: transparent; border-color: transparent; }
  /* No ring around a slider being dragged; a keyboard focus still shows one. */
  #tools .size input[type=range]:focus { outline: none; }
  #tools .size input[type=range]:focus-visible { outline: 1px solid var(--vscode-focusBorder, #0e639c); outline-offset: 1px; }
  #tools .size.off { opacity: 0.4; }
  /* The colour the brush writes: picked from the map with the eye drop, or chosen
     outright. The swatch is the whole row — it says the colour better than its
     hex did, and the hex is on the tooltip for when the number is what is wanted. */
  #tools .tint { display: flex; align-items: center; gap: 4px; }
  #tools .tint input { flex: 0 0 var(--tool); min-width: 0; height: 18px; padding: 0 1px; }
  /* Red, green and blue as definition.csv writes them; the hex is on the swatch's tooltip. */
  #tools .tint span { flex: 1 1 0; min-width: 0; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; opacity: 0.85; }
  #tools .generate { padding: 1px 2px; }
  #tools .lock { display: flex; align-items: center; gap: 5px; cursor: pointer; line-height: 1.3; white-space: nowrap; }
  /* The side panel's Save rows stand apart from the form above them; this one is
     already the last row of a small box, so it drops that margin and its rule. */
  #tools .actions { display: flex; gap: 4px; margin-top: 0; padding-top: 0; border-top: none; }
  /* Grown from their own labels, not to equal halves: Reset and Reload are the
     long ones, and two equal halves would clip them at this width. */
  #tools .actions button { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 1px 2px; }
  #mapArea.painting { cursor: crosshair; }
  /* Over the active reference: the frame's grips say what a drag would do. */
  #mapArea.grip-move { cursor: move; }
  #mapArea.grip-nw, #mapArea.grip-se { cursor: nwse-resize; }
  #mapArea.grip-ne, #mapArea.grip-sw { cursor: nesw-resize; }
  #mapArea.grip-n, #mapArea.grip-s { cursor: ns-resize; }
  #mapArea.grip-e, #mapArea.grip-w { cursor: ew-resize; }
  #mapArea.picking { cursor: copy; }
  #mapArea.referencing { cursor: default; }
  /* The middle button pans under every tool, so it shows the hand it would with the hand. */
  #mapArea.dragging.painting, #mapArea.dragging.picking { cursor: grabbing; }
  /* The panel scrolls inside #sideBody so the Save bar can sit over it rather
     than in it: docked to the bottom edge, it is reached without scrolling and
     it writes every tab at once. */
  #side { width: 420px; flex: none; position: relative; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); box-sizing: border-box; }
  /* The scrollbar gutter is always reserved and stands in for the right padding:
     a list growing past the window gets its bar where the margin already was, so
     nothing under it moves and no empty strip is left when there is no bar. */
  #sideBody { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding: 14px 0 24px 14px; box-sizing: border-box; }
  /* Room under the last field for the bar that covers it. */
  #sideBody.docked { padding-bottom: 68px; }
  #sideDock { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 14px; box-sizing: border-box; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); background: color-mix(in srgb, var(--vscode-editorWidget-background, var(--vscode-editor-background)) 88%, transparent); backdrop-filter: blur(8px); box-shadow: 0 -8px 18px rgba(0, 0, 0, 0.28); }
  #sideDock[hidden] { display: none; }
  #sideDock .actions { margin: 0; padding: 0; border-top: none; }
  #sideDock .actions button { min-width: 84px; }
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
  #layers .find { display: flex; gap: 4px; margin-top: 2px; }
  #layers .find input { flex: 1 1 0; width: 0; min-width: 0; }
  #layers .find button { flex: none; padding: 1px 5px; }
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
  /* The picked entry drawn over the input, lined up with the text it hides. */
  .combo-display { position: absolute; top: 1px; bottom: 1px; left: 1px; right: 22px; padding: 0 6px; display: flex; align-items: center; pointer-events: none; white-space: nowrap; overflow: hidden; }
  /* The display: flex above outranks the browser's own rule for [hidden], so say it here. */
  .combo-display[hidden] { display: none; }
  .combo-display > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .combo.named > input { color: transparent; }
  .combo-list { position: absolute; top: 100%; left: 0; min-width: 100%; max-width: 380px; z-index: 10; max-height: 240px; overflow-y: auto; background: var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background, #252526)); color: var(--vscode-editorSuggestWidget-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border, #454545)); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
  .combo-item { padding: 3px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .combo-item.active, .combo-item:hover { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .combo-item.empty { opacity: 0.7; font-style: italic; }
  /* The localised name after the identifier: there to read, not to pick out. */
  .combo-item .combo-name, .combo-display .combo-name { font-style: italic; opacity: 0.7; }
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
  /* The name's angle and size sit under the Name row, set in past where its dot is, with no dot of their own. */
  .name-row { padding-left: 18px; }
  .name-row .pos-label { flex: 0 0 96px; margin-left: 0; }
  /* One number each: the same short box on both rows, the degrees taking the room the angle's leaves. */
  .name-row input { flex: 0 0 88px; }
  .name-row .deg { flex: 0 0 52px; font-style: italic; opacity: 0.6; }
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
