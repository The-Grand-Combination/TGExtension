import * as path from 'node:path';
import type { MapReport, MapReportParams, MapReportResult } from '../model/mapAudit.js';
import type { ModIndex } from '../model/modIndex.js';
import { auditMapImages, type MapImageSource } from './mapImageAudit.js';
import { resolveLayeredFile, type LayerFileSystem, type ModLayers } from './modLayers.js';
import type { FileLocation } from './modLayout.js';
import { reportTimestamp, type ModStackHost } from './modStackHost.js';
import { renderMapReportText } from './reportText.js';

export interface MapReportHost extends ModStackHost {
  readonly ensureIndex: (layers: ModLayers) => Promise<ModIndex | undefined>;
  readonly fileSystem: LayerFileSystem;
}

export async function buildMapReports(
  host: MapReportHost,
  params: MapReportParams,
): Promise<MapReportResult> {
  const reports: MapReport[] = [];
  for (const target of host.targets(params)) {
    reports.push(await buildMapReport(host, target));
  }
  const generatedAt = reportTimestamp();
  return { generatedAt, reports, text: renderMapReportText(reports, generatedAt) };
}

async function buildMapReport(host: MapReportHost, target: FileLocation): Promise<MapReport> {
  const source = mapSourceFor(host, target);
  const index = source ? await host.ensureIndex(target.layers) : undefined;
  if (!source || !index) {
    return { root: target.root, audited: false, errorCount: 0, warningCount: 0, findings: [] };
  }
  const findings = await auditMapImages(source, index);
  return {
    root: target.root,
    audited: true,
    errorCount: findings.filter((finding) => finding.severity === 'error').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    findings,
  };
}

/** The map files whose presence in a mod's own folder makes it a map report target. */
const MAP_OWNER_FILES: readonly string[] = [
  'map/provinces.bmp',
  'map/terrain.bmp',
  'map/rivers.bmp',
  'map/definition.csv',
  'map/default.map',
  'map/terrain.txt',
];

/**
 * The map as the game would load it for this mod, read through the stack;
 * undefined for a mod that ships no map file of its own, so a submod does not
 * repeat its base mod's map findings.
 */
function mapSourceFor(host: MapReportHost, target: FileLocation): MapImageSource | undefined {
  if (!MAP_OWNER_FILES.some((relativePath) => host.fileExists(path.join(target.root, relativePath)))) {
    return undefined;
  }
  const resolve = (relativePath: string): string | undefined =>
    resolveLayeredFile(target.layers, host.fileSystem, relativePath);
  return {
    readText: async (relativePath): Promise<string | undefined> => {
      const absolutePath = resolve(relativePath);
      return absolutePath === undefined ? undefined : host.readText(absolutePath);
    },
    readBytes: async (relativePath): Promise<Uint8Array | undefined> => {
      const absolutePath = resolve(relativePath);
      return absolutePath === undefined ? undefined : host.readBytes(absolutePath);
    },
  };
}
