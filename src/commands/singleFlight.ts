import * as vscode from 'vscode';

/**
 * Keeps one run of a command at a time. Both reports take seconds over a large
 * mod, and a second click while the first is still going would double the work
 * for an answer the user already asked for.
 */
export function singleFlight(what: string): (work: () => Promise<void>) => Promise<void> {
  let running = false;
  return async (work: () => Promise<void>): Promise<void> => {
    if (running) {
      void vscode.window.showInformationMessage(`Victorian Tools: ${what} is already running.`);
      return;
    }
    running = true;
    try {
      await work();
    } finally {
      running = false;
    }
  };
}
