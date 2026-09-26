import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import { REBEL_OOB_FILE } from '../model/gamePaths.js';
import type { Range } from '../model/range.js';

/**
 * The engine loads the rebels' order of battle by opening `history/units/REB_oob.txt`
 * by name, and that lookup falls through to the base game whatever `replace_path`
 * says: hiding `history/units` hides the folder listing, not a file asked for by
 * its exact path. The base game's copy places the Carlist armies in provinces
 * 493 to 501, and on a map that does not reach those ids the game reads a null
 * province and crashes the moment a country is picked and Play is pressed.
 *
 * A mod therefore has to ship the file itself; an empty one is enough. A submod
 * passes on the file of the mod it depends on, which is why the check asks
 * whether any mod layer has it, never the game root.
 */
export function auditRebelOob(modLayersProvideFile: boolean, range: Range): Diagnostic[] {
  if (modLayersProvideFile) {
    return [];
  }
  return [
    diagnostic(
      'error',
      'missing-rebel-oob',
      `No mod in the stack ships ${REBEL_OOB_FILE}. The engine opens that file by name, so the base game's copy ` +
        'is loaded even when replace_path hides history/units, and its Carlist armies sit in provinces 493 to 501. ' +
        'On a map without those ids the game crashes when Play is pressed. Add the file; an empty one is enough.',
      range,
    ),
  ];
}
