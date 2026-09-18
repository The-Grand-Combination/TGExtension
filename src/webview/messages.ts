import type { HostMessage, PositionMarker, ProvinceDetails, ProvinceLabel, SaveResult } from '../model/mapEditor.js';
import { highlightOf, render } from './canvas.js';
import { saveAllButton, setStatus, showLoading, targetBox } from './dom.js';
import { messageOf } from './host.js';
import { applyReveal, clearSelectionState } from './input.js';
import { applyThumbnails, applyTint, loadProvinces, refreshTint, resetLayers } from './layers.js';
import { applyUndoLimit, handlePainted, resetPaint, saveNewProvincePaint, setTool } from './paint.js';
import { carryForms, failureText, fileNames, finishSave, renderSide, resetPanel, savingParts, showHint, handleTerrainPicture } from './panel/panel.js';
import { asPositions, capturePending, clonePoints, refreshPending, replaceMarkers } from './positions.js';
import { handleReferences, resetReferences } from './references.js';
import { definitionById, idByColor, locNameById, pendingPositions, seaIds, state, waterTerrain } from './state.js';

/** What the extension posts, and what each message changes on the page. */

function loadFreshMap(message: Extract<HostMessage, { type: 'map' }>): void {
  const fresh = message.map;
  state.map = fresh;
  idByColor.clear();
  definitionById.clear();
  seaIds.clear();
  waterTerrain.clear();
  for (const id of fresh.seaProvinces) { seaIds.add(id); }
  for (const index of fresh.waterTerrainIndices) { waterTerrain.add(index); }
  for (const definition of fresh.definitions) {
    idByColor.set(definition.color, definition.id);
    definitionById.set(definition.id, definition);
  }
  state.popDate = fresh.popDates[0] ?? '';
  targetBox.textContent = fresh.targetName;
  clearSelectionState();
  state.markers = [];
  state.labels = [];
  pendingPositions.clear();
  refreshPending();
  resetPanel();
  resetLayers(message.riversUri, message.terrainUri);
  resetPaint(); setTool('hand');
  resetReferences();
  showHint();
  loadProvinces(message.bmpUri);
}

function handleMessage(message: HostMessage): void {
  switch (message.type) {
    case 'map':
      loadFreshMap(message);
      return;
    case 'revealPixel':
      state.pendingReveal = { file: message.file, x: message.x, y: message.y };
      applyReveal();
      return;
    case 'thumbnails':
      applyThumbnails({ provinces: message.provinces, rivers: message.rivers, terrain: message.terrain });
      return;
    case 'references':
      handleReferences(message.folderUri, message.layers);
      return;
    case 'details':
      handleDetails(message.details);
      return;
    case 'positions':
      handlePositions(message.markers, message.labels);
      return;
    case 'settings':
      applyTint(message.countryColorsTint);
      applyUndoLimit(message.paintUndoSteps);
      return;
    case 'countryColors':
      state.countryColors = { kind: 'ready', owners: message.owners, colors: message.colors };
      refreshTint('country');
      return;
    case 'stateColors':
      state.stateOf = message.states;
      refreshTint('state');
      return;
    case 'saved':
      handleSaved(message.result);
      return;
    case 'painted':
      handlePainted(message.result);
      return;
    case 'savedAll':
      handleSavedAll(message.written, message.failed.length);
      return;
    case 'error':
      // Whatever was waiting on the extension is not coming: the page must not stay locked for it.
      finishSave();
      saveAllButton.disabled = false;
      setStatus(message.message, 'error');
      return;
    case 'terrainPicture':
      handleTerrainPicture(message.terrain, message.pictureDataUri);
      return;
  }
}

/** The file's points, and with them the name the game draws for each province. */
function handlePositions(markers: readonly PositionMarker[], labels: readonly ProvinceLabel[]): void {
  state.markers = [...markers];
  state.labels = [...labels];
  for (const label of labels) { locNameById.set(label.id, label.name); }
  render();
}

/**
 * Two clicks in a row race: a late answer would redraw the province we left,
 * terrain picture and all, over the one we are now on. A province that is still
 * only paint has no id to match on, so its colour stands for it.
 */
function handleDetails(fresh: ProvinceDetails): void {
  const forPaint = state.newColor !== null && fresh.isNew && state.selectedId === null;
  if (state.selectedId !== fresh.id && !forPaint) { return; }
  if (forPaint) {
    state.selectedId = fresh.id;
    state.selection = highlightOf(fresh.id, state.newColor ?? undefined);
  }
  state.details = fresh;
  // A rename reaches the map through here: the drawn name is the localisation's.
  locNameById.set(fresh.id, fresh.localisation.text);
  replaceMarkers(fresh.id, fresh.positions);
  renderSide(fresh.id);
  setStatus('Province ' + String(fresh.id));
}

/** Save all: what the page was holding is now on disk, so the map reads it from there. */
function handleSavedAll(written: readonly number[], failed: number): void {
  saveAllButton.disabled = false;
  for (const id of written) {
    const held = pendingPositions.get(id);
    if (held) { replaceMarkers(id, { file: undefined, inTarget: true, data: asPositions(held) }); }
    pendingPositions.delete(id);
    if (state.details?.id === id) { state.draftBaseline = clonePoints(state.draft); }
  }
  refreshPending();
  setStatus(failed > 0
    ? String(failed) + ' province(s) could not be saved; they are still held.'
    : 'Saved ' + String(written.length) + ' province(s)', failed > 0 ? 'error' : 'ok');
  render();
}

function handleSaved(result: SaveResult): void {
  finishSave();
  if (!result.ok) {
    setStatus(failureText(result), 'error');
    return;
  }
  const saved = result.details;
  const createdColor = saved.isNew ? null : state.newColor;
  if (createdColor !== null) {
    definitionById.set(saved.id, { id: saved.id, color: createdColor, name: saved.definitionName });
    idByColor.set(createdColor, saved.id);
    if (saved.isSea) { seaIds.add(saved.id); }
    state.newColor = null;
  }
  // Only the section that was saved is read back from the file; the points and
  // the forms of the other tabs are still the user's unsaved work.
  if (savingParts().has('positions')) { pendingPositions.delete(saved.id); } else { capturePending(); }
  refreshPending();
  // The label is rebuilt from this name, so a rename must land here first.
  locNameById.set(saved.id, saved.localisation.text);
  replaceMarkers(saved.id, saved.positions);
  if (state.selectedId !== saved.id) {
    setStatus('Saved province ' + String(saved.id), 'ok');
    render();
  } else {
    carryForms();
    state.details = saved;
    renderSide(saved.id);
    setStatus(result.written.length > 0 ? 'Saved ' + fileNames(result.written) : 'Nothing to save', 'ok');
  }
  // The province now has a row of its own; the paint it was made of goes
  // into provinces.bmp with it.
  if (createdColor !== null) { saveNewProvincePaint(); }
}

export function initMessages(): void {
  window.addEventListener('message', function (event: MessageEvent<HostMessage>) {
    try { handleMessage(event.data); } catch (error) { showLoading('Page error: ' + messageOf(error)); }
  });
}
