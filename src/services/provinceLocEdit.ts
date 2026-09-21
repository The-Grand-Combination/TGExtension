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

/** Where a mod's province names go: one file with one job, created with the mod's first new province. */
export const PROVINCE_LOC_FILE = 'provinces.csv';

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

/**
 * Where a name the mod does not define yet is written. Only the mod's own
 * files are ever offered: a mod that leaves a province with the game's name has
 * that name read from the game's own file, and writing the new one there would
 * edit the base game under every other mod. So the mod's file already holding
 * the most province names wins, and failing that its `provinces.csv`, which the
 * write creates along with the folder.
 */
export function pickLocFileForNewKey(candidates: readonly LocFileCandidate[]): string {
  let best: LocFileCandidate | undefined;
  for (const candidate of candidates) {
    if (candidate.provinceKeyCount > 0 && (!best || candidate.provinceKeyCount > best.provinceKeyCount)) {
      best = candidate;
    }
  }
  if (best) {
    return best.name;
  }
  // Under whatever spelling the mod already has it: a second file differing
  // only in case is two the game reads and one the editor writes.
  const held = candidates.find(function (candidate) { return candidate.name.toLowerCase() === PROVINCE_LOC_FILE; });
  return held?.name ?? PROVINCE_LOC_FILE;
}

const FORBIDDEN_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/g;

/** Latin letters the NFD decomposition leaves whole, with the ASCII they stand for. */
const LATIN_LETTER_SHAPES: Readonly<Record<string, string>> = {
  'Æ': 'AE', 'æ': 'ae', 'Œ': 'OE', 'œ': 'oe', 'ß': 'ss',
  'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd', 'Ð': 'D', 'ð': 'd',
  'Ł': 'L', 'ł': 'l', 'Þ': 'TH', 'þ': 'th', 'ı': 'i',
};

const LATIN_LETTERS = new RegExp(`[${Object.keys(LATIN_LETTER_SHAPES).join('')}]`, 'g');

/** Printable ASCII: what the game reads out of a file name, and nothing else. */
const NOT_ASCII = /[^\x20-\x7e]/;

/**
 * The name with its Latin marks dropped, so `São José` keeps its words as
 * `Sao Jose`. The game reads a file name as plain ASCII and finds nothing where
 * an accent stands; a letter no ASCII one stands for is left as it is, for
 * `unfoldableCharacter` to refuse.
 */
export function foldToAscii(text: string): string {
  const shaped = text.replace(LATIN_LETTERS, (character, offset: number, whole: string) =>
    shapeOf(character, whole.slice(offset + 1)));
  return shaped.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * A letter's ASCII shape. A capital that stands for two letters keeps only its
 * own case when a lowercase letter follows it: `Ærø` is `Aero`, not `AEro`,
 * while `ÆRØ` stays `AERO`.
 */
function shapeOf(character: string, rest: string): string {
  const shape = LATIN_LETTER_SHAPES[character] ?? character;
  return shape.length > 1 && LOWERCASE_LETTER.test(rest) ? shape.charAt(0) + shape.slice(1).toLowerCase() : shape;
}

const LOWERCASE_LETTER = /^\p{Ll}/u;

/** The first folded character that is not printable ASCII, or undefined when the whole name folds. */
export function unfoldableCharacter(text: string): string | undefined {
  return NOT_ASCII.exec(foldToAscii(text))?.[0];
}

/** `<id> - <name>.txt`, folded to ASCII and without the characters Windows forbids. */
export function historyFileNameFor(provinceId: number, name: string): string {
  const safe = foldToAscii(name).replace(FORBIDDEN_FILE_NAME_CHARACTERS, '').replace(/\s+/g, ' ').trim();
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
