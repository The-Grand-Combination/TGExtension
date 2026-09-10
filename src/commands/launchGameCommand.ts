import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { fileExists } from '../io/modFiles.js';
import { findGameExecutable, gameLaunchArguments } from '../services/gameLaunch.js';
import { resolveSelection } from '../services/modLayout.js';
import { pickMods, type PickMemory } from './pickMods.js';

/**
 * Open the mod dialog, then start the game with `-mod=` for each picked mod in
 * load order. The pick is remembered for the next dialog; the mods set in
 * Settings are not changed.
 */
export function launchGameCommand(
  getClient: () => LanguageClient | undefined,
  memory: PickMemory,
): () => Promise<void> {
  return async (): Promise<void> => {
    const outcome = await pickMods(getClient, memory, {
      title: 'Launch Victoria 2: which mods should the game load?',
      placeHolder: 'Space ticks a mod, Enter launches. Dependencies load first; ticking a submod also loads its base mod.',
      launchableOnly: true,
    });
    if (outcome.kind !== 'picked' || outcome.gameRoot === undefined) {
      return;
    }
    const { gameRoot } = outcome;
    const executable = findGameExecutable(gameRoot, fileExists);
    if (executable === undefined) {
      void vscode.window.showErrorMessage(`Victorian Tools: no v2game.exe or victoria2.exe in ${gameRoot}.`);
      return;
    }
    const stack = resolveSelection(outcome.mods, outcome.picked);
    const launchArguments = gameLaunchArguments(gameRoot, stack);
    try {
      const child = spawn(executable, launchArguments, { cwd: gameRoot, detached: true, stdio: 'ignore' });
      child.unref();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      void vscode.window.showErrorMessage(`Victorian Tools: could not start the game (${reason}).`);
      return;
    }
    const mods = stack.length === 0 ? 'no mods' : stack.map((mod) => mod.name).join(' > ');
    void vscode.window.showInformationMessage(`Victorian Tools: launching Victoria 2 with ${mods}.`);
  };
}
