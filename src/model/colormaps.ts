/** Custom LSP request: rewrite the palettes of terrain.bmp and rivers.bmp to the standard ones. */
export const ENFORCE_COLORMAPS_REQUEST = 'victorianTools/enforceColormaps';

export interface EnforceColormapsParams {
  /** File-system paths of the open workspace folders. */
  readonly workspaceFolders: readonly string[];
  /** `name`s of the mods to fix; empty for the default targets. */
  readonly mods: readonly string[];
  /** Report what would change without writing anything. */
  readonly dryRun: boolean;
}

export type ColormapOutcome =
  /** The palette already matches. */
  | 'standard'
  /** The palette differs and can be rewritten (dry run). */
  | 'fixable'
  /** The palette was rewritten. */
  | 'fixed'
  /** Not an 8-bit indexed BMP; there is no palette to fix. */
  | 'not-indexed'
  | 'missing'
  | 'unreadable'
  | 'write-failed';

export interface ColormapFileResult {
  /** Absolute path of the bitmap in the mod's own folder. */
  readonly path: string;
  readonly outcome: ColormapOutcome;
  /** For `fixable` / `fixed`: pixels renumbered so they keep their colour under the standard palette. */
  readonly remappedPixels?: number;
  /** For `fixable` / `fixed`: colours the standard palette lacks, whose pixels took the nearest entry. */
  readonly approximatedColors?: number;
}

export interface EnforceColormapsResult {
  readonly files: readonly ColormapFileResult[];
}
