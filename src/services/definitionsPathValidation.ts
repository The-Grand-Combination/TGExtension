import type { Document } from '../model/ast.js';
import { firstByKey } from '../model/astQuery.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';

/**
 * `definitions` in a mod's `map/default.map` must name that mod's own
 * `definition.csv`. The game resolves this one file name against its own
 * `map/` folder, not through the mod's `path`, so a mod writes
 * `"../mod/<folder>/map/definition.csv"`. A plain `"definition.csv"` loads the
 * base game's provinces; another mod's folder loads that mod's. Either way the
 * province table no longer matches this mod's `provinces.bmp` and history, and
 * the game crashes or misplaces provinces when a game starts.
 *
 * `modPath` is the descriptor's `path` (`mod/TGC`).
 */
export function validateDefinitionsPath(document: Document, modPath: string): Diagnostic[] {
  const entry = firstByKey(document.entries, 'definitions');
  if (entry?.value.kind !== 'scalar') {
    return [];
  }
  const value = entry.value.value;
  const written = forwardSlashes(value);
  const ownFolder = `../${forwardSlashes(modPath)}/map/`;
  if (written.toLowerCase().startsWith(ownFolder.toLowerCase()) && written.length > ownFolder.length) {
    return [];
  }
  return [
    diagnostic(
      'error',
      'definitions-outside-mod',
      `definitions = "${value}" ${whereItPoints(written)}. The game reads this file from its own map/ folder, so write "${ownFolder}definition.csv".`,
      entry.value.range,
    ),
  ];
}

function whereItPoints(written: string): string {
  const otherMod = /^\.\.\/(mod\/[^/]+)\//i.exec(written)?.[1];
  if (otherMod !== undefined) {
    return `loads the provinces of another mod (${otherMod})`;
  }
  return written.includes('/') ? 'points outside this mod' : "loads the base game's provinces, not this mod's";
}

function forwardSlashes(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}
