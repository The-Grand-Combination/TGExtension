import * as path from 'node:path';
import type { Palette } from '../data/mapPalettes.js';
import type {
  ColormapFileResult,
  EnforceColormapsParams,
  EnforceColormapsResult,
} from '../model/colormaps.js';
import { COLORMAP_FILES, planColormapFix } from './colormapEnforcement.js';
import type { ModStackHost } from './modStackHost.js';

export interface ColormapEnforcementHost extends ModStackHost {
  readonly writeBytes: (absolutePath: string, bytes: Uint8Array) => Promise<boolean>;
}

export async function enforceColormaps(
  host: ColormapEnforcementHost,
  params: EnforceColormapsParams,
): Promise<EnforceColormapsResult> {
  const files: ColormapFileResult[] = [];
  for (const target of host.targets(params)) {
    for (const file of COLORMAP_FILES) {
      const absolutePath = path.join(target.root, file.relativePath);
      if (!host.fileExists(absolutePath)) {
        continue;
      }
      files.push(await enforceColormap(host, absolutePath, file.palette, params.dryRun));
    }
  }
  return { files };
}

/** Only a mod's own bitmap is rewritten, never a file of a layer below it. */
async function enforceColormap(
  host: ColormapEnforcementHost,
  absolutePath: string,
  palette: Palette,
  dryRun: boolean,
): Promise<ColormapFileResult> {
  const plan = planColormapFix(await host.readBytes(absolutePath), palette);
  if (plan.outcome !== 'fixable') {
    return { path: absolutePath, outcome: plan.outcome };
  }
  const counts = { remappedPixels: plan.remappedPixels, approximatedColors: plan.approximatedColors };
  if (dryRun) {
    return { path: absolutePath, outcome: 'fixable', ...counts };
  }
  const written = await host.writeBytes(absolutePath, plan.fixed);
  return { path: absolutePath, outcome: written ? 'fixed' : 'write-failed', ...counts };
}
