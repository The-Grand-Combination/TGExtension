import * as path from 'node:path';
import type { FullReportParams, FullReportResult, ModReport } from '../model/fullReport.js';
import {
  COUNTRY_HISTORY_FOLDER,
  COUNTRY_LIST_FILE,
  DEFINES_FILE,
  FLAG_EXTENSION,
  FLAG_FOLDER,
  GOVERNMENTS_FILE,
  POPS_FOLDER,
  PROVINCE_HISTORY_FOLDER,
} from '../model/gamePaths.js';
import { NEVER_CANCELLED, throwIfCancelled, type CancelSignal } from '../model/cancellation.js';
import type { ModDescriptor } from '../model/modDescriptor.js';
import type { ModIndex } from '../model/modIndex.js';
import type { Range } from '../model/range.js';
import type { ValidationOptions } from '../model/validationOptions.js';
import { auditEssentialTags } from './essentialTagsValidation.js';
import { auditFlags } from './flagValidation.js';
import { buildModReport, type ExtraFileFindings, type ReportFileProvider } from './fullReport.js';
import { auditGreatPowers, collectGreatPowerCandidates, startDateOf } from './greatPowerValidation.js';
import type { FileLocation } from './modLayout.js';
import {
  listLayeredFiles,
  listLayeredFilesRecursive,
  listLayeredFilesResolved,
  resolveLayeredFile,
  type LayeredFile,
  type LayerFileSystem,
  type ModLayers,
} from './modLayers.js';
import { reportTimestamp, type ModStackHost } from './modStackHost.js';
import { auditPops, popsDiagnostics } from './popsValidation.js';
import { renderReportText } from './reportText.js';

export interface FullReportHost extends ModStackHost {
  readonly ensureIndex: (layers: ModLayers) => Promise<ModIndex | undefined>;
  readonly listFilesRecursive: (absoluteRoot: string, relativeFolder: string) => string[];
  readonly fileUri: (absolutePath: string) => string;
  /** The `.mod` descriptor of a mod folder: what a whole-mod finding is reported on. */
  readonly descriptorOf: (root: string) => ModDescriptor | undefined;
  /** Layered file access: the cross-file audits read the stack, not the mod folder alone. */
  readonly fileSystem: LayerFileSystem;
  /** The regexes of the current configuration, recompiled only when a setting changes. */
  readonly validationOptions: () => ValidationOptions;
}

