import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { FULL_REPORT_REQUEST, type FullReportParams, type FullReportResult } from '../model/fullReport.js';
import { pickMods, type PickMemory } from './pickMods.js';

/**
 * Ask which mods to analyze, then ask the server for a whole-mod validation
 * report and open it as plain text. Each picked mod is validated over the game
 * files and its dependencies; with nothing picked, the server falls back to the
 * mods set in Settings or to the workspace folders.
 */
export function generateFullReportCommand(
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
      title: 'Full report: which mods should be analyzed?',
      placeHolder: 'Space ticks a mod, Enter runs. Each ticked mod is validated over the game files and its dependencies.',
      launchableOnly: false,
    });
    if (outcome.kind === 'cancelled') {
      return;
    }
    const params: FullReportParams = {
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      mods: outcome.kind === 'picked' ? outcome.picked : [],
    };
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Victorian Tools: generating full report…' },
      () => client.sendRequest<FullReportResult>(FULL_REPORT_REQUEST, params),
    );
    await showReport(result);
  };
}

async function showReport(result: FullReportResult): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: result.text });
  await vscode.window.showTextDocument(document, { preview: false });
  if (result.reports.length === 0) {
    void vscode.window.showWarningMessage('Victorian Tools: no Victoria 2 mod found in the workspace.');
    return;
  }
  const errors = result.reports.reduce((sum, report) => sum + report.errorCount, 0);
  const warnings = result.reports.reduce((sum, report) => sum + report.warningCount, 0);
  void vscode.window.showInformationMessage(
    `Victorian Tools: ${String(errors)} error(s) and ${String(warnings)} warning(s) found.`,
  );
}
