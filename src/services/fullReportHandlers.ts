import * as path from 'node:path';
import type { FullReportParams, FullReportResult, ModReport } from '../model/fullReport.js';
import type { ModIndex } from '../model/modIndex.js';
import type { ValidationOptions } from '../model/validationOptions.js';
import { buildModReport, type ReportFileProvider } from './fullReport.js';
import type { ModLayers } from './modLayers.js';
import { reportTimestamp, type ModStackHost } from './modStackHost.js';
import { renderReportText } from './reportText.js';

export interface FullReportHost extends ModStackHost {
  readonly ensureIndex: (layers: ModLayers) => Promise<ModIndex | undefined>;
  readonly listFilesRecursive: (absoluteRoot: string, relativeFolder: string) => string[];
  readonly fileUri: (absolutePath: string) => string;
  /** The regexes of the current configuration, recompiled only when a setting changes. */
  readonly validationOptions: () => ValidationOptions;
}

export async function buildFullReport(
  host: FullReportHost,
  params: FullReportParams,
): Promise<FullReportResult> {
  const reports: ModReport[] = [];
  for (const target of host.targets(params)) {
    const index = await host.ensureIndex(target.layers);
    if (index) {
      reports.push(
        await buildModReport(target.root, reportProviderFor(host, target.root), index, host.validationOptions()),
      );
    }
  }
  const generatedAt = reportTimestamp();
  return { generatedAt, reports, text: renderReportText(reports, generatedAt) };
}

/** A mod's own files: the report covers what the modder maintains, read with the stack's index. */
function reportProviderFor(host: FullReportHost, root: string): ReportFileProvider {
  return {
    readFile: (relativePath: string): Promise<string | undefined> => host.readText(path.join(root, relativePath)),
    listFilesRecursive: (relativeFolder: string): string[] => host.listFilesRecursive(root, relativeFolder),
    fileUri: (relativePath: string): string => host.fileUri(path.join(root, relativePath)),
  };
}
