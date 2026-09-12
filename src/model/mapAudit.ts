import type { DiagnosticSeverity } from './diagnostic.js';

/** Custom LSP request: audit the map bitmaps of the requested mods. */
export const MAP_REPORT_REQUEST = 'victorianTools/mapReport';

export interface MapReportParams {
  readonly workspaceFolders: readonly string[];
  /** `name`s of the mods to report on, each over the game files and its dependencies; empty for the default. */
  readonly mods: readonly string[];
}

export interface MapReport {
  readonly root: string;
  /** False when the mod ships no map file of its own, so nothing was audited. */
  readonly audited: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly findings: readonly MapFinding[];
}

export interface MapReportResult {
  readonly generatedAt: string;
  readonly reports: readonly MapReport[];
  readonly text: string;
}

/** The bitmaps the map audit reads, mod-root-relative. */
export const PROVINCES_BMP = 'map/provinces.bmp';
export const TERRAIN_BMP = 'map/terrain.bmp';
export const RIVERS_BMP = 'map/rivers.bmp';

export type MapImageFile = typeof PROVINCES_BMP | typeof TERRAIN_BMP | typeof RIVERS_BMP;

/** A pixel position in image-editor coordinates: 0-based, origin at the top-left corner. */
export interface Pixel {
  readonly x: number;
  readonly y: number;
}

/**
 * A finding about the map bitmaps. Unlike file diagnostics it has no text
 * range; a pixel is given when the finding is about one place in the image.
 */
export interface MapFinding {
  readonly file: MapImageFile;
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly pixel?: Pixel;
}
