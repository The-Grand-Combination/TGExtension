import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import type { ModIndex } from '../model/modIndex.js';
import { CATEGORY_LABELS } from '../model/symbols.js';

/**
 * Turn index-time duplicates into per-file diagnostics. Modifiers may legally
 * share a name across event/triggered/static modifier files, so cross-file
 * modifier duplicates are warnings; same-file duplicates are always errors.
 */
export function duplicateDiagnosticsByFile(index: ModIndex): Map<string, Diagnostic[]> {
  const byFile = new Map<string, Diagnostic[]>();
  for (const duplicate of index.duplicates) {
    for (const occurrence of duplicate.occurrences) {
      const sameFileOthers = duplicate.occurrences.filter(
        (other) => other !== occurrence && other.filePath === occurrence.filePath,
      );
      const otherFiles = [
        ...new Set(
          duplicate.occurrences
            .filter((other) => other.filePath !== occurrence.filePath)
            .map((other) => other.filePath),
        ),
      ];
      const places = [...(sameFileOthers.length > 0 ? ['this file'] : []), ...otherFiles];
      const crossFileModifier = duplicate.category === 'modifier' && sameFileOthers.length === 0;
      const list = byFile.get(occurrence.filePath) ?? [];
      list.push(
        crossFileModifier
          ? diagnostic(
              'warning',
              'duplicate-modifier-name',
              `Modifier '${duplicate.name}' is also defined in ${otherFiles.join(', ')}. This is allowed, but localization may be confused.`,
              occurrence.range,
            )
          : diagnostic(
              'error',
              'duplicate-identifier',
              `Duplicate ${CATEGORY_LABELS[duplicate.category]} '${duplicate.name}' — also defined in ${places.join(', ')}.`,
              occurrence.range,
            ),
      );
      byFile.set(occurrence.filePath, list);
    }
  }
  return byFile;
}

/**
 * Per-file view of an index's duplicates, memoized on the index object. The
 * editor asks for one file's duplicates on every validation pass, and rebuilding
 * the whole map each time is wasted work; a new index is a new key, so the
 * memo can never go stale.
 */
const duplicatesByIndex = new WeakMap<ModIndex, Map<string, Diagnostic[]>>();

export function duplicateDiagnosticsFor(index: ModIndex, filePath: string): readonly Diagnostic[] {
  let byFile = duplicatesByIndex.get(index);
  if (!byFile) {
    byFile = duplicateDiagnosticsByFile(index);
    duplicatesByIndex.set(index, byFile);
  }
  return byFile.get(filePath) ?? [];
}
