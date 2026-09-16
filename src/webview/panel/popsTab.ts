import type { PopEntry, ProvinceDetails } from '../../model/mapEditor.js';
import { h, type Child } from '../dom.js';
import { lock, selectInput } from '../fields.js';
import { selectProvince } from '../input.js';
import { state, vocabulary } from '../state.js';
import { forms } from './forms.js';
import { rowsEditor } from './history.js';
import { layerNote, postSave, saveBar, sectionHeader, type MissingNote } from './panel.js';

/** A field the form left empty is not written at all. */
function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

export function popsSection(current: ProvinceDetails): HTMLElement {
  const pops = current.pops;
  const missing: MissingNote = current.isSea
    ? { text: 'Sea tiles don\'t need pops.', warning: false }
    : { text: 'No pops in history/pops/' + state.popDate + '; pick a file below', warning: true };
  const parts: Child[] = [sectionHeader('Pops', pops, missing), layerNote(pops)];
  const currentMap = state.map;
  if (currentMap && currentMap.popDates.length > 1) {
    const dateField = selectInput(state.popDate, currentMap.popDates.map(function (date) { return { id: date, label: date }; }));
    dateField.node.addEventListener('input', function () { state.popDate = dateField.value; selectProvince(current.id); });
    parts.push(h('div', { class: 'grid lone' }, h('label', null, 'Start date'), dateField.node));
  }
  const names = currentMap?.popFiles[state.popDate] ?? [];
  const fileField = selectInput('', names.map(function (name) { return { id: name, label: name }; }), 'Existing or new file name', true);
  const fileRow = h('div', { class: 'grid lone' }, h('label', null, 'File'), fileField.node);
  // Where a block would be created. The row stands whether it is needed or not,
  // greyed once the province has a block, so the panel keeps its height from one
  // province to the next.
  if (pops.pops) { lock(fileRow); }
  parts.push(fileRow);
  const words = vocabulary();
  const held = forms.carriedPops ?? pops.pops ?? [];
  forms.carriedPops = null;
  const table = rowsEditor('Pops', held, [
    { key: 'type', placeholder: 'type', entries: words.popTypes },
    { key: 'culture', placeholder: 'culture', entries: words.cultures },
    { key: 'religion', placeholder: 'religion', entries: words.religions },
    { key: 'size', placeholder: 'size', type: 'number', extraClass: 'narrow' },
  ], function () { return { type: 'farmers', culture: '', religion: '', size: '1000' }; }, { duplicate: true });
  const total = h('div', { class: 'total' });
  function updateTotal(): void {
    const sum = table.read().reduce(function (acc, pop) { return acc + (Number(pop['size']) || 0); }, 0);
    total.textContent = 'Total size: ' + sum.toLocaleString();
  }
  table.rows.addEventListener('input', updateTotal);
  updateTotal();
  function readPops(): PopEntry[] {
    return table.read().map(function (pop): PopEntry {
      return {
        type: pop['type'] ?? '', culture: pop['culture'] ?? '', religion: pop['religion'] ?? '',
        size: pop['size'] ?? '', militancy: blankToUndefined(pop['militancy']), rebelType: blankToUndefined(pop['rebelType']),
      };
    });
  }
  forms.popsRead = readPops;
  forms.popsRendered = JSON.stringify(held);
  const bar = saveBar(function () { postSave({ section: 'pops', pops: readPops(), createInFile: fileField.value }); });
  parts.push(table.node, total, bar);
  return h('div', { class: 'section' }, parts);
}
