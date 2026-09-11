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
  <input id="goto" type="number" min="1" placeholder="Province id" title="Center the map on a province id">
  <button id="gotoButton" class="secondary">Go</button>
  <button id="fitButton" class="secondary" title="Fit the whole map in the view">Fit</button>
  <button id="reloadButton" class="secondary" title="Re-read the map and the mod files">Reload</button>
  <span id="status" class="status"></span>
</div>
<div id="main">
  <div id="mapArea">
    <canvas id="canvas"></canvas>
    <div id="tooltip" hidden></div>
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
  #canvas { display: block; width: 100%; height: 100%; }
  #tooltip { position: absolute; pointer-events: none; padding: 2px 6px; background: var(--vscode-editorHoverWidget-background, #252526); color: var(--vscode-editorHoverWidget-foreground, #ccc); border: 1px solid var(--vscode-editorHoverWidget-border, #454545); border-radius: 3px; font-size: 0.9em; white-space: nowrap; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 1.1em; }
  #side { width: 420px; flex: none; overflow-y: auto; border-left: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); padding: 10px 14px 24px; box-sizing: border-box; }
  h1 { font-size: 1.3em; margin: 4px 0 2px; }
  h2 { font-size: 1.05em; font-weight: 600; margin: 18px 0 6px; display: flex; align-items: center; gap: 8px; }
  h2 .spacer { flex: 1; }
  h3 { font-size: 0.95em; font-weight: 600; margin: 12px 0 4px; opacity: 0.9; }
  p.hint { margin: 4px 0 8px; opacity: 0.75; line-height: 1.4; }
  .badge { font-size: 0.8em; padding: 1px 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .file { font-family: var(--vscode-editor-font-family); font-size: 0.85em; opacity: 0.75; word-break: break-all; margin: 2px 0 6px; }
  .warning { color: var(--vscode-editorWarning-foreground); }
  .error { color: var(--vscode-errorForeground); }
  .ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green)); }
  input, select { padding: 3px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; font-family: inherit; font-size: inherit; box-sizing: border-box; min-width: 0; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  input[type=number] { width: 90px; }
  #goto { width: 110px; }
  button { padding: 3px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: inherit; white-space: nowrap; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.icon { padding: 1px 6px; line-height: 1.2; }
  .grid { display: grid; grid-template-columns: 110px 1fr; gap: 6px 8px; align-items: center; }
  .grid label { opacity: 0.85; }
  .rows { display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .row input, .row select { flex: 1; }
  .row input.narrow { flex: 0 0 70px; }
  .row .remove { flex: none; }
  .head { display: flex; gap: 4px; font-size: 0.8em; opacity: 0.7; padding: 0 30px 0 0; }
  .head span { flex: 1; }
  .head span.narrow { flex: 0 0 70px; }
  .actions { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .actions .status { opacity: 0.85; }
  details.dated { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444)); border-radius: 3px; padding: 4px 8px; margin: 4px 0; }
  details.dated summary { display: flex; gap: 6px; align-items: center; cursor: pointer; }
  details.dated summary input { width: 120px; }
  .total { opacity: 0.8; font-size: 0.9em; margin-top: 4px; }
  label.check { display: flex; gap: 6px; align-items: center; opacity: 0.9; }
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
  var image = null;          // { width, height, bitmap, packed: Uint32Array }
  var view = { scale: 1, x: 0, y: 0 };
  var selection = null;      // { id, color, canvas, x, y, width, height }
  var details = null;
  var popDate = '';
  var saving = false;

  var mapArea = document.getElementById('mapArea');
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var tooltip = document.getElementById('tooltip');
  var loading = document.getElementById('loading');
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
  function appendChildren(node, child) {
    if (child === undefined || child === null || child === false) { return; }
    if (Array.isArray(child)) { child.forEach(function (item) { appendChildren(node, item); }); return; }
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  function textInput(value, listId, type, extraClass) {
    var input = h('input', { type: type || 'text', list: listId || undefined, class: extraClass || undefined, spellcheck: 'false' });
    input.value = value === undefined || value === null ? '' : String(value);
    return input;
  }
  function valueOf(input) {
    var value = input.value.trim();
    return value === '' ? undefined : value;
  }
  function option(value, label) {
    var node = h('option', { value: value }, label);
    return node;
  }

  // --- Map loading --------------------------------------------------------------
  function decodeBmp(buffer) {
    var header = new DataView(buffer);
    if (header.getUint16(0, true) !== 0x4d42) { throw new Error('provinces.bmp is not a BMP file.'); }
    var pixelOffset = header.getUint32(10, true);
    var headerSize = header.getUint32(14, true);
    var width, height, bitsPerPixel;
    if (headerSize === 12) {
      width = header.getUint16(18, true); height = header.getInt16(20, true); bitsPerPixel = header.getUint16(24, true);
    } else {
      width = header.getInt32(18, true); height = header.getInt32(22, true); bitsPerPixel = header.getUint16(28, true);
    }
    var topDown = height < 0;
    height = Math.abs(height);
    if (bitsPerPixel !== 24 && bitsPerPixel !== 32) { throw new Error(bitsPerPixel + '-bit provinces.bmp; only 24-bit and 32-bit maps can be shown.'); }
    var bytesPerPixel = bitsPerPixel / 8;
    var stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
    var bytes = new Uint8Array(buffer);
    var rgba = new Uint8ClampedArray(width * height * 4);
    var packed = new Uint32Array(width * height);
    for (var y = 0; y < height; y++) {
      var source = pixelOffset + (topDown ? y : height - 1 - y) * stride;
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

  function loadMap(bmpUri) {
    loading.hidden = false;
    loading.textContent = 'Loading provinces.bmp…';
    fetch(bmpUri)
      .then(function (response) {
        if (!response.ok) { throw new Error('provinces.bmp could not be read (' + response.status + ').'); }
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        var decoded = decodeBmp(buffer);
        return createImageBitmap(new ImageData(decoded.rgba, decoded.width, decoded.height)).then(function (bitmap) {
          image = { width: decoded.width, height: decoded.height, bitmap: bitmap, packed: decoded.packed };
          loading.hidden = true;
          fitView();
          render();
          setStatus(decoded.width + ' x ' + decoded.height + ', ' + definitionById.size + ' provinces');
        });
      })
      .catch(function (error) {
        loading.textContent = error && error.message ? error.message : String(error);
      });
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
    ctx.drawImage(image.bitmap, 0, 0);
    if (selection) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(selection.canvas, selection.x, selection.y);
    }
  }
  function toImage(clientX, clientY) {
    var rect = mapArea.getBoundingClientRect();
    return { x: Math.floor((clientX - rect.left - view.x) / view.scale), y: Math.floor((clientY - rect.top - view.y) / view.scale) };
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
    drag = { startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false };
    mapArea.classList.add('dragging');
  });
  window.addEventListener('mousemove', function (event) {
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
    var wasClick = !drag.moved;
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
    if (!image || event.target !== canvas) { tooltip.hidden = true; return; }
    var id = provinceAt(toImage(event.clientX, event.clientY));
    if (id === undefined) { tooltip.hidden = true; return; }
    var definition = definitionById.get(id);
    tooltip.textContent = id + (definition && definition.name ? ' · ' + definition.name : '') + (seaIds.has(id) ? ' (sea)' : '');
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
    selection = highlightOf(id);
    render();
    details = null;
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

  document.getElementById('gotoButton').addEventListener('click', function () {
    var id = Number(document.getElementById('goto').value);
    if (id > 0) { centerOn(id); }
  });
  document.getElementById('goto').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { var id = Number(event.target.value); if (id > 0) { centerOn(id); } }
  });
  document.getElementById('fitButton').addEventListener('click', function () { fitView(); render(); });
  document.getElementById('reloadButton').addEventListener('click', function () { vscode.postMessage({ type: 'reload' }); });

  // --- Side panel ---------------------------------------------------------------
  function renderSide(id) {
    side.replaceChildren();
    var definition = definitionById.get(id);
    var title = details && details.localisation.text ? details.localisation.text : (definition ? definition.name : '');
    side.append(h('h1', null, title || 'Province ' + id, ' ', h('span', { class: 'badge' }, '#' + id), seaIds.has(id) ? h('span', { class: 'badge' }, 'sea') : null));
    side.append(h('p', { class: 'hint' }, 'definition.csv: ', definition ? definition.name : '(no row)', ' · edits go to ', h('b', null, map.targetName)));
    if (!details) { side.append(h('p', { class: 'hint' }, 'Loading…')); return; }
    renderDatalists(details.vocabulary);
    side.append(localisationSection());
    side.append(historySection());
    side.append(popsSection());
  }

  function renderDatalists(vocabulary) {
    var lists = { countries: 'dl-countries', goods: 'dl-goods', terrains: 'dl-terrains', cultures: 'dl-cultures', religions: 'dl-religions', ideologies: 'dl-ideologies', buildings: 'dl-buildings', popTypes: 'dl-poptypes', rebelTypes: 'dl-rebeltypes' };
    Object.keys(lists).forEach(function (key) {
      var list = h('datalist', { id: lists[key] });
      (vocabulary[key] || []).forEach(function (name) { list.append(option(name, name)); });
      side.append(list);
    });
  }

  function sectionHeader(title, file) {
    return h('h2', null, title, h('span', { class: 'spacer' }), file ? h('button', { class: 'secondary', onclick: function () { vscode.postMessage({ type: 'openFile', absolutePath: file.absolutePath, line: file.line }); } }, 'Open file') : null);
  }
  function fileLine(section, whenMissing) {
    if (!section.file) { return h('div', { class: 'file warning' }, whenMissing); }
    var text = section.file.absolutePath.replace(map.targetRoot, '').replace(/^[\\/]/, '');
    return h('div', { class: 'file' + (section.inTarget ? '' : ' warning') }, section.inTarget ? text : section.file.absolutePath + ' (a layer below ' + map.targetName + '; saving writes a copy into it)');
  }
  function saveBar(onSave) {
    var status = h('span', { class: 'status' });
    var button = h('button', { onclick: function () {
      if (saving) { return; }
      saving = true; button.disabled = true; status.textContent = 'Saving…'; status.className = 'status';
      onSave();
    } }, 'Save');
    return { node: h('div', { class: 'actions' }, button, status), status: status, button: button };
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
    return h('div', null,
      sectionHeader('Localisation', loc.file),
      fileLine(loc, loc.key + ' is not defined; saving adds it to the mod\'s province names file.'),
      h('div', { class: 'grid' }, h('label', null, loc.key), input),
      h('label', { class: 'check' }, rename, 'Rename the history file to match'),
      bar.node);
  }

  // History
  function historySection() {
    var history = details.history;
    var form = historyForm(history.data || emptyHistory(), true);
    var folder = null;
    var parts = [sectionHeader('History', history.file)];
    if (history.data) {
      parts.push(fileLine(history, ''));
    } else {
      folder = h('select', null, (map.historyFolders.length ? map.historyFolders : ['']).map(function (name) { return option(name, name || '(history/provinces)'); }));
      parts.push(h('div', { class: 'file warning' }, 'No history file for this province; saving creates one in history/provinces/'), h('div', { class: 'grid' }, h('label', null, 'Folder'), folder));
    }
    var bar = saveBar(function () { postSave({ section: 'history', data: form.read(), createInFolder: folder ? folder.value : undefined }); });
    parts.push(form.node, bar.node);
    return h('div', null, parts);
  }
  function emptyHistory() {
    return { owner: undefined, controller: undefined, cores: [], removeCores: [], tradeGoods: undefined, lifeRating: undefined, terrain: undefined, colonial: undefined, colony: undefined, isSlave: undefined, buildings: [], partyLoyalty: [], stateBuildings: [], setFlags: [], clrFlags: [], dated: [] };
  }
  function historyForm(data, allowDated) {
    var scalars = [
      ['owner', 'Owner', 'dl-countries'], ['controller', 'Controller', 'dl-countries'],
      ['tradeGoods', 'Trade goods', 'dl-goods'], ['lifeRating', 'Life rating', null, 'number'],
      ['terrain', 'Terrain', 'dl-terrains'], ['colonial', 'Colonial', null, 'number'], ['colony', 'Colony', null, 'number']
    ];
    var inputs = {};
    var grid = h('div', { class: 'grid' });
    scalars.forEach(function (spec) {
      inputs[spec[0]] = textInput(data[spec[0]], spec[2], spec[3]);
      grid.append(h('label', null, spec[1]), inputs[spec[0]]);
    });
    var isSlave = h('select', null, option('', '(unset)'), option('yes', 'yes'), option('no', 'no'));
    isSlave.value = data.isSlave || '';
    grid.append(h('label', null, 'Slave state'), isSlave);
    var cores = listEditor('Cores', data.cores, 'dl-countries');
    var removeCores = listEditor('Remove cores', data.removeCores, 'dl-countries');
    var buildings = rowsEditor('Buildings', data.buildings, [['key', 'building', 'dl-buildings'], ['value', 'level', null, 'number', 'narrow']], function () { return { key: '', value: '1' }; });
    var partyLoyalty = rowsEditor('Party loyalty', data.partyLoyalty, [['ideology', 'ideology', 'dl-ideologies'], ['loyaltyValue', 'loyalty', null, 'number', 'narrow']], function () { return { ideology: '', loyaltyValue: '' }; });
    var stateBuildings = rowsEditor('State buildings', data.stateBuildings, [['building', 'building', 'dl-buildings'], ['level', 'level', null, 'number', 'narrow'], ['upgrade', 'upgrade', null, 'text', 'narrow']], function () { return { building: '', level: '1', upgrade: 'yes' }; });
    var setFlags = listEditor('Set province flags', data.setFlags);
    var clrFlags = listEditor('Clear province flags', data.clrFlags);
    var dated = allowDated ? datedEditor(data.dated) : null;
    var node = h('div', { class: 'form' }, grid, cores.node, removeCores.node, buildings.node, partyLoyalty.node, stateBuildings.node, setFlags.node, clrFlags.node, dated ? dated.node : null);
    return {
      node: node,
      read: function () {
        return {
          owner: valueOf(inputs.owner), controller: valueOf(inputs.controller),
          cores: cores.read(), removeCores: removeCores.read(),
          tradeGoods: valueOf(inputs.tradeGoods), lifeRating: valueOf(inputs.lifeRating), terrain: valueOf(inputs.terrain),
          colonial: valueOf(inputs.colonial), colony: valueOf(inputs.colony), isSlave: isSlave.value || undefined,
          buildings: buildings.read(), partyLoyalty: partyLoyalty.read(), stateBuildings: stateBuildings.read(),
          setFlags: setFlags.read(), clrFlags: clrFlags.read(), dated: dated ? dated.read() : []
        };
      }
    };
  }
  function listEditor(title, values, listId) {
    var rows = h('div', { class: 'rows' });
    function addRow(value) {
      var input = textInput(value, listId);
      var row = h('div', { class: 'row' }, input, h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); } }, '×'));
      rows.append(row);
      return input;
    }
    (values || []).forEach(addRow);
    var node = h('div', null, h('h3', null, title, ' ', h('button', { class: 'secondary icon', onclick: function () { addRow('').focus(); } }, '+')), rows);
    return { node: node, read: function () { return Array.prototype.map.call(rows.querySelectorAll('input'), function (input) { return input.value.trim(); }).filter(function (value) { return value !== ''; }); } };
  }
  function rowsEditor(title, items, columns, blank, options) {
    options = options || {};
    var rows = h('div', { class: 'rows' });
    function addRow(item) {
      var inputs = columns.map(function (column) { return textInput(item[column[0]], column[2], column[3], column[4]); });
      var row = h('div', { class: 'row' }, inputs,
        options.duplicate ? h('button', { class: 'secondary icon', title: 'Duplicate', onclick: function () { addRow(readRow(row)); } }, '⧉') : null,
        h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); rows.dispatchEvent(new Event('input', { bubbles: true })); } }, '×'));
      rows.append(row);
      return row;
    }
    function readRow(row) {
      var inputs = row.querySelectorAll('input');
      var out = {};
      columns.forEach(function (column, index) { out[column[0]] = inputs[index] ? inputs[index].value.trim() : ''; });
      return out;
    }
    (items || []).forEach(addRow);
    var head = h('div', { class: 'head' }, columns.map(function (column) { return h('span', { class: column[4] || undefined }, column[1]); }));
    var node = h('div', null, h('h3', null, title, ' ', h('button', { class: 'secondary icon', onclick: function () { addRow(blank()).querySelector('input').focus(); } }, '+')), head, rows);
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
    var node = h('div', null, h('h3', null, 'Dated blocks ', h('button', { class: 'secondary icon', onclick: function () { addBlock({ date: '1861.1.1', entries: emptyHistory() }).open = true; } }, '+')), rows);
    return {
      node: node,
      read: function () {
        return forms.map(function (entry) { return { date: entry.date.value.trim(), entries: entry.form.read() }; }).filter(function (block) { return block.date !== ''; });
      }
    };
  }

  // Pops
  function popsSection() {
    var pops = details.pops;
    var parts = [sectionHeader('Pops', pops.file)];
    if (map.popDates.length > 1) {
      var dateSelect = h('select', { onchange: function () { popDate = dateSelect.value; selectProvince(details.id); } }, map.popDates.map(function (date) { return option(date, date); }));
      dateSelect.value = popDate;
      parts.push(h('div', { class: 'grid' }, h('label', null, 'Start date'), dateSelect));
    }
    var fileInput = null;
    if (pops.pops) {
      parts.push(fileLine(pops, ''));
    } else {
      var listId = 'dl-popfiles';
      var list = h('datalist', { id: listId }, (map.popFiles[popDate] || []).map(function (name) { return option(name, name); }));
      fileInput = textInput('', listId);
      fileInput.placeholder = 'Existing or new file name';
      parts.push(h('div', { class: 'file warning' }, 'No pops for this province in history/pops/' + popDate + '; pick the file the block should be added to.'), list, h('div', { class: 'grid' }, h('label', null, 'File'), fileInput));
    }
    var table = rowsEditor('Pops', pops.pops || [], [
      ['type', 'type', 'dl-poptypes'], ['culture', 'culture', 'dl-cultures'], ['religion', 'religion', 'dl-religions'],
      ['size', 'size', null, 'number', 'narrow'], ['militancy', 'mil.', null, 'number', 'narrow'], ['rebelType', 'rebel type', 'dl-rebeltypes']
    ], function () { return { type: 'farmers', culture: '', religion: '', size: '1000', militancy: '', rebelType: '' }; }, { duplicate: true });
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
    return h('div', null, parts);
  }

  // --- Messages from the extension ----------------------------------------------
  window.addEventListener('message', function (event) {
    var message = event.data || {};
    if (message.type === 'map') {
      map = message.map;
      idByColor = new Map(); definitionById = new Map(); seaIds = new Set(map.seaProvinces);
      map.definitions.forEach(function (definition) { idByColor.set(definition.color, definition.id); definitionById.set(definition.id, definition); });
      popDate = map.popDates[0] || '';
      targetBox.textContent = map.targetName;
      selection = null; details = null;
      side.replaceChildren(h('p', { class: 'hint' }, 'Click a province on the map to edit it.'));
      loadMap(message.bmpUri);
    } else if (message.type === 'details') {
      details = message.details;
      renderSide(details.id);
      setStatus('Province ' + details.id);
    } else if (message.type === 'saved') {
      saving = false;
      var result = message.result;
      if (result.ok) {
        details = result.details;
        renderSide(details.id);
        setStatus(result.written.length ? 'Saved ' + result.written.map(function (file) { return file.split(/[\\/]/).pop(); }).join(', ') : 'Nothing to save', 'ok');
      } else {
        side.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
        setStatus(result.reason, 'error');
      }
    } else if (message.type === 'error') {
      saving = false;
      setStatus(message.message, 'error');
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
`;
