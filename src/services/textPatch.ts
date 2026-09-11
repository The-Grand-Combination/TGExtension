/** A replacement of `[start, end)` in a text; `end === start` inserts. */
export interface TextPatch {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Apply non-overlapping patches, whichever order they come in. Overlapping
 * patches are a programming error and throw rather than corrupt the file.
 */
export function applyPatches(text: string, patches: readonly TextPatch[]): string {
  const ordered = [...patches].sort((left, right) => left.start - right.start || left.end - right.end);
  let out = '';
  let cursor = 0;
  for (const patch of ordered) {
    if (patch.start < cursor) {
      throw new Error('overlapping text patches');
    }
    out += text.slice(cursor, patch.start) + patch.text;
    cursor = patch.end;
  }
  return out + text.slice(cursor);
}

/** The line ending the file uses; `\r\n` when any line ends that way. */
export function lineEndingOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** The indentation unit the file uses: a tab unless a line starts with spaces only. */
export function indentUnitOf(text: string): string {
  const spaces = /^( +)\S/m.exec(text);
  return spaces === null || /^\t+\S/m.test(text) ? '\t' : (spaces[1] ?? '  ');
}

/** Offset of the first character of the line containing `offset`. */
export function lineStartAt(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

/** Offset just past the line ending of the line containing `offset`, or the text length. */
export function lineEndAt(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline + 1;
}

/** The whitespace the line containing `offset` starts with. */
export function indentAt(text: string, offset: number): string {
  const start = lineStartAt(text, offset);
  return /^[ \t]*/.exec(text.slice(start, offset))?.[0] ?? '';
}

/**
 * A patch that removes `[start, end)` together with the rest of its line when
 * nothing else is on it (leading indentation, trailing blanks, line ending).
 */
export function deleteLinePatch(text: string, start: number, end: number): TextPatch {
  const lineStart = lineStartAt(text, start);
  const lineEnd = lineEndAt(text, end);
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (before.trim() === '' && after.trim() === '') {
    return { start: lineStart, end: lineEnd, text: '' };
  }
  return { start, end, text: '' };
}

/** `text` with exactly one line ending at its end, unless it is empty. */
export function ensureTrailingNewline(text: string, eol: string): string {
  if (text === '' || text.endsWith('\n')) {
    return text;
  }
  return text + eol;
}
