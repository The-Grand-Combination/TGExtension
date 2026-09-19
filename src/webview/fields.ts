import type { NamedIdentifier } from '../model/mapEditor.js';
import { h } from './dom.js';

/**
 * The form controls the panel reads and writes as one thing: a plain input, a
 * slider with its readout, a tick box, or the searchable combo. Each is a node
 * in the DOM and a `Field` beside it, found again through `fieldOf`, so no
 * control has to pretend to be an input.
 */
export interface Field {
  readonly node: HTMLElement;
  value: string;
  focus(): void;
  /** The element that takes the caret and the placeholder, when the field has one. */
  readonly input: HTMLInputElement | null;
}

const fields = new WeakMap<HTMLElement, Field>();

export function fieldOf(node: Element | null | undefined): Field | undefined {
  return node instanceof HTMLElement ? fields.get(node) : undefined;
}

function register(field: Field): Field {
  fields.set(field.node, field);
  return field;
}

/** The fields under a node, in document order. */
export function fieldsIn(root: ParentNode, selector = '.field'): Field[] {
  const out: Field[] = [];
  for (const node of root.querySelectorAll(selector)) {
    const field = fieldOf(node);
    if (field) { out.push(field); }
  }
  return out;
}

export function valueOf(field: Field): string | undefined {
  const value = field.value.trim();
  return value === '' ? undefined : value;
}

export function plusButton(title: string, onClick: EventListener): HTMLButtonElement {
  return h('button', { class: 'glyph plus', title: title, 'aria-label': title, onclick: onClick });
}

/** The `×` that takes a row, or a value, away. Every one in the panel is this button. */
export function removeButton(title: string, onClick: EventListener): HTMLButtonElement {
  return h('button', { class: 'secondary icon remove', title: title, onclick: onClick }, '×');
}

/** A tick with its text beside it: what a yes/no outside a table looks like. */
export function checkRow(text: string, checked: boolean): { readonly node: HTMLElement; readonly box: HTMLInputElement } {
  const box = h('input', { type: 'checkbox' });
  box.checked = checked;
  return { node: h('label', { class: 'check' }, box, text), box: box };
}

export function textInput(value: string | undefined, type?: string, extraClass?: string): Field {
  const input = h('input', { type: type ?? 'text', class: 'field' + (extraClass ? ' ' + extraClass : ''), spellcheck: 'false' });
  input.value = value ?? '';
  return register({
    node: input,
    input: input,
    get value(): string { return input.value; },
    set value(next: string) { input.value = next; },
    focus: function (): void { input.focus(); },
  });
}

export interface SliderRange {
  readonly min: number;
  readonly max: number;
  /** Draw a dot per step: a short range is picked, not dragged. */
  readonly ticks?: boolean;
  /** What each step is called, from `min` up; the number itself when absent. */
  readonly labels?: readonly string[];
}

/** A range with its value beside it, read and written like a plain field. */
export function sliderInput(value: string | undefined, range: SliderRange, extraClass?: string): Field {
  const input = h('input', { type: 'range', min: String(range.min), max: String(range.max) });
  const readout = h('span', { class: 'readout' });
  const dots = range.ticks
    ? h('div', { class: 'rail' }, Array.from({ length: range.max - range.min + 1 }, function () { return h('span'); }))
    : null;
  const track = h('div', { class: 'range' }, dots, input);
  const classes = 'slider field' + (range.ticks ? ' stepped' : '') + (extraClass ? ' ' + extraClass : '');
  const wrapper = h('div', { class: classes }, track, readout);
  function show(): void {
    readout.textContent = range.labels?.[Number(input.value) - range.min] ?? input.value;
  }
  function setValue(next: string): void {
    input.value = next === '' ? String(range.min) : next;
    show();
  }
  input.addEventListener('input', show);
  setValue(value ?? '');
  return register({
    node: wrapper,
    input: input,
    get value(): string { return input.value; },
    set value(next: string) { setValue(next); },
    focus: function (): void { input.focus(); },
  });
}

/** A yes/no field as a box: ticked reads `yes`, unticked reads empty, which writes no line. */
export function checkInput(value: string | undefined): Field {
  const box = h('input', { type: 'checkbox' });
  box.checked = (value ?? '').trim().toLowerCase() === 'yes';
  const wrapper = h('div', { class: 'tick field' }, box);
  return register({
    node: wrapper,
    input: null,
    get value(): string { return box.checked ? 'yes' : ''; },
    set value(next: string) { box.checked = next.trim().toLowerCase() === 'yes'; },
    focus: function (): void { box.focus(); },
  });
}

