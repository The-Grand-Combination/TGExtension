import type { Diagnostic } from '../model/diagnostic.js';
import { CSV_FILE_TYPES, type FileType } from '../model/fileType.js';
import type { ModIndex } from '../model/modIndex.js';
import { DEFAULT_VALIDATION_OPTIONS, type ValidationOptions } from '../model/validationOptions.js';
import { duplicateDiagnosticsFor } from './duplicateDiagnostics.js';
import { validateMapCsv } from './mapCsvValidation.js';
import { validateSemantics } from './semanticValidation.js';
import { validateStructure } from './structureValidation.js';
import { parseDocument } from './syntaxValidation.js';

/**
 * Every diagnostic for one file's text: syntax, structure, and semantics for
 * script files; the CSV validator for the map CSVs; plus the identifiers this
 * file defines that the index found defined elsewhere too. Semantic checks and
 * duplicates need a mod index and are skipped without one.
 */
export function validateFileText(
  text: string,
  fileType: FileType,
  index: ModIndex | undefined,
  relativePath: string | undefined,
  options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS,
): Diagnostic[] {
  return dropIgnoredLines(text, findingsOf(text, fileType, index, relativePath, options), options.ignoreMarker);
}

function findingsOf(
  text: string,
  fileType: FileType,
  index: ModIndex | undefined,
  relativePath: string | undefined,
  options: ValidationOptions,
): Diagnostic[] {
  const duplicates = index && relativePath !== undefined ? duplicateDiagnosticsFor(index, relativePath) : [];
  if (CSV_FILE_TYPES.has(fileType)) {
    return index ? [...validateMapCsv(text, fileType, index), ...duplicates] : [];
  }
  const parseResult = parseDocument(text);
  const semantic =
    index && fileType !== 'unknown'
      ? validateSemantics(parseResult.document, fileType, index, relativePath, options)
      : [];
  return [
    ...parseResult.diagnostics,
    ...validateStructure(parseResult.document, fileType),
    ...semantic,
    ...duplicates,
  ];
}

/**
 * A line carrying the ignore marker silences every finding that starts on it.
 * The marker is a comment to the game, so it costs the mod nothing, and doing
 * this once over the finished list covers every rule — syntax, structure,
 * semantics, CSV and cross-file duplicates alike.
 */
function dropIgnoredLines(text: string, diagnostics: Diagnostic[], marker: string): Diagnostic[] {
  if (marker === '' || diagnostics.length === 0) {
    return diagnostics;
  }
  const ignored = ignoredLineSpans(text, marker);
  if (ignored.length === 0) {
    return diagnostics;
  }
  return diagnostics.filter((item) => !isIgnored(ignored, item.range.start));
}

interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Offset spans of the lines containing the marker, matched case-insensitively.
 * The marker is found in one forward pass and each hit is widened to its line.
 * Walking line by line and searching each one would re-read the text from the
 * start every time, which is quadratic: a large mod ships script files of ten
 * megabytes, and that alone cost minutes.
 */
function ignoredLineSpans(text: string, marker: string): Span[] {
  const spans: Span[] = [];
  const pattern = new RegExp(escapeRegExp(marker), 'gi');
  let match = pattern.exec(text);
  while (match !== null) {
    const newline = text.indexOf('\n', match.index);
    const end = newline === -1 ? text.length : newline + 1;
    spans.push({ start: text.lastIndexOf('\n', match.index) + 1, end });
    if (newline === -1) {
      break;
    }
    // One span per line: a second marker on the same line adds nothing.
    pattern.lastIndex = end;
    match = pattern.exec(text);
  }
  return spans;
}

/** Whether an offset falls on an ignored line; the spans are sorted, so a binary search settles it. */
function isIgnored(spans: readonly Span[], offset: number): boolean {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const span = spans[middle];
    if (span === undefined || offset < span.start) {
      high = middle - 1;
    } else if (offset >= span.end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
