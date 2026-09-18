import { log } from './host.js';

/** The page's own markup defines these; a miss is a bug in the HTML, not a state to handle. */
export function required(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error('The page is missing #' + id + '.');
  }
  return node;
}

export function requiredButton(id: string): HTMLButtonElement {
  const node = required(id);
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error('#' + id + ' is not a button.');
  }
  return node;
}

export function requiredInput(id: string): HTMLInputElement {
  const node = required(id);
  if (!(node instanceof HTMLInputElement)) {
    throw new Error('#' + id + ' is not an input.');
  }
  return node;
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const node = required(id);
  if (!(node instanceof HTMLCanvasElement)) {
    throw new Error('#' + id + ' is not a canvas.');
  }
  return node;
}

export const mapArea = required('mapArea');
export const canvas = requiredCanvas('canvas');
const context = canvas.getContext('2d');
if (!context) {
  throw new Error('This webview has no 2d canvas context.');
}
export const ctx = context;
export const tooltip = required('tooltip');
export const loading = required('loading');
/** The panel's scrolling half; the Save bar is docked over it, not inside it. */
export const side = required('sideBody');
export const sideDock = required('sideDock');
export const saveAllButton = requiredButton('saveAllButton');
const statusBox = required('status');
export const targetBox = required('target');

export function setStatus(text: string, kind?: string): void {
  statusBox.textContent = text || '';
  statusBox.className = 'status ' + (kind ?? '');
}

/** The overlay over the map while something big is read or drawn; `logged` puts the line in the Output as well. */
export function showLoading(text: string, logged = true): void {
  loading.hidden = false;
  loading.textContent = text;
  if (logged) { log(text); }
}

export function hideLoading(): void {
  loading.hidden = true;
}

/** What `h` accepts as an attribute value; a function is bound as a listener. */
type AttributeValue = string | number | boolean | null | undefined | EventListener;
type Attributes = Record<string, AttributeValue>;
/** Anything `h` can append: nodes, text, or nested lists, with holes skipped. */
export type Child = Node | string | number | boolean | null | undefined | readonly Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attributes | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }
      if (key === 'class') {
        node.className = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    appendChildren(node, child);
  }
  return node;
}

function appendChildren(node: HTMLElement, child: Child): void {
  if (child === undefined || child === null || typeof child === 'boolean') { return; }
  if (typeof child === 'string') { node.append(document.createTextNode(child)); return; }
  if (typeof child === 'number') { node.append(document.createTextNode(String(child))); return; }
  if (child instanceof Node) { node.append(child); return; }
  for (const item of child) { appendChildren(node, item); }
}
