import * as path from 'node:path';
import * as vscode from 'vscode';
import type { MapReportTargets } from '../services/mapReportTargets.js';
import { reportLinks, type ReportLink, type ReportLinkTarget } from '../services/reportLinks.js';

export const REVEAL_MAP_PIXEL_COMMAND = 'victorian-tools.revealMapPixel';

/** What `REVEAL_MAP_PIXEL_COMMAND` receives from a map report link. */
export interface RevealMapPixelArgs {
  readonly workspaceFolders: readonly string[];
  readonly mods: readonly string[];
  readonly file: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Ctrl+click on a report finding. Both reports open as plain text, so the
 * links are read back from the rendered text; a map finding goes to the Map
 * Editor instead of a file, which needs the mods the report was made for.
 */
export class ReportLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly mapTargets: MapReportTargets) {}

  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    for (const link of reportLinks(document.getText())) {
      const documentLink = this.toDocumentLink(document, link);
      if (documentLink) {
        links.push(documentLink);
      }
    }
    return links;
  }

  private toDocumentLink(document: vscode.TextDocument, link: ReportLink): vscode.DocumentLink | undefined {
    const range = new vscode.Range(link.span.line, link.span.start, link.span.line, link.span.end);
    if (link.target.kind === 'file') {
      const absolutePath = path.join(link.target.root, link.target.relativePath);
      const item = new vscode.DocumentLink(range, fileTarget(absolutePath, link.target));
      item.tooltip = absolutePath;
      return item;
    }
    const params = this.mapTargets.recall(document.uri.toString());
    if (!params) {
      return undefined;
    }
    const item = new vscode.DocumentLink(range, mapPixelTarget(params, link.target));
    item.tooltip = `Open the Map Editor at ${String(link.target.x)}, ${String(link.target.y)}`;
    return item;
  }
}

function fileTarget(absolutePath: string, target: Extract<ReportLinkTarget, { kind: 'file' }>): vscode.Uri {
  return vscode.Uri.file(absolutePath).with({ fragment: `L${String(target.line)},${String(target.character)}` });
}

function mapPixelTarget(
  params: { readonly workspaceFolders: readonly string[]; readonly mods: readonly string[] },
  target: Extract<ReportLinkTarget, { kind: 'mapPixel' }>,
): vscode.Uri {
  const args: RevealMapPixelArgs = {
    workspaceFolders: params.workspaceFolders,
    mods: params.mods,
    file: target.file,
    x: target.x,
    y: target.y,
  };
  return vscode.Uri.parse(`command:${REVEAL_MAP_PIXEL_COMMAND}?${encodeURIComponent(JSON.stringify([args]))}`);
}
