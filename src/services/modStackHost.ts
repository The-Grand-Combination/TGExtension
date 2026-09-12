import type { FullReportParams } from '../model/fullReport.js';
import type { FileLocation } from './modLayout.js';

/** The mods a request is about; the full report, the map report and Enforce Colormaps all ask the same way. */
export type TargetParams = Pick<FullReportParams, 'workspaceFolders' | 'mods'>;

/**
 * Reading the mod stack. `targets` is resolved per request, not per construction:
 * the picked mods and the workspace folders both change while the server runs.
 */
export interface ModStackHost {
  readonly targets: (params: TargetParams) => readonly FileLocation[];
  readonly fileExists: (absolutePath: string) => boolean;
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
  readonly readBytes: (absolutePath: string) => Promise<Uint8Array | undefined>;
}

/** `2026-09-12 20:37:40`, as both report headers stamp themselves. */
export function reportTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
