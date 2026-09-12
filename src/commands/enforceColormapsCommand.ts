import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import {
  ENFORCE_COLORMAPS_REQUEST,
  type ColormapFileResult,
  type EnforceColormapsParams,
  type EnforceColormapsResult,
} from '../model/colormaps.js';
import { pickMods, type PickMemory } from './pickMods.js';

const REWRITE = 'Rewrite palettes';

/**
 * Ask which mods to fix, find the terrain.bmp / rivers.bmp whose palette is not
 * the standard one, confirm, and have the server rewrite them in place: the
 * standard palette goes in, and every pixel is renumbered to the standard index
 * of the colour it had. The game reads indices and never the palette, so an
 * editor that re-sorted the colour table (mspaint does) has to be undone in the
 * pixels too.
 */
export function enforceColormapsCommand(
  getClient: () => LanguageClient | undefined,
  memory: PickMemory,
): () => Promise<void> {
  return async (): Promise<void> => {
    const client = getClient();
    if (!client) {
      void vscode.window.showErrorMessage('Victorian Tools: the language server is not running.');
      return;
    }
    const outcome = await pickMods(getClient, memory, {
      title: 'Enforce colormaps: which mods should be checked?',
      placeHolder: 'Space ticks a mod, Enter checks its map/terrain.bmp and map/rivers.bmp palettes.',
      launchableOnly: false,
    });
    if (outcome.kind === 'cancelled') {
      return;
    }
    const params: EnforceColormapsParams = {
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      mods: outcome.kind === 'picked' ? outcome.picked : [],
      dryRun: true,
    };
    const plan = await client.sendRequest<EnforceColormapsResult>(ENFORCE_COLORMAPS_REQUEST, params);
    if (!(await confirmRewrite(plan))) {
      return;
    }
    const result = await client.sendRequest<EnforceColormapsResult>(ENFORCE_COLORMAPS_REQUEST, { ...params, dryRun: false });
    reportResult(result);
  };
}

async function confirmRewrite(plan: EnforceColormapsResult): Promise<boolean> {
  const fixable = plan.files.filter((file) => file.outcome === 'fixable');
  if (plan.files.length === 0) {
    void vscode.window.showWarningMessage('Victorian Tools: none of the picked mods has a map/terrain.bmp or map/rivers.bmp of its own.');
    return false;
  }
  if (fixable.length === 0) {
    void vscode.window.showInformationMessage(`Victorian Tools: every palette is already standard. ${describe(plan.files)}`);
    return false;
  }
  const answer = await vscode.window.showWarningMessage(
    `Rewrite ${String(fixable.length)} file(s) with the standard palette? Every pixel keeps its colour and takes that colour's standard index.`,
    { modal: true, detail: fixable.map((file) => `${file.path}${countsOf(file)}`).join('\n') },
    REWRITE,
  );
  return answer === REWRITE;
}

function reportResult(result: EnforceColormapsResult): void {
  const failed = result.files.filter((file) => file.outcome === 'write-failed');
  const message = `Victorian Tools: ${describe(result.files)}`;
  if (failed.length > 0) {
    void vscode.window.showErrorMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
}

const OUTCOME_TEXT: Readonly<Record<ColormapFileResult['outcome'], string>> = {
  standard: 'already standard',
  fixable: 'needs rewriting',
  fixed: 'palette rewritten',
  'not-indexed': 'not an 8-bit BMP, cannot be fixed',
  missing: 'missing',
  unreadable: 'not a readable BMP',
  'write-failed': 'could not be written',
};

function describe(files: readonly ColormapFileResult[]): string {
  return files.map((file) => `${path.basename(file.path)}: ${OUTCOME_TEXT[file.outcome]}${countsOf(file)}`).join('; ') + '.';
}

/** ` (N pixels renumbered, M colours approximated)` for a fixable or fixed file; empty otherwise. */
function countsOf(file: ColormapFileResult): string {
  if (file.remappedPixels === undefined) {
    return '';
  }
  const parts = [`${file.remappedPixels.toLocaleString('en-US')} pixels renumbered`];
  if (file.approximatedColors !== undefined && file.approximatedColors > 0) {
    parts.push(`${String(file.approximatedColors)} colour(s) not in the standard palette, sent to the nearest`);
  }
  return ` (${parts.join(', ')})`;
}
