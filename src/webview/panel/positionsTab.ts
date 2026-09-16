import type { ProvinceDetails } from '../../model/mapEditor.js';
import { render, selectionCenter } from '../canvas.js';
import { h, setStatus } from '../dom.js';
import { lock, removeButton, textInput } from '../fields.js';
import { asPositions, capturePending, degreesOf, editableHere, setDraftPoint } from '../positions.js';
import { POSITION_KIND_SPECS, state } from '../state.js';
import { layerNote, postSave, saveBar, sectionHeader } from './panel.js';

// Positions: one row per kind, the swatch doubling as the map legend. Typing
// moves the point on the map at once; dragging the point fills the row.
export function positionsSection(current: ProvinceDetails): HTMLElement {
  const section = current.positions;
  state.positionInputs = {};
  state.labelInputs = null;
  const rows = h('div', { class: 'rows' });
  for (const spec of POSITION_KIND_SPECS) {
    const point = state.draft?.[spec.kind];
    const x = textInput(point ? point.x : '', 'number');
    const y = textInput(point ? point.y : '', 'number');
    const xInput = x.input;
    const yInput = y.input;
    if (!xInput || !yInput) { continue; }
    xInput.step = '0.01'; yInput.step = '0.01'; xInput.placeholder = 'x'; yInput.placeholder = 'y';
    function changed(): void {
      const xText = x.value.trim();
      const yText = y.value.trim();
      if (state.draft) { state.draft[spec.kind] = xText !== '' && yText !== '' ? { x: xText, y: yText } : undefined; }
      capturePending();
      render();
    }
    xInput.addEventListener('input', changed);
    yInput.addEventListener('input', changed);
    const swatch = h('span', { class: 'swatch', title: spec.label });
    swatch.style.background = spec.color;
    const clear = removeButton('Clear ' + spec.label, function () { x.value = ''; y.value = ''; changed(); });
    const center = h('button', { class: 'glyph center', title: 'Put ' + spec.label + ' in the middle of the province', 'aria-label': 'Center ' + spec.label, onclick: function () {
      const middle = selectionCenter();
      if (!middle) { setStatus('The province has no pixels to centre on.', 'warning'); return; }
      setDraftPoint(spec.kind, middle.x, middle.y);
    } });
    state.positionInputs[spec.kind] = { x: xInput, y: yInput };
    const row = h('div', { class: 'row pos-row' }, swatch, h('span', { class: 'pos-label' }, spec.label), center, xInput, yInput, clear);
    if (!editableHere(spec.kind, current.isSea)) { lock(row); }
    rows.append(row);
  }
  const bar = saveBar(function () {
    postSave({ section: 'positions', data: asPositions(state.draft ?? {}) });
  });
  return h('div', { class: 'section' },
    sectionHeader('Positions', section, { text: 'No entry in map/positions.txt; saving adds one', warning: true }),
    layerNote(section),
    h('p', { class: 'hint' }, current.isSea
      ? 'A sea province carries where the game draws its name and where it draws fleets in it. y counts from the bottom of the map. Zoom in until the points show; drag one to move it, or type here.'
      : 'Where the game draws the province\'s name, unit, city, factory and buildings. y counts from the bottom of the map. Zoom in until the points show; drag one to move it, or type here.'),
    h('div', { class: 'head pos-head' }, h('span', null, 'x'), h('span', null, 'y')),
    rows,
    labelRow(),
    bar);
}

/**
 * How the game draws the name from the Text point: the angle it turns it by and
 * the size it draws it at. The file keeps the angle in radians, so the field
 * does too, with the degrees beside it. Dragging the grip at the end of the name
 * on the map writes here.
 */
function labelRow(): HTMLElement {
  const rotation = textInput(state.draft?.text_rotation ?? '', 'number');
  const scale = textInput(state.draft?.text_scale ?? '', 'number');
  const degrees = h('span', { class: 'deg' }, degreesOf(state.draft?.text_rotation));
  const row = h('div', { class: 'row pos-row label-row' },
    h('span', { class: 'swatch' }),
    h('span', { class: 'pos-label' }),
    h('span', { class: 'sub' }, 'rotation'), rotation.node, degrees,
    h('span', { class: 'sub' }, 'scale'), scale.node);
  const rotationInput = rotation.input;
  const scaleInput = scale.input;
  if (!rotationInput || !scaleInput) { return row; }
  rotationInput.step = '0.01'; rotationInput.placeholder = 'radians';
  scaleInput.step = '0.01'; scaleInput.min = '0'; scaleInput.placeholder = 'scale';
  function changed(): void {
    if (state.draft) {
      state.draft.text_rotation = written(rotation.value);
      state.draft.text_scale = written(scale.value);
    }
    degrees.textContent = degreesOf(rotation.value);
    capturePending();
    render();
  }
  rotationInput.addEventListener('input', changed);
  scaleInput.addEventListener('input', changed);
  state.labelInputs = { rotation: rotationInput, degrees: degrees };
  return row;
}

function written(value: string): string | undefined {
  const text = value.trim();
  return text === '' ? undefined : text;
}
