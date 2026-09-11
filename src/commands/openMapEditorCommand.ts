import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { MapEditorPanel } from '../providers/mapEditorPanel.js';
import { pickMods, type PickMemory } from './pickMods.js';

/**
 * Ask which mods the map should be read with, then open the Map Editor tab.
 * The top mod of the pick, in load order, receives every edit made there.
 */
export function openMapEditorCommand(
  getClient: () => LanguageClient | undefined,
  memory: PickMemory,
  panel: MapEditorPanel,
): () => Promise<void> {
  return async (): Promise<void> => {
    const outcome = await pickMods(getClient, memory, {
      title: 'Map Editor: which mods should the map be read with?',
      placeHolder: 'Space ticks a mod, Enter opens. Edits go to the last ticked mod in load order.',
      launchableOnly: false,
    });
    if (outcome.kind === 'cancelled') {
      return;
    }
    await panel.open({
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      mods: outcome.kind === 'picked' ? outcome.picked : [],
    });
  };
}