export async function buildFullReport(
  host: FullReportHost,
  params: FullReportParams,
  signal: CancelSignal = NEVER_CANCELLED,
): Promise<FullReportResult> {
  const reports: ModReport[] = [];
  for (const target of host.targets(params)) {
    throwIfCancelled(signal);
    const index = await host.ensureIndex(target.layers);
    if (index) {
      reports.push(
        await buildModReport(
          target.root,
          reportProviderFor(host, target.root),
          index,
          host.validationOptions(),
          await crossFileFindings(host, target, index, signal),
          signal,
        ),
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

/**
 * The checks that read the whole stack instead of one file's text. They are
 * kept out of the per-file scan because they need what sits around a file —
 * the flag folder, every province's owner — rather than the file itself.
 */
async function crossFileFindings(
  host: FullReportHost,
  target: FileLocation,
  index: ModIndex,
  signal: CancelSignal,
): Promise<ExtraFileFindings[]> {
  const countries = await layeredFile(host, target.layers, COUNTRY_LIST_FILE);
  const provinceFiles = listLayeredFilesResolved(target.layers, host.fileSystem, PROVINCE_HISTORY_FOLDER);
  return [
    ...essentialTagFindings(host, target, countries),
    ...(await flagFindings(host, target, countries)),
    ...(await greatPowerFindings(host, target, index, countries, provinceFiles, signal)),
    ...(await popsFindings(host, target)),
  ].filter((entry) => entry.diagnostics.length > 0);
}

/** The tags the engine needs by name, over the stack's `common/countries.txt`. */
function essentialTagFindings(
  host: FullReportHost,
  target: FileLocation,
  countries: LayeredText | undefined,
): ExtraFileFindings[] {
  if (countries === undefined) {
    return [];
  }
  const diagnostics = auditEssentialTags(
    countries.text,
    (relativePath: string): boolean =>
      resolveLayeredFile(target.layers, host.fileSystem, relativePath) !== undefined,
  );
  return [{ ...countries, diagnostics }];
}

/**
 * The pops audit, reported on the mod's `.mod` file: the missing files are a
 * fact about a folder, and the descriptor is the one file that stands for the
 * mod as a whole. It is anchored on the `replace_path` that hid the base game's
 * pops when there is one, since that line is what made them the mod's to own.
 */
async function popsFindings(host: FullReportHost, target: FileLocation): Promise<ExtraFileFindings[]> {
  const descriptor = host.descriptorOf(target.root);
  if (descriptor === undefined) {
    return [];
  }
  const text = await host.readText(descriptor.descriptorPath);
  if (text === undefined) {
    return [];
  }
  const audit = auditPops(listLayeredFilesRecursive(target.layers, host.fileSystem, POPS_FOLDER));
  return [
    {
      path: path.relative(target.root, descriptor.descriptorPath).replace(/\\/g, '/'),
      uri: host.fileUri(descriptor.descriptorPath),
      text,
      diagnostics: popsDiagnostics(audit, replacePathRange(text)),
    },
  ];
}

/** The `replace_path` line that hid the base game's pops, or the start of the file when there is none. */
function replacePathRange(descriptorText: string): Range {
  const match = /^[ \t]*replace_path[ \t]*=[ \t]*"history(?:\/pops[^"]*)?"/im.exec(descriptorText);
  return match ? { start: match.index, end: match.index + match[0].length } : { start: 0, end: 0 };
}

/**
 * The great-power audit. Reading every province's history is the cost of
 * knowing who owns what, so it happens once per mod, here, and not per file.
 */
async function greatPowerFindings(
  host: FullReportHost,
  target: FileLocation,
  index: ModIndex,
  countries: LayeredText | undefined,
  provinceFiles: readonly LayeredFile[],
  signal: CancelSignal,
): Promise<ExtraFileFindings[]> {
  const defines = await layeredFile(host, target.layers, DEFINES_FILE);
  if (defines === undefined) {
    return [];
  }
  const candidates = await collectGreatPowerCandidates(countries?.text, {
    startDate: startDateOf(defines.text),
    readFile: host.readText,
    provinceFiles,
    countryFiles: listLayeredFilesResolved(target.layers, host.fileSystem, COUNTRY_HISTORY_FOLDER),
    stateOfProvince: index.stateOfProvince,
  }, signal);
  return [{ ...defines, diagnostics: auditGreatPowers(defines.text, candidates) }];
}

/**
 * The flag audit, over the stack the target is read with: a mod that ships no
 * `common/governments.txt` of its own is still judged against the one the game
 * loads for it, and a flag the game files already provide counts as present.
 */
async function flagFindings(
  host: FullReportHost,
  target: FileLocation,
  countries: LayeredText | undefined,
): Promise<ExtraFileFindings[]> {
  const governments = await layeredFile(host, target.layers, GOVERNMENTS_FILE);
  const audit = auditFlags({
    governmentsText: governments?.text,
    countriesText: countries?.text,
    flagFileNames: listLayeredFiles(target.layers, host.fileSystem, FLAG_FOLDER, FLAG_EXTENSION),
  });
  return [
    ...(governments ? [{ ...governments, diagnostics: audit.governments }] : []),
    ...(countries ? [{ ...countries, diagnostics: audit.countries }] : []),
  ];
}

interface LayeredText {
  readonly path: string;
  readonly uri: string;
  readonly text: string;
}

async function layeredFile(
  host: FullReportHost,
  layers: ModLayers,
  relativePath: string,
): Promise<LayeredText | undefined> {
  const absolutePath = resolveLayeredFile(layers, host.fileSystem, relativePath);
  if (absolutePath === undefined) {
    return undefined;
  }
  const text = await host.readText(absolutePath);
  return text === undefined ? undefined : { path: relativePath, uri: host.fileUri(absolutePath), text };
}
