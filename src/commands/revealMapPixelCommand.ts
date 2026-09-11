import type { MapEditorPanel } from '../providers/mapEditorPanel.js';
import type { RevealMapPixelArgs } from '../providers/reportLinkProvider.js';

/**
 * Open the Map Editor on the pixel a map report finding points at. Reached only
 * by ctrl+click on a map report line, so it asks nothing: the report already
 * knows which mods its map was read with.
 */
export function revealMapPixelCommand(panel: MapEditorPanel): (args: RevealMapPixelArgs) => Promise<void> {
  return async (args: RevealMapPixelArgs): Promise<void> => {
    await panel.open(
      { workspaceFolders: args.workspaceFolders, mods: args.mods },
      { file: args.file, x: args.x, y: args.y },
    );
  };
}
