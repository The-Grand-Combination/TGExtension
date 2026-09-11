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
  return diagnostics.filter(
    (item) => !ignored.some((span) => item.range.start >= span.start && item.range.start < span.end),
  );
}

/** Offset spans of the lines containing the marker, matched case-insensitively. */
function ignoredLineSpans(text: string, marker: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const lowerText = text.toLowerCase();
  const lowerMarker = marker.toLowerCase();
  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    if (lowerText.lastIndexOf(lowerMarker, lineEnd) >= lineStart) {
      spans.push({ start: lineStart, end: lineEnd + 1 });
    }
    if (newline === -1) {
      break;
    }
    lineStart = newline + 1;
  }
  return spans;
}
