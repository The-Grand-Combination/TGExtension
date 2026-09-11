import type { ModIndex } from '../model/modIndex.js';
import { lineEndingOf, type TextPatch } from './textPatch.js';

/** Where a province's `PROV<id>` key is defined, as the index knows it. */
export interface ProvinceLocDefinition {
  readonly key: string;
  readonly text: string;
  /** Mod-root-relative path (`localisation/x.csv`), undefined when the key is not defined. */
  readonly filePath: string | undefined;
  readonly line: number;
}

/** The header the game ships; a new file gets it so every language column exists. */
export const LOCALISATION_HEADER =
  'CODE;ENGLISH;FRENCH;GERMAN;POLISH;SPANISH;ITALIAN;SWEDISH;CZECH;HUNGARIAN;DUTCH;PORTUGUESE;RUSSIAN;FINNISH;x';

/** The file a mod's province names go to when it has none yet; sorts first, so it wins over the game's text.csv. */
export const DEFAULT_PROVINCE_LOC_FILE = '00_map-provinces.csv';

export function provinceLocKey(provinceId: number): string {
  return `PROV${String(provinceId)}`;
}

export function readProvinceLoc(index: ModIndex, provinceId: number): ProvinceLocDefinition {
  const key = provinceLocKey(provinceId);
  const definition = index.locKeyDefinitions.get(key.toLowerCase());
  if (!definition) {
    return { key, text: '', filePath: undefined, line: 0 };
  }
  return { key, text: definition.text, filePath: definition.filePath, line: definition.line };
}

/**
 * Replace the ENGLISH column (the second field) of a CSV line. Every other
 * column, the `;x` terminator and the line ending stay as they are. Undefined
 * when the line does not exist or has no second field.
 */
export function patchProvinceLoc(csvText: string, line: number, newText: string): TextPatch | undefined {
  const lineStart = offsetOfLine(csvText, line);
  if (lineStart === undefined) {
    return undefined;
  }
  const lineEnd = endOfLine(csvText, lineStart);
  const firstSeparator = csvText.indexOf(';', lineStart);
  if (firstSeparator === -1 || firstSeparator >= lineEnd) {
    return undefined;
  }
  const fieldStart = firstSeparator + 1;
  const secondSeparator = csvText.indexOf(';', fieldStart);
  const fieldEnd = secondSeparator === -1 || secondSeparator > lineEnd ? lineEnd : secondSeparator;
  return { start: fieldStart, end: fieldEnd, text: sanitizeField(newText) };
}

/**
 * A new row at the end of the file, with as many columns as the header has
 * (`KEY;Text;;;;...;x`). A file without a header gets `KEY;Text;x`.
 */
export function appendProvinceLoc(csvText: string, key: string, text: string): TextPatch {
  const eol = lineEndingOf(csvText);
  const columns = headerColumnCount(csvText);
  const empties = Math.max(columns - 3, 0);
  const row = [key, sanitizeField(text), ...Array<string>(empties).fill(''), 'x'].join(';');
  const prefix = csvText === '' || csvText.endsWith('\n') ? '' : eol;
  return { start: csvText.length, end: csvText.length, text: `${prefix}${row}${eol}` };
}

/** A brand-new localisation file holding one province name. */
export function newProvinceLocFile(key: string, text: string): string {
  const header = `${LOCALISATION_HEADER}\r\n`;
  return header + appendProvinceLoc(header, key, text).text;
}

/** The 0-based line that defines `key` (case-insensitive), if the file has one. */
export function locKeyLine(csvText: string, key: string): number | undefined {
  const wanted = `${key.toLowerCase()};`;
  const lines = csvText.split('\n');
  for (let line = 0; line < lines.length; line++) {
    if ((lines[line] ?? '').trimStart().toLowerCase().startsWith(wanted)) {
      return line;
    }
  }
  return undefined;
}

/** How many `PROV<id>;` rows a localisation file holds. */
export function countProvinceKeys(csvText: string): number {
  return (csvText.match(/^PROV\d+;/gim) ?? []).length;
}

export interface LocFileCandidate {
  readonly name: string;
  readonly provinceKeyCount: number;
}

/** The mod's file holding the most province names, else the default file name. */
export function pickLocFileForNewKey(candidates: readonly LocFileCandidate[]): string {
  let best: LocFileCandidate | undefined;
  for (const candidate of candidates) {
    if (candidate.provinceKeyCount > 0 && (!best || candidate.provinceKeyCount > best.provinceKeyCount)) {
      best = candidate;
    }
  }
  return best?.name ?? DEFAULT_PROVINCE_LOC_FILE;
}

const FORBIDDEN_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/g;

/** `<id> - <name>.txt` with the characters Windows forbids in file names dropped. */
export function historyFileNameFor(provinceId: number, name: string): string {
  const safe = name.replace(FORBIDDEN_FILE_NAME_CHARACTERS, '').replace(/\s+/g, ' ').trim();
  return `${String(provinceId)} - ${safe === '' ? 'Province' : safe}.txt`;
}

function sanitizeField(text: string): string {
  return text.replace(/[;\r\n]/g, ' ').trim();
}

function headerColumnCount(csvText: string): number {
  const header = csvText.slice(0, endOfLine(csvText, 0)).replace(/\r$/, '');
  return header.trim() === '' ? 0 : header.split(';').length;
}

function offsetOfLine(text: string, line: number): number | undefined {
  let offset = 0;
  for (let current = 0; current < line; current++) {
    const newline = text.indexOf('\n', offset);
    if (newline === -1) {
      return undefined;
    }
    offset = newline + 1;
  }
  return offset <= text.length ? offset : undefined;
}

/** Offset of the `\r` or `\n` ending the line at `lineStart`, or the text length. */
function endOfLine(text: string, lineStart: number): number {
  const newline = text.indexOf('\n', lineStart);
  const end = newline === -1 ? text.length : newline;
  return end > lineStart && text.charAt(end - 1) === '\r' ? end - 1 : end;
}
