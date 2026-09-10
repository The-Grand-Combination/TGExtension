import type { Range } from '../model/range.js';

/** One trimmed `;`-separated field with its document offsets. */
export interface CsvField {
  readonly text: string;
  readonly range: Range;
}

export interface CsvRow {
  /** 0-based line number in the source text. */
  readonly line: number;
  readonly fields: readonly CsvField[];
  readonly range: Range;
}

export interface CsvOptions {
  /** Drop the first line (a column header). */
  readonly skipHeader?: boolean;
  /** Stop splitting after this many fields; the rest of the line is ignored. */
  readonly maxFields?: number;
}

/**
 * Rows of a Paradox `;`-separated file (map CSVs, localisation) with offsets
 * that point back into `text`. Blank lines and `#` comment lines are dropped;
 * a trailing `\r` is never part of a field.
 */
export function csvRows(text: string, options: CsvOptions = {}): CsvRow[] {
  const rows: CsvRow[] = [];
  const maxFields = options.maxFields ?? Number.POSITIVE_INFINITY;
  let offset = 0;
  const lines = text.split('\n');
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const rawLine = lines[lineNumber] ?? '';
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    const isHeader = lineNumber === 0 && options.skipHeader === true;
    if (!isHeader && trimmed !== '' && !trimmed.startsWith('#')) {
      rows.push(splitRow(line, lineNumber, offset, maxFields));
    }
    offset += rawLine.length + 1;
  }
  return rows;
}

function splitRow(line: string, lineNumber: number, lineOffset: number, maxFields: number): CsvRow {
  const fields: CsvField[] = [];
  let start = 0;
  while (fields.length < maxFields) {
    const separator = line.indexOf(';', start);
    const stop = separator === -1 ? line.length : separator;
    fields.push(trimmedField(line, start, stop, lineOffset));
    if (separator === -1) {
      break;
    }
    start = separator + 1;
  }
  return { line: lineNumber, fields, range: { start: lineOffset, end: lineOffset + line.length } };
}

function trimmedField(line: string, start: number, stop: number, lineOffset: number): CsvField {
  const raw = line.slice(start, stop);
  const leading = raw.length - raw.trimStart().length;
  const text = raw.trim();
  const fieldStart = lineOffset + start + leading;
  return { text, range: { start: fieldStart, end: fieldStart + text.length } };
}
