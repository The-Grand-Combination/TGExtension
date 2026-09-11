import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { MAP_REPORT_REQUEST, type MapReportParams, type MapReportResult } from '../model/mapAudit.js';
import type { MapReportTargets } from '../services/mapReportTargets.js';
import { pickMods, type PickMemory } from './pickMods.js';

/**
 * Ask which mods to check, then ask the server to audit their map bitmaps
 * (provinces.bmp, terrain.bmp, rivers.bmp) and open the result as plain text.
 * Kept apart from the full report: pixel findings have no file to open and
 * would crowd the file findings out.
 */
export function generateMapReportCommand(
  getClient: () => LanguageClient | undefined,
  memory: PickMemory,
  targets: MapReportTargets,
): () => Promise<void> {
  return async (): Promise<void> => {
    const client = getClient();
    if (!client) {
      void vscode.window.showErrorMessage('Victorian Tools: the language server is not running.');
      return;
    }
    const outcome = await pickMods(getClient, memory, {
      title: 'Map report: which mods should be checked?',
      placeHolder: 'Space ticks a mod, Enter runs. Each ticked mod is checked with its map read over the game files and its dependencies.',
      launchableOnly: false,
    });
    if (outcome.kind === 'cancelled') {
      return;
    }
    const params: MapReportParams = {
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      mods: outcome.kind === 'picked' ? outcome.picked : [],
    };
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Victorian Tools: checking the map bitmaps…' },
      () => client.sendRequest<MapReportResult>(MAP_REPORT_REQUEST, params),
    );
    await showReport(result, params, targets);
  };
}

async function showReport(
  result: MapReportResult,
  params: MapReportParams,
  targets: MapReportTargets,
): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: result.text });
  targets.remember(document.uri.toString(), params);
  await vscode.window.showTextDocument(document, { preview: false });
  const audited = result.reports.filter((report) => report.audited);
  if (audited.length === 0) {
    void vscode.window.showWarningMessage('Victorian Tools: none of the picked mods ships map files of its own.');
    return;
  }
  const errors = audited.reduce((sum, report) => sum + report.errorCount, 0);
  const warnings = audited.reduce((sum, report) => sum + report.warningCount, 0);
  void vscode.window.showInformationMessage(
    `Victorian Tools: ${String(errors)} error(s) and ${String(warnings)} warning(s) in the map bitmaps.`,
  );
}
