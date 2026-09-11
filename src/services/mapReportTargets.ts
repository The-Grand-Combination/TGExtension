import type { MapReportParams } from '../model/mapAudit.js';

/**
 * Which mods a map report was generated for, kept per open report document.
 * The rendered text names mod roots, not mod names, and opening the Map Editor
 * needs the names; this carries them from the command to the link provider.
 */
export class MapReportTargets {
  private readonly byDocument = new Map<string, MapReportParams>();

  remember(documentUri: string, params: MapReportParams): void {
    this.byDocument.set(documentUri, params);
  }

  recall(documentUri: string): MapReportParams | undefined {
    return this.byDocument.get(documentUri);
  }

  forget(documentUri: string): void {
    this.byDocument.delete(documentUri);
  }
}
