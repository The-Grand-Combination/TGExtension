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
