import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { readActiveMods } from '../config.js';
import { MODS_REQUEST, type ModDescriptor, type ModsResult } from '../model/modDescriptor.js';
import { isInsideRoot } from '../services/modLayout.js';
import { modSelectionItems, type ModSelectionItem } from '../services/modSelectionItems.js';

type ModPick = vscode.QuickPickItem & { readonly name?: string };

/** The last pick, kept per workspace so the dialog opens pre-filled when nothing is set in Settings. */
export interface PickMemory {
  recall(): readonly string[];
  remember(names: readonly string[]): Thenable<void>;
}

export interface ModPickOptions {
  readonly title: string;
  readonly placeHolder: string;
  /** Only mods the game can load: their descriptor sits under `<game>/mod`. */
  readonly launchableOnly: boolean;
}

export type ModPickOutcome =
  | {
      readonly kind: 'picked';
      readonly gameRoot: string | undefined;
      readonly mods: readonly ModDescriptor[];
      readonly picked: readonly string[];
    }
  | { readonly kind: 'cancelled' }
  /** Nothing to pick from; the caller falls back to its default or stops, with the user already told why. */
  | { readonly kind: 'unavailable' };

/**
 * One multi-select dialog over the known mods, grouped by family. It opens
 * pre-filled with the mods set in Settings or, when none are set, with the last
 * pick made here; the new pick is remembered either way.
 */
export async function pickMods(
  getClient: () => LanguageClient | undefined,
  memory: PickMemory,
  options: ModPickOptions,
): Promise<ModPickOutcome> {
  const client = getClient();
  if (!client) {
    void vscode.window.showErrorMessage('Victorian Tools: the language server is not running.');
    return { kind: 'unavailable' };
  }
  const known = await client.sendRequest<ModsResult>(MODS_REQUEST);
  const mods = eligibleMods(known, options.launchableOnly);
  if (mods === undefined) {
    return { kind: 'unavailable' };
  }
  const configured = readActiveMods();
  const preselected = configured.length > 0 ? configured : memory.recall();
  const picked = await vscode.window.showQuickPick(modSelectionItems(mods, preselected).map(toPick), {
    title: options.title,
    placeHolder: options.placeHolder,
    canPickMany: true,
  });
  if (!picked) {
    return { kind: 'cancelled' };
  }
  const names = picked.flatMap((item) => (item.name === undefined ? [] : [item.name]));
  await memory.remember(names);
  return { kind: 'picked', gameRoot: known.gameRoot, mods, picked: names };
}

function eligibleMods(known: ModsResult, launchableOnly: boolean): readonly ModDescriptor[] | undefined {
  if (launchableOnly && known.gameRoot === undefined) {
    void vscode.window.showWarningMessage(
      'Victorian Tools: no Victoria 2 install found. Set the game folder in Victorian Tools Settings.',
    );
    return undefined;
  }
  const gameRoot = known.gameRoot;
  const mods =
    launchableOnly && gameRoot !== undefined
      ? known.mods.filter((mod) => isInsideRoot(gameRoot, mod.descriptorPath))
      : known.mods;
  if (mods.length === 0) {
    void vscode.window.showWarningMessage(
      gameRoot === undefined
        ? 'Victorian Tools: no .mod file found around the workspace.'
        : `Victorian Tools: no .mod file found in ${gameRoot}/mod.`,
    );
    return undefined;
  }
  return mods;
}

function toPick(item: ModSelectionItem): ModPick {
  if (item.kind === 'separator') {
    return { label: item.label, kind: vscode.QuickPickItemKind.Separator };
  }
  return { name: item.name, label: item.label, description: item.description, picked: item.picked };
}