/** Set the placeholder on whichever element actually takes the caret. */
export function setPlaceholder(field: Field, text: string): void {
  if (field.input) { field.input.placeholder = text; }
}

/** Grey a part of the form out and stop it taking input: the province cannot have it. */
export function lock(node: HTMLElement): void {
  node.classList.add('locked');
  for (const element of node.querySelectorAll('input, select, button, textarea')) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.disabled = true;
    }
  }
}

/** The example row steps aside for the first real one; it comes back when the last row goes. */
export function dropGhost(rows: HTMLElement): void {
  const ghost = rows.querySelector('.row.ghost');
  if (ghost) { ghost.remove(); }
}

/** A combo row: a vocabulary entry, or the synthetic "none" row at the top. */
interface ComboEntry {
  readonly id: string;
  readonly label: string;
  readonly name?: string;
  readonly swatch?: string;
  readonly empty?: boolean;
}

/** The colour square a palette row carries; the page has no inline styles, so it is set on the node. */
function swatchOf(color: string): HTMLElement {
  const box = h('span', { class: 'swatch' });
  box.style.background = color;
  return box;
}

/** A row of the pick list: `identifier` plain, and the localised name after it set apart. */
function comboItemContent(entry: ComboEntry): (string | HTMLElement)[] {
  const swatch = entry.swatch === undefined ? [] : [swatchOf(entry.swatch)];
  if (entry.name === undefined || entry.name === '') { return [...swatch, entry.label]; }
  return [...swatch, entry.id, h('span', { class: 'combo-name' }, ' - ' + entry.name)];
}

/**
 * A palette index, picked the way a colour is: the same square and the same
 * value beside it as the province map's own picker, so the row never moves —
 * what changes is that clicking opens the list of what this file's palette
 * means rather than the colours of the operating system.
 */
