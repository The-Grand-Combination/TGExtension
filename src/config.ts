import * as vscode from 'vscode';

const SECTION = 'victorianTools';
const ACTIVE_MODS = 'activeMods';
const GAME_PATH = 'gamePath';

/** `name`s of the mods being worked on, as stored in `victorianTools.activeMods`. */
export function readActiveMods(): string[] {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(ACTIVE_MODS);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** The selection belongs to the workspace when there is one, else to the user settings. */
export function writeActiveMods(names: readonly string[]): Thenable<void> {
  const target =
    (vscode.workspace.workspaceFolders ?? []).length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  return vscode.workspace.getConfiguration(SECTION).update(ACTIVE_MODS, [...names], target);
}

/** `victorianTools.gamePath` as typed; empty when the install is to be detected. */
export function readGamePath(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown>(GAME_PATH);
  return typeof value === 'string' ? value.trim() : '';
}

/** The install folder is a property of the machine, so it goes to the user settings, never into a shared workspace. */
export function writeGamePath(gamePath: string): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SECTION)
    .update(GAME_PATH, gamePath.trim() === '' ? undefined : gamePath.trim(), vscode.ConfigurationTarget.Global);
}

export function affectsModSettings(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration(`${SECTION}.${ACTIVE_MODS}`) || event.affectsConfiguration(`${SECTION}.${GAME_PATH}`);
}
