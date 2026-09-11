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
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 1.1em; background: rgba(0, 0, 0, 0.55); }
  #loading[hidden], #tooltip[hidden] { display: none; }
  #side { width: 420px; flex: none; overflow-y: auto; border-left: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); padding: 10px 14px 24px; box-sizing: border-box; }
  h1 { font-size: 1.2em; margin: 6px 0 2px; display: flex; align-items: baseline; gap: 8px; min-width: 0; white-space: nowrap; }
  h1 .id { font-weight: 400; opacity: 0.7; flex: none; }
  h1 .file { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
  h1 .badge { flex: none; }
  h2 { font-size: 1.05em; font-weight: 600; margin: 16px 0 6px; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  h2 .file { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; direction: rtl; text-align: left; }
  h2 button { flex: none; }
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
  button.outline { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-button-secondaryBackground, #666); padding: 1px 8px; font-size: 0.9em; }
  button.outline:hover { background: var(--vscode-list-hoverBackground); }
  .grid { display: grid; grid-template-columns: 110px 1fr; gap: 6px 8px; align-items: center; }
  .grid label { opacity: 0.85; }
  .rows { display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .row input, .row select, .row .combo { flex: 1; }
  .row .narrow { flex: 0 0 70px; }
  .combo { position: relative; min-width: 0; display: flex; }
  .combo input { width: 100%; }
  .combo-list { position: absolute; top: 100%; left: 0; min-width: 100%; max-width: 380px; z-index: 10; max-height: 240px; overflow-y: auto; background: var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background, #252526)); color: var(--vscode-editorSuggestWidget-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border, #454545)); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
  .combo-item { padding: 3px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .combo-item.active, .combo-item:hover { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .combo-item.empty { opacity: 0.7; font-style: italic; }
  .row .remove { flex: none; }
  .head { display: flex; gap: 4px; font-size: 0.8em; opacity: 0.7; padding: 0 30px 0 0; }
  .head span { flex: 1; }
  .head span.narrow { flex: 0 0 70px; }
  .actions { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .inline { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .inline label { flex: none; opacity: 0.85; }
  .inline input[type=text] { flex: 1; min-width: 0; }
  .inline .status { flex: none; opacity: 0.85; }
  .actions .status { opacity: 0.85; }
  details.dated { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444)); border-radius: 3px; padding: 4px 8px; margin: 4px 0; }
  details.dated summary { display: flex; gap: 6px; align-items: center; cursor: pointer; }
  details.dated summary input { width: 120px; }
  .total { opacity: 0.8; font-size: 0.9em; margin-top: 4px; }
  label.check { display: flex; gap: 6px; align-items: center; opacity: 0.9; }
  .tabs { display: flex; gap: 2px; margin: 10px 0 4px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444)); }
  .tabs button { background: transparent; color: var(--vscode-foreground); opacity: 0.7; border-radius: 0; padding: 6px 14px; border-bottom: 2px solid transparent; }
  .tabs button:hover { background: var(--vscode-list-hoverBackground); }
  .tabs button.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
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
  var details = null;
  var popDate = '';
  var saving = false;
  var activeTab = 'definition';

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
    var input = h('input', { type: type || 'text', list: listId || undefined, class: 'field' + (extraClass ? ' ' + extraClass : ''), spellcheck: 'false' });
    input.value = value === undefined || value === null ? '' : String(value);
    return input;
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
    function commit() {
      var text = input.value.trim();
      if (text === labelOf(selected)) { return; }
      var lower = text.toLowerCase();
      var match = entries.find(function (entry) { return entry.label.toLowerCase() === lower || entry.id.toLowerCase() === lower; });
      pick(match ? match.id : text);
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
    // Paradox maps are stored upside down on purpose: the game reads the rows as they
    // come, so the view shows them in storage order, which flips a normal BMP vertically.
    var storedTopDown = height < 0;
    height = Math.abs(height);
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
        return buildTiles(decoded).then(function (tiles) {
          image = { width: decoded.width, height: decoded.height, tiles: tiles, packed: decoded.packed };
          loading.hidden = true;
          fitView();
          render();
          setStatus(decoded.width + ' x ' + decoded.height + ', ' + definitionById.size + ' provinces');
          log('map ready; overlay ' + getComputedStyle(loading).display);
        });
      })
      .catch(function (error) {
        var text = error && error.message ? error.message : String(error);
        showLoading('Could not show the map: ' + text);
      });
  }
  window.addEventListener('error', function (event) { showLoading('Page error: ' + (event.message || event.error)); });
  window.addEventListener('unhandledrejection', function (event) { showLoading('Page error: ' + (event.reason && event.reason.message ? event.reason.message : event.reason)); });

  /** Copy the decoded pixels into TILE x TILE canvases, one row of tiles per turn of the event loop. */
  function buildTiles(decoded) {
    var tiles = [];
    var rows = Math.ceil(decoded.height / TILE);
    var columns = Math.ceil(decoded.width / TILE);
    var full = new ImageData(decoded.rgba, decoded.width, decoded.height);
    return new Promise(function (resolve, reject) {
      var row = 0;
      function next() {
        try {
          for (var column = 0; column < columns; column++) {
            var x = column * TILE, y = row * TILE;
            var width = Math.min(TILE, decoded.width - x), height = Math.min(TILE, decoded.height - y);
            var tile = document.createElement('canvas');
            tile.width = width; tile.height = height;
            var context = tile.getContext('2d');
            if (!context) { throw new Error('The browser refused a ' + width + ' x ' + height + ' canvas.'); }
            context.putImageData(full, -x, -y);
            tiles.push({ x: x, y: y, canvas: tile });
          }
          row++;
          showLoading('Drawing ' + decoded.width + ' x ' + decoded.height + '… ' + Math.round((row / rows) * 100) + '%');
          if (row < rows) { setTimeout(next, 0); } else { resolve(tiles); }
        } catch (error) { reject(error); }
      }
      next();
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
    var left = -view.x / view.scale, top = -view.y / view.scale;
    var right = left + mapArea.clientWidth / view.scale, bottom = top + mapArea.clientHeight / view.scale;
    image.tiles.forEach(function (tile) {
      if (tile.x + tile.canvas.width < left || tile.x > right || tile.y + tile.canvas.height < top || tile.y > bottom) { return; }
      ctx.drawImage(tile.canvas, tile.x, tile.y);
    });
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
      if (id !== undefined && seaIds.has(id)) { setStatus('Province ' + id + ' is sea; it has no history or pops.'); return; }
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
    if (seaIds.has(id)) { setStatus('Province ' + id + ' is sea; it has no history or pops.', 'warning'); return; }
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
    var tooltip = 'definition.csv: ' + (definition ? definition.name : '(no row)') + '\nEdits go to ' + map.targetName + '\n' + map.targetRoot;
    side.append(h('h1', { title: tooltip },
      title || 'Province ' + id,
      h('span', { class: 'id' }, '- ' + id + ' -'),
      h('span', { class: 'file' }, map.targetName),
      seaIds.has(id) ? h('span', { class: 'badge' }, 'sea') : null));
    if (!details) { side.append(h('p', { class: 'hint' }, 'Loading…')); return; }
    renderDatalists(details.vocabulary);
    var history = historySections();
    var panes = {
      definition: h('div', null, localisationSection(), history.definition),
      cores: history.cores,
      buildings: history.buildings,
      dates: history.dates,
      pops: h('div', null, popsSection())
    };
    var labels = { definition: 'Definition', cores: 'Cores', buildings: 'Buildings', dates: 'Extra Dates', pops: 'Pops' };
    var names = Object.keys(labels);
    if (!panes[activeTab]) { activeTab = 'definition'; }
    var tabs = h('div', { class: 'tabs' }, names.map(function (name) {
      return h('button', { class: 'tab' + (activeTab === name ? ' active' : ''), 'data-tab': name, onclick: function () {
        activeTab = name;
        names.forEach(function (key) { panes[key].hidden = key !== name; });
        tabs.querySelectorAll('button').forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-tab') === name); });
      } }, labels[name]);
    }));
    names.forEach(function (key) { panes[key].hidden = key !== activeTab; });
    side.append(tabs, names.map(function (name) { return panes[name]; }));
  }

  function renderDatalists(vocabulary) {
    var lists = { ideologies: 'dl-ideologies', buildings: 'dl-buildings', rebelTypes: 'dl-rebeltypes' };
    Object.keys(lists).forEach(function (key) {
      var list = h('datalist', { id: lists[key] });
      (vocabulary[key] || []).forEach(function (name) { list.append(option(name, name)); });
      side.append(list);
    });
  }

  /** Title, file path (grey, trimmed from the left) and an Open file button on one line. */
  function sectionHeader(title, section, whenMissing) {
    var file = section.file;
    var text = !file ? whenMissing : section.inTarget ? file.absolutePath.replace(map.targetRoot, '').replace(/^[\\/]/, '') : file.absolutePath;
    var open = file ? h('button', { class: 'outline', onclick: function () { vscode.postMessage({ type: 'openFile', absolutePath: file.absolutePath, line: file.line }); } }, 'Open file') : null;
    return h('h2', null, title, h('span', { class: 'file' + (file && section.inTarget ? '' : ' warning'), title: text }, '\u200e' + text), open);
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
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') { bar.button.click(); } });
    return h('div', null,
      sectionHeader('Localisation', loc, loc.key + ' is not defined; saving adds it to the mod\'s province names file.'),
      layerNote(loc),
      h('div', { class: 'inline' }, h('label', null, loc.key), input, bar.button, bar.status),
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
      return h('div', null, sectionHeader(title, history, 'No history file; saving creates one'), layerNote(history), body, bar.node);
    }
    return {
      definition: pane('History', h('div', null, folderRow, form.node)),
      cores: pane('Cores', form.cores),
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
    var isSlave = h('input', { type: 'checkbox' });
    isSlave.checked = (data.isSlave || '').toLowerCase() === 'yes';
    grid.append(h('label', null, 'Slave state'), h('div', null, isSlave));
    var cores = listEditor('Cores', data.cores, vocabulary.countries);
    var removeCores = listEditor('Remove cores', data.removeCores, vocabulary.countries);
    var buildings = rowsEditor('Buildings', data.buildings, [['key', 'building', 'dl-buildings'], ['value', 'level', null, 'number', 'narrow']], function () { return { key: '', value: '1' }; });
    var partyLoyalty = rowsEditor('Party loyalty', data.partyLoyalty, [['ideology', 'ideology', 'dl-ideologies'], ['loyaltyValue', 'loyalty', null, 'number', 'narrow']], function () { return { ideology: '', loyaltyValue: '' }; });
    var stateBuildings = rowsEditor('State buildings', data.stateBuildings, [['building', 'building', 'dl-buildings'], ['level', 'level', null, 'number', 'narrow'], ['upgrade', 'upgrade', null, 'text', 'narrow']], function () { return { building: '', level: '1', upgrade: 'yes' }; });
    var dated = topLevel ? datedEditor(data.dated) : null;
    var coresGroup = h('div', { class: 'form' }, cores.node, removeCores.node);
    var buildingsGroup = h('div', { class: 'form' }, buildings.node, stateBuildings.node);
    var node = topLevel
      ? h('div', { class: 'form' }, grid, partyLoyalty.node)
      : h('div', { class: 'form' }, grid, coresGroup, buildingsGroup, partyLoyalty.node);
    return {
      node: node,
      cores: coresGroup,
      buildings: buildingsGroup,
      dated: dated ? dated.node : null,
      read: function () {
        return {
          owner: valueOf(inputs.owner), controller: valueOf(inputs.controller),
          cores: cores.read(), removeCores: removeCores.read(),
          tradeGoods: valueOf(inputs.tradeGoods), lifeRating: valueOf(inputs.lifeRating), terrain: valueOf(inputs.terrain),
          colonial: valueOf(inputs.colonial), colony: valueOf(inputs.colony), isSlave: isSlave.checked ? 'yes' : undefined,
          buildings: buildings.read(), partyLoyalty: partyLoyalty.read(), stateBuildings: stateBuildings.read(),
          // Province flags are not edited here; the ones in the file are kept as they are.
          setFlags: data.setFlags || [], clrFlags: data.clrFlags || [], dated: dated ? dated.read() : []
        };
      }
    };
  }
  function listEditor(title, values, entries) {
    var rows = h('div', { class: 'rows' });
    function addRow(value) {
      var input = entries ? selectInput(value, entries, '(pick)') : textInput(value, null);
      var row = h('div', { class: 'row' }, input, h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); } }, '×'));
      rows.append(row);
      return input;
    }
    (values || []).forEach(addRow);
    var node = h('div', null, h('h3', null, title, ' ', h('button', { class: 'secondary icon', onclick: function () { addRow('').focus(); } }, '+')), rows);
    return { node: node, read: function () { return Array.prototype.map.call(rows.querySelectorAll('.field'), function (field) { return String(field.value).trim(); }).filter(function (value) { return value !== ''; }); } };
  }
  function rowsEditor(title, items, columns, blank, options) {
    options = options || {};
    var rows = h('div', { class: 'rows' });
    function addRow(item) {
      var inputs = columns.map(function (column) {
        var input = column[5] ? selectInput(item[column[0]], column[5], '(pick)') : textInput(item[column[0]], column[2], column[3], column[4]);
        if (column[4]) { input.classList.add(column[4]); }
        return input;
      });
      var row = h('div', { class: 'row' }, inputs,
        options.duplicate ? h('button', { class: 'secondary icon', title: 'Duplicate', onclick: function () { addRow(readRow(row)); } }, '⧉') : null,
        h('button', { class: 'secondary icon remove', title: 'Remove', onclick: function () { row.remove(); rows.dispatchEvent(new Event('input', { bubbles: true })); } }, '×'));
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
      parts.push(list, h('div', { class: 'grid' }, h('label', null, 'File'), fileInput));
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
    return h('div', null, parts);
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
  }
  vscode.postMessage({ type: 'ready' });
})();
`;