export function paletteInput(value: string | undefined, entries: readonly NamedIdentifier[]): Field {
  const box = h('button', { class: 'swatch-box', type: 'button' });
  const text = h('span', { class: 'value' });
  const list = h('div', { class: 'combo-list up', hidden: true });
  const wrapper = h('div', { class: 'tint palette field' }, box, text, list);
  let selected = value ?? '';
  function entryOf(id: string): NamedIdentifier | undefined {
    return entries.find(function (entry) { return entry.id === id; });
  }
  function show(): void {
    const entry = entryOf(selected);
    box.style.background = entry?.swatch ?? 'transparent';
    text.textContent = entry ? entry.label : selected;
    box.title = 'Painting with ' + (entry ? entry.label : selected);
  }
  function close(): void { list.hidden = true; }
  function pick(id: string): void {
    selected = id;
    show();
    close();
    wrapper.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function open(): void {
    list.replaceChildren(...entries.map(function (entry) {
      return h('div', {
        class: 'combo-item' + (entry.id === selected ? ' active' : ''),
        onmousedown: function (event: Event) { event.preventDefault(); pick(entry.id); },
      }, swatchOf(entry.swatch ?? 'transparent'), entry.label);
    }));
    list.hidden = false;
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }
  function step(by: number): void {
    const at = entries.findIndex(function (entry) { return entry.id === selected; });
    const next = entries[Math.min(entries.length - 1, Math.max(0, at + by))];
    if (next) { pick(next.id); }
    if (!list.hidden) { open(); }
  }
  box.addEventListener('click', function () { if (list.hidden) { open(); } else { close(); } });
  box.addEventListener('blur', close);
  box.addEventListener('keydown', function (event: KeyboardEvent) {
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') { return; }
    event.preventDefault();
    step(event.key === 'ArrowDown' ? 1 : -1);
  });
  text.addEventListener('click', function () { box.focus(); if (list.hidden) { open(); } });
  show();
  return register({
    node: wrapper,
    input: null,
    get value(): string { return selected; },
    set value(next: string) { selected = next; show(); },
    focus: function (): void { box.focus(); },
  });
}

const COMBO_LIMIT = 80;
/**
 * A searchable pick list over { id, label } entries: typing filters by id or
 * label, arrows move, Enter picks, Escape reverts. The field's value is the
 * picked id; a value the list lacks is kept (and shown as such), and a typed
 * text that matches nothing is taken as a raw id.
 */
export function selectInput(
  value: string | undefined,
  entries: readonly NamedIdentifier[],
  emptyLabel?: string,
  freeText?: boolean,
): Field {
  const byId = new Map<string, ComboEntry>();
  for (const entry of entries) { byId.set(entry.id, entry); }
  const input = h('input', { type: 'text', spellcheck: 'false', placeholder: emptyLabel ?? '' });
  const list = h('div', { class: 'combo-list', hidden: true });
  // The closed field reads as a list row: the input's own text is hidden under
  // this, so the localised name is set apart there as well. Typing brings the
  // real text back, since that is what the filter works on.
  const display = h('span', { class: 'combo-display', hidden: true });
  const wrapper = h('div', { class: 'combo field' }, input, display, list);
  let selected = '';
  let shown: ComboEntry[] = [];
  let activeIndex = -1;
  let focused = false;
  function labelOf(id: string): string {
    const entry = byId.get(id);
    if (entry) { return entry.label; }
    return id === '' || freeText === true ? id : id + ' (not in the mod)';
  }
  function paintDisplay(): void {
    const entry = focused ? undefined : byId.get(selected);
    const show = entry !== undefined && (entry.name ?? '') !== '';
    // One element, not two: the overlay lays its children out as a flex row, and a
    // flex item loses the space it starts with — which is the one before the dash.
    if (entry && show) { display.replaceChildren(h('span', null, ...comboItemContent(entry))); }
    display.hidden = !show;
    wrapper.classList.toggle('named', show);
  }
  function setValue(id: string | undefined): void {
    selected = id ?? '';
    input.value = labelOf(selected);
    paintDisplay();
  }
  function pick(id: string): void {
    setValue(id);
    close();
    wrapper.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function close(): void { list.hidden = true; activeIndex = -1; }
  function render(filter: string): void {
    const needle = filter.toLowerCase();
    shown = entries.filter(function (entry) {
      return needle === '' || entry.id.toLowerCase().includes(needle) || entry.label.toLowerCase().includes(needle);
    }).slice(0, COMBO_LIMIT);
    if (emptyLabel !== undefined && needle === '') { shown.unshift({ id: '', label: emptyLabel, empty: true }); }
    list.replaceChildren();
    shown.forEach(function (entry, index) {
      list.append(h('div', {
        class: 'combo-item' + (index === activeIndex ? ' active' : '') + (entry.empty ? ' empty' : ''),
        onmousedown: function (event) { event.preventDefault(); pick(entry.id); }
      }, ...comboItemContent(entry)));
    });
    list.hidden = shown.length === 0;
    const active = list.querySelector('.active');
    if (active) { active.scrollIntoView({ block: 'nearest' }); }
  }
  // Only an entry of the list (or nothing) can be picked; other text reverts to
  // the current value, unless the field takes free text — a file name the mod
  // has yet to hold is one, and the single shown entry must not hijack it.
  function commit(): void {
    const text = input.value.trim();
    if (text === labelOf(selected)) { return; }
    if (text === '') { pick(''); return; }
    const lower = text.toLowerCase();
    const match = entries.find(function (entry) { return entry.label.toLowerCase() === lower || entry.id.toLowerCase() === lower; });
    if (match) { pick(match.id); return; }
    if (freeText === true) { pick(text); return; }
    const only = shown.length === 1 ? shown[0] : undefined;
    if (only && !only.empty) { pick(only.id); return; }
    setValue(selected);
  }
  input.addEventListener('focus', function () { focused = true; paintDisplay(); input.select(); activeIndex = -1; });
  // A click opens the list, focus alone does not: a row added to a list lands on
  // an empty field with the rows under it still in view.
  input.addEventListener('click', function () { if (list.hidden) { activeIndex = -1; render(''); } });
  input.addEventListener('input', function () { activeIndex = -1; render(input.value.trim()); });
  input.addEventListener('blur', function () { focused = false; commit(); close(); paintDisplay(); });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) { render(input.value.trim()); }
      activeIndex = Math.max(0, Math.min(shown.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      render(input.value.trim());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const active = activeIndex >= 0 ? shown[activeIndex] : undefined;
      if (active) { pick(active.id); } else { commit(); close(); }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setValue(selected);
      close();
    }
  });
  setValue(value);
  return register({
    node: wrapper,
    input: input,
    get value(): string { return selected; },
    set value(next: string) { setValue(next); },
    focus: function (): void { input.focus(); },
  });
}
