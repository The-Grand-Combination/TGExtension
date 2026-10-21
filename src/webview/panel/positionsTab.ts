import type { ProvinceDetails } from '../../model/mapEditor.js';
import { render, selectionCenter } from '../canvas.js';
import { h, setStatus } from '../dom.js';
import { lock, removeButton, textInput } from '../fields.js';
import { asPositions, capturePending, degreesOf, editableHere, setDraftPoint } from '../positions.js';
import { POSITION_KIND_SPECS, state, type AngleKey } from '../state.js';
import { layerNote, postSave, saveBar, sectionHeader } from './panel.js';

// Positions: one row per kind, the swatch doubling as the map legend. Typing
// moves the point on the map at once; dragging the point fills the row.
export function positionsSection(current: ProvinceDetails): HTMLElement {
  const section = current.positions;
  state.positionInputs = {};
  state.angleInputs = {};
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
    const center = h('button', { class: 'glyph center', title: 'Put ' + spec.label + ' near the middle of the province', 'aria-label': 'Center ' + spec.label, onclick: function () {
      const middle = selectionCenter();
      if (!middle) { setStatus('The province has no pixels to centre on.', 'warning'); return; }
      setDraftPoint(spec.kind, middle.x, middle.y);
    } });
    state.positionInputs[spec.kind] = { x: xInput, y: yInput };
    const row = h('div', { class: 'row pos-row' }, swatch, h('span', { class: 'pos-label' }, spec.label), center, xInput, yInput, clear);
    if (!editableHere(spec.kind, current.isSea)) { lock(row); }
    rows.append(row);
    // The name's angle and size, and the port's angle, hang under their point: they are how it is drawn from there.
    if (spec.kind === 'text_position') { rows.append(angleRow('Name Rotation', 'text_rotation'), scaleRow()); }
    if (spec.kind === 'naval_base') {
      const angle = angleRow('Port Rotation', 'naval_base_rotation');
      if (!editableHere(spec.kind, current.isSea)) { lock(angle); }
      rows.append(angle);
    }
  }
  const bar = saveBar(function () {
    postSave({ section: 'positions', data: asPositions(state.draft ?? {}) });
  });
  return h('div', { class: 'section' },
    sectionHeader('Positions', section, { text: 'No entry in map/positions.txt; saving adds one', warning: true }),
    layerNote(section),
    h('p', { class: 'hint' }, current.isSea
      ? 'A sea province carries where the game draws its name and where it draws fleets in it. y counts from the bottom of the map. Zoom in until the points show; drag one to move it, or type here.'
      : 'Where the game draws the province\'s name, unit, city, factory, construction site and buildings. y counts from the bottom of the map. Zoom in until the points show; drag one to move it, or type here. The triangle beside the port points the way it faces: drag it to turn the port.'),
    h('div', { class: 'head pos-head' }, h('span', null, 'x'), h('span', null, 'y')),
    rows,
    bar);
}

/**
 * An angle the game turns something by, under the row of its point, with no
 * legend dot because it is not a place on the map. The file keeps it in
 * radians, so the field does too, with the degrees beside it; dragging the grip
 * on the map writes here.
 */
function angleRow(label: string, key: AngleKey): HTMLElement {
  const angle = textInput(state.draft?.[key] ?? '', 'number');
  const degrees = h('span', { class: 'deg' }, degreesOf(state.draft?.[key]));
  const row = h('div', { class: 'row pos-row scalar-row' }, h('span', { class: 'pos-label' }, label), angle.node, degrees);
  const input = angle.input;
  if (!input) { return row; }
  input.step = '0.01'; input.placeholder = 'radians';
  input.addEventListener('input', function () {
    if (state.draft) { state.draft[key] = written(angle.value); }
    degrees.textContent = degreesOf(angle.value);
    capturePending();
    render();
  });
  state.angleInputs[key] = { input: input, degrees: degrees };
  return row;
}

/** The size the game draws the name at, under its angle. */
function scaleRow(): HTMLElement {
  const scale = textInput(state.draft?.text_scale ?? '', 'number');
  const row = h('div', { class: 'row pos-row scalar-row' }, h('span', { class: 'pos-label' }, 'Name Scale'), scale.node);
  const input = scale.input;
  if (!input) { return row; }
  input.step = '0.01'; input.min = '0'; input.placeholder = 'scale';
  input.addEventListener('input', function () {
    if (state.draft) { state.draft.text_scale = written(scale.value); }
    capturePending();
    render();
  });
  return row;
}

function written(value: string): string | undefined {
  const text = value.trim();
  return text === '' ? undefined : text;
}
