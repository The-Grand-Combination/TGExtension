import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_REFERENCE_OPACITY,
  REFERENCES_FOLDER,
  REFERENCES_MANIFEST,
  freeFileName,
  parseReferences,
  renderReferences,
  type ReferenceLayer,
} from '../services/referenceLayers.js';

/**
 * `map/references` of the target mod: the pictures dropped over the map and
 * the manifest that places them. They are the editor's own data, not the
 * game's, so the extension reads and writes them itself — UTF-8 JSON and raw
 * picture bytes, never through the mod's code page.
 */
export class ReferenceStore {
  readonly folder: vscode.Uri;

  constructor(targetRoot: string) {
    this.folder = vscode.Uri.file(path.join(targetRoot, ...REFERENCES_FOLDER.split('/')));
  }

  private get manifest(): vscode.Uri {
    return vscode.Uri.joinPath(this.folder, REFERENCES_MANIFEST);
  }

  /** No folder, no manifest, or a manifest that is not one: no references. */
  async read(): Promise<ReferenceLayer[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.manifest);
      return parseReferences(Buffer.from(bytes).toString('utf8'));
    } catch {
      return [];
    }
  }

  async write(layers: readonly ReferenceLayer[]): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.folder);
    await vscode.workspace.fs.writeFile(this.manifest, Buffer.from(renderReferences(layers), 'utf8'));
  }

  /**
   * The picture copied in under a free name, and placed unsized where it was
   * dropped: four corners on one point. The page sizes it to the picture once it
   * has decoded it, which the extension never does.
   */
  async add(name: string, bytes: Uint8Array, x: number, y: number): Promise<ReferenceLayer[]> {
    const layers = await this.read();
    const file = freeFileName([...(await this.files()), ...layers.map((layer) => layer.file)], path.basename(name));
    await vscode.workspace.fs.createDirectory(this.folder);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.folder, file), bytes);
    const point = { x, y };
    const next = [...layers, { file, corners: [point, point, point, point] as const, opacity: DEFAULT_REFERENCE_OPACITY }];
    await this.write(next);
    return next;
  }

  /** The entry leaves the manifest and its copy leaves the folder; a name that is not a plain file name touches nothing. */
  async remove(file: string): Promise<ReferenceLayer[]> {
    const layers = await this.read();
    if (path.basename(file) !== file || file === REFERENCES_MANIFEST) {
      return layers;
    }
    const next = layers.filter((layer) => layer.file !== file);
    await this.write(next);
    try {
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.folder, file));
    } catch {
      // Already gone: the manifest is what mattered.
    }
    return next;
  }

  private async files(): Promise<string[]> {
    try {
      return (await vscode.workspace.fs.readDirectory(this.folder)).map(([name]) => name);
    } catch {
      return [];
    }
  }
}
