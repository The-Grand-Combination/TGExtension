import * as path from 'node:path';
import {
  CLIMATE_FILE,
  CONTINENT_FILE,
  DEFAULT_MAP_FILE,
  LOCALISATION_FOLDER,
  POPS_FOLDER,
  POSITIONS_FILE,
  PROVINCE_DEFINITION_FILE,
  PROVINCE_HISTORY_FOLDER,
  REGION_FILE,
} from '../model/gamePaths.js';
import type {
  FileRef,
  LocSection,
  NewProvince,
  PopEntry,
  ProvinceDetails,
  ProvinceHistory,
  ProvincePositions,
  SaveParams,
  SaveResult,
} from '../model/mapEditor.js';
import { planDefaultMapEdit } from './mapDefaultEdit.js';
import type { MapEditorCountryColors } from './mapEditorCountryColors.js';
import { CONTINENT_LIST, type MapEditorDetails } from './mapEditorDetails.js';
import type { MapEditorProvinceFiles } from './mapEditorProvinceFiles.js';
import type { MapEditorStack, Target } from './mapEditorStack.js';
import type { MapEditorWriter } from './mapEditorWriter.js';
import type { LayerFileSystem } from './modLayers.js';
import { isInsideRoot } from './modLayout.js';
import { appendDefinitionRow, rowOfColor } from './provinceDefinitionEdit.js';
import { groupsOfProvince, planGroupEdit, type ProvinceListShape } from './provinceGroupEdit.js';
import {
  findHistoryFile,
  historyFolderOf,
  planHistoryEdit,
  renderProvinceHistory,
} from './provinceHistoryEdit.js';
import {
  appendProvinceLoc,
  countProvinceKeys,
  historyFileNameFor,
  locKeyLine,
  newProvinceLocFile,
  patchProvinceLoc,
  pickLocFileForNewKey,
  provinceLocKey,
  unfoldableCharacter,
  type LocFileCandidate,
} from './provinceLocEdit.js';
import { planPopsEdit, renderPopsFile } from './provincePopsEdit.js';
import { planPositionsEdit, renderPositionsFile } from './provincePositionsEdit.js';
import { parseDocument } from './syntaxValidation.js';
import { applyPatches } from './textPatch.js';

export interface SaveHost {
  readonly fileSystem: LayerFileSystem;
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
}

interface HistoryWrite {
  readonly destination: string;
  readonly updated: string;
  readonly moved: boolean;
}

interface HistoryMove {
  readonly destination: string;
  readonly folder: string;
  readonly changed: boolean;
  readonly rename: boolean;
}

type Created = { readonly ok: true; readonly written: string[] } | { readonly ok: false; readonly reason: string };

/**
 * One save of one province: the row and the room a new province needs, its
 * climate, continent and states, then the section the save carries. Runs
 * inside `MapEditorWriter.serialized`, so nothing here overlaps another save.
 */
export class MapEditorSave {
  constructor(
    private readonly host: SaveHost,
    private readonly stack: MapEditorStack,
    private readonly provinceFiles: MapEditorProvinceFiles,
    private readonly writer: MapEditorWriter,
    private readonly details: MapEditorDetails,
    private readonly countryColors: MapEditorCountryColors,
  ) {}

  async save(target: Target, params: SaveParams): Promise<SaveResult> {
    const parts = sectionsOf(params);
    const lead = parts[0] ?? params;
    const missing = await this.placementReason(target, lead);
    if (missing !== undefined) {
      return { ok: false, reason: missing };
    }
    const unwritable = fileNameReason(lead);
    if (unwritable !== undefined) {
      return { ok: false, reason: unwritable };
    }
    const created = params.create ? await this.createProvince(target, lead, params.create) : { ok: true as const, written: [] };
    if (!created.ok) {
      return created;
    }
    const placed = await this.savePlacement(target, lead);
    if (typeof placed === 'string') {
      return withWritten({ ok: false, reason: placed }, created.written, params);
    }
    let written = [...created.written, ...placed];
    let last: (SaveResult & { ok: true }) | undefined;
    for (const part of parts) {
      const result = await this.saveSection(target, part);
      if (!result.ok) {
        return withWritten(result, [...written, ...(result.written ?? [])], params);
      }
      written = [...written, ...result.written];
      last = result;
    }
    return last
      ? { ...last, written }
      : { ok: true, written, details: await this.details.of(target, params.provinceId, params.popDate) };
  }

  // --- Placement ----------------------------------------------------------------

  /** A land province needs a climate, a continent and a state once this save is written. */
  private async placementReason(target: Target, params: SaveParams): Promise<string | undefined> {
    if (await this.isSeaProvince(target, params)) {
      return undefined;
    }
    const id = String(params.provinceId);
    const orSea = params.create ? ', or tick Sea province' : '';
    const climate = climateIn(params);
    const inClimate = await this.placedIn(target, params, CLIMATE_FILE, climate === undefined ? undefined : [climate]);
    if (inClimate?.length === 0) {
      return `Province ${id} has no climate: pick one in the History section${orSea}.`;
    }
    const continent = continentIn(params);
    const inContinent = await this.placedIn(
      target,
      params,
      CONTINENT_FILE,
      continent === undefined ? undefined : [continent],
      CONTINENT_LIST,
    );
    if (inContinent?.length === 0) {
      return `Province ${id} is on no continent: pick one in the History section${orSea}.`;
    }
    const inState = await this.placedIn(target, params, REGION_FILE, statesIn(params));
    if (inState?.length === 0) {
      return `Province ${id} is in no state: add one under States${orSea}.`;
    }
    return undefined;
  }

  private async isSeaProvince(target: Target, params: SaveParams): Promise<boolean> {
    return params.create ? params.create.isSea : (await this.details.seaProvinces(target)).has(String(params.provinceId));
  }

  /** The groups the province is in once this save is written; undefined when the stack has no such file. */
  private async placedIn(
    target: Target,
    params: SaveParams,
    relativePath: string,
    carried: readonly string[] | undefined,
    shape: ProvinceListShape = 'bare',
  ): Promise<string[] | undefined> {
    const file = await this.stack.scriptFile(target.layers, relativePath);
    if (!file) {
      return undefined;
    }
    const after = carried ?? groupsOfProvince(file.document, params.provinceId, shape);
    return after.filter((name) => name.trim() !== '');
  }

  private async savePlacement(target: Target, params: SaveParams): Promise<string[] | string> {
    const climate = climateIn(params);
    const continent = continentIn(params);
    const states = statesIn(params);
    const written: string[] = [];
    if (climate !== undefined) {
      const done = await this.writeGroups(target, params, CLIMATE_FILE, climate.trim() === '' ? [] : [climate]);
      if (typeof done === 'string') {
        return done;
      }
      written.push(...done);
    }
    if (continent !== undefined) {
      const done = await this.writeGroups(
        target,
        params,
        CONTINENT_FILE,
        continent.trim() === '' ? [] : [continent],
        CONTINENT_LIST,
      );
      if (typeof done === 'string') {
        return done;
      }
      written.push(...done);
    }
    if (states !== undefined) {
      const done = await this.writeGroups(target, params, REGION_FILE, states);
      if (typeof done === 'string') {
        return done;
      }
      written.push(...done);
    }
    return written;
  }

  private async writeGroups(
    target: Target,
    params: SaveParams,
    relativePath: string,
    groups: readonly string[],
    shape: ProvinceListShape = 'bare',
  ): Promise<string[] | string> {
    const file = await this.stack.scriptFile(target.layers, relativePath);
    if (!file) {
      return groups.length === 0 ? [] : `The picked mods have no ${relativePath}.`;
    }
    const patches = planGroupEdit(file.text, file.document, params.provinceId, groups, shape);
    if (patches.length === 0) {
      return [];
    }
    const destination = this.writer.destinationFor(target.root, file.absolutePath, relativePath);
    const failed = await this.writer.writeText(destination, applyPatches(file.text, patches), relativePath, params.dryRun === true);
    if (failed !== undefined) {
      return failed;
    }
    this.stack.forgetScript(target.layers, relativePath);
    return [destination];
  }

  // --- Creating -----------------------------------------------------------------

  private async createProvince(target: Target, params: SaveParams, create: NewProvince): Promise<Created> {
    const table = await this.stack.definitions(target.layers);
    const source = table.absolutePath;
    if (source === undefined) {
      return { ok: false, reason: 'The picked mods have no map/definition.csv.' };
    }
    const { rows, text } = table;
    if (rowOfColor(rows, create.color) !== undefined) {
      return { ok: true, written: [] };
    }
    if (rows.some((row) => row.id === params.provinceId)) {
      return { ok: false, reason: `Province ${String(params.provinceId)} is already in map/definition.csv; click the colour again for a free id.` };
    }
    const name = create.name.trim() === '' ? `Province ${String(params.provinceId)}` : create.name.trim();
    const row = { id: params.provinceId, color: create.color, name };
    const destination = this.writer.destinationFor(target.root, source, PROVINCE_DEFINITION_FILE);
    const failed = await this.writer.writeText(destination, appendDefinitionRow(text, row), 'map/definition.csv', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    if (params.dryRun !== true) {
      this.stack.forgetDefinitions(target.layers);
    }
    return { ok: true, written: [destination, ...(await this.makeRoom(target, params, create))] };
  }

  /** `max_provinces` over the new id, and the id in `sea_starts` when it is a sea province. */
  private async makeRoom(target: Target, params: SaveParams, create: NewProvince): Promise<string[]> {
    const source = this.stack.resolve(target.layers, DEFAULT_MAP_FILE);
    const text = source === undefined ? undefined : await this.host.readText(source);
    if (source === undefined || text === undefined) {
      return [];
    }
    const patches = planDefaultMapEdit(parseDocument(text).document, { provinceId: params.provinceId, isSea: create.isSea });
    if (patches.length === 0) {
      return [];
    }
    const destination = this.writer.destinationFor(target.root, source, DEFAULT_MAP_FILE);
    const failed = await this.writer.writeText(destination, applyPatches(text, patches), 'map/default.map', params.dryRun === true);
    if (failed === undefined && params.dryRun !== true) {
      this.stack.forgetScript(target.layers, DEFAULT_MAP_FILE);
    }
    return failed === undefined ? [destination] : [];
  }

  // --- Sections -----------------------------------------------------------------

  private saveSection(target: Target, params: SaveParams): Promise<SaveResult> {
    switch (params.section) {
      case 'history':
        return this.saveDefinition(target, params);
      case 'pops':
        return this.savePops(target, params, params.pops, params.createInFile);
      case 'positions':
        return this.savePositions(target, params, params.data);
      case 'all':
        return Promise.resolve({ ok: false, reason: 'A save of every section is split into its parts before it is written.' });
    }
  }

  /** The history file, then the localisation with it when the save carries one. */
  private async saveDefinition(target: Target, params: SaveParams & { section: 'history' }): Promise<SaveResult> {
    const localisation = params.localisation;
    const stray = localisation === undefined ? undefined : this.writer.codepageReason(localisation.text);
    if (stray !== undefined) {
      return { ok: false, reason: stray };
    }
    const history = await this.saveHistory(target, params, params.data, params.createInFolder);
    if (!history.ok || localisation === undefined) {
      return history;
    }
    const named = await this.saveLocalisation(target, params, localisation.text, localisation.renameHistoryFile);
    return named.ok
      ? { ...named, written: [...history.written, ...named.written] }
      : { ...named, written: [...history.written, ...(named.written ?? [])] };
  }

  private async saveLocalisation(
    target: Target,
    params: SaveParams,
    text: string,
    renameHistoryFile: boolean,
  ): Promise<SaveResult> {
    const key = provinceLocKey(params.provinceId);
    const stray = this.writer.codepageReason(text);
    if (stray !== undefined) {
      return { ok: false, reason: stray };
    }
    const written = await this.writeLocalisation(target, key, text, params.dryRun === true);
    if (written === undefined) {
      return { ok: false, reason: 'The localisation file could not be written.' };
    }
    const files = [written.absolutePath];
    if (renameHistoryFile) {
      const renamed = await this.renameHistoryFile(target, params.provinceId, text, params.dryRun === true);
      if (typeof renamed === 'object') {
        return { ok: false, reason: renamed.reason, written: files };
      }
      if (renamed !== undefined) {
        files.push(renamed);
      }
    }
    const details = await this.details.of(target, params.provinceId, params.popDate);
    const localisation: LocSection = { key, text: text.trim(), file: written, inTarget: true };
    return { ok: true, written: files, details: { ...details, localisation } };
  }

  /** Patch the key where the target defines it, else add it to the target's province file. */
  private async writeLocalisation(target: Target, key: string, text: string, dryRun: boolean): Promise<FileRef | undefined> {
    const current = this.details.localisation(target, Number(key.slice('PROV'.length)));
    const absolutePath =
      current.file !== undefined && current.inTarget
        ? current.file.absolutePath
        : path.join(target.root, LOCALISATION_FOLDER, await this.locFileForNewKey(target.root));
    const existing = await this.host.readText(absolutePath);
    if (dryRun) {
      return { absolutePath, line: existing === undefined ? 1 : (locKeyLine(existing, key) ?? 0) };
    }
    if (existing === undefined) {
      return (await this.writer.writeTextPlain(absolutePath, newProvinceLocFile(key, text))) ? { absolutePath, line: 1 } : undefined;
    }
    const line = locKeyLine(existing, key);
    const patch = line === undefined ? appendProvinceLoc(existing, key, text) : patchProvinceLoc(existing, line, text);
    if (patch === undefined) {
      return undefined;
    }
    const updated = applyPatches(existing, [patch]);
    const ok = await this.writer.writeTextPlain(absolutePath, updated);
    return ok ? { absolutePath, line: locKeyLine(updated, key) ?? 0 } : undefined;
  }

  private async locFileForNewKey(root: string): Promise<string> {
    const folder = path.join(root, LOCALISATION_FOLDER);
    const candidates: LocFileCandidate[] = [];
    for (const name of this.host.fileSystem.listFiles(folder, '.csv')) {
      const text = await this.host.readText(path.join(folder, name));
      candidates.push({ name, provinceKeyCount: countProvinceKeys(text ?? '') });
    }
    return pickLocFileForNewKey(candidates);
  }

  /** Rename `<id> - <old>.txt` to match the new name; only a file inside the target moves. */
  private async renameHistoryFile(
    target: Target,
    provinceId: number,
    name: string,
    dryRun: boolean,
  ): Promise<string | { readonly reason: string } | undefined> {
    const history = await this.details.history(target, provinceId);
    if (history.file === undefined || !history.inTarget) {
      return undefined;
    }
    const wanted = historyFileNameFor(provinceId, name);
    const current = history.file.absolutePath;
    if (path.basename(current) === wanted) {
      return undefined;
    }
    const destination = path.join(path.dirname(current), wanted);
    if (dryRun) {
      return destination;
    }
    if (!(await this.writer.rename(current, destination))) {
      return { reason: `The history file could not be renamed to "${wanted}"; check that no file of that name is there already.` };
    }
    this.provinceFiles.forgetHistory(target.layers);
    return destination;
  }

  private async saveHistory(
    target: Target,
    params: SaveParams,
    data: ProvinceHistory,
    createInFolder: string | undefined,
  ): Promise<SaveResult> {
    const relativePath = findHistoryFile(this.provinceFiles.historyFiles(target.layers), params.provinceId);
    const source = relativePath === undefined ? undefined : this.stack.resolve(target.layers, relativePath);
    const text = source === undefined ? undefined : await this.host.readText(source);
    const plan =
      relativePath !== undefined && source !== undefined && text !== undefined
        ? await this.patchedHistory(target, params, data, createInFolder, { relativePath, source, text })
        : await this.newHistory(target, params, data, createInFolder);
    if ('ok' in plan) {
      return plan;
    }
    const { destination, updated, moved } = plan;
    const failed = await this.writer.writeText(destination, updated, 'The history file', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed, ...(moved ? { written: [destination] } : {}) };
    }
    if (params.dryRun !== true) {
      this.countryColors.forget(target.layers.key);
      this.provinceFiles.forgetHistory(target.layers);
    }
    return { ok: true, written: [destination], details: await this.details.of(target, params.provinceId, params.popDate) };
  }

  private async patchedHistory(
    target: Target,
    params: SaveParams,
    data: ProvinceHistory,
    createInFolder: string | undefined,
    file: { readonly relativePath: string; readonly source: string; readonly text: string },
  ): Promise<HistoryWrite | SaveResult> {
    const move = historyMove(target.root, file.relativePath, file.source, createInFolder);
    const patches = planHistoryEdit(file.text, parseDocument(file.text).document, data);
    if (patches.length === 0 && !move.changed) {
      return { ok: true, written: [], details: await this.details.of(target, params.provinceId, params.popDate) };
    }
    if (move.rename && params.dryRun !== true && !(await this.writer.rename(file.source, move.destination))) {
      return { ok: false, reason: movedHistoryReason(move.folder) };
    }
    return { destination: move.destination, updated: applyPatches(file.text, patches), moved: move.rename && params.dryRun !== true };
  }

  /** A province the folder pattern hides a file of must stop here: a second file would load as well as the first. */
  private async newHistory(
    target: Target,
    params: SaveParams,
    data: ProvinceHistory,
    createInFolder: string | undefined,
  ): Promise<HistoryWrite | SaveResult> {
    if (await this.isSeaProvince(target, params)) {
      return { ok: true, written: [], details: await this.details.of(target, params.provinceId, params.popDate) };
    }
    const hidden = this.provinceFiles.hiddenHistoryFile(target.layers, params.provinceId);
    if (hidden !== undefined) {
      return { ok: false, reason: hiddenHistoryReason(hidden, params.provinceId) };
    }
    const details = await this.details.of(target, params.provinceId, params.popDate);
    const name = historyName(params.create?.name ?? '', details);
    const destination = path.join(target.root, PROVINCE_HISTORY_FOLDER, createInFolder ?? '', historyFileNameFor(params.provinceId, name));
    return { destination, updated: renderProvinceHistory(data), moved: false };
  }

  private async savePops(
    target: Target,
    params: SaveParams,
    pops: readonly PopEntry[],
    createInFile: string | undefined,
  ): Promise<SaveResult> {
    const { provinceId, popDate } = params;
    const known = (await this.provinceFiles.popsFiles(target.layers, popDate)).get(provinceId);
    const chosen = createInFile === undefined || createInFile.trim() === '' ? undefined : withTxt(createInFile.trim());
    const relativePath = known ?? (chosen === undefined ? undefined : `${POPS_FOLDER}/${popDate}/${chosen}`);
    if (relativePath === undefined) {
      return { ok: false, reason: 'Pick the pops file the province should be added to.' };
    }
    const source = this.stack.resolve(target.layers, relativePath);
    const text = source === undefined ? undefined : await this.host.readText(source);
    const destination = this.writer.destinationFor(target.root, source, relativePath);
    const updated =
      text === undefined
        ? renderPopsFile(provinceId, pops)
        : applyPatches(text, planPopsEdit(text, parseDocument(text).document, provinceId, pops));
    if (updated === text) {
      return { ok: true, written: [], details: await this.details.of(target, provinceId, popDate) };
    }
    const failed = await this.writer.writeText(destination, updated, 'The pops file', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    this.provinceFiles.forgetPops(target.layers, popDate);
    return { ok: true, written: [destination], details: await this.details.of(target, provinceId, popDate) };
  }

  private async savePositions(target: Target, params: SaveParams, data: ProvincePositions): Promise<SaveResult> {
    const { provinceId, popDate } = params;
    const file = await this.stack.scriptFile(target.layers, POSITIONS_FILE);
    const updated = file
      ? applyPatches(file.text, planPositionsEdit(file.text, file.document, provinceId, data))
      : renderPositionsFile(provinceId, data);
    if (updated === file?.text) {
      return { ok: true, written: [], details: await this.details.of(target, provinceId, popDate) };
    }
    const destination = this.writer.destinationFor(target.root, file?.absolutePath, POSITIONS_FILE);
    const failed = await this.writer.writeText(destination, updated, 'map/positions.txt', params.dryRun === true);
    if (failed !== undefined) {
      return { ok: false, reason: failed };
    }
    this.stack.forgetScript(target.layers, POSITIONS_FILE);
    return { ok: true, written: [destination], details: await this.details.of(target, provinceId, popDate) };
  }
}

function withWritten(failure: SaveResult & { ok: false }, written: readonly string[], params: SaveParams): SaveResult {
  return written.length === 0 || params.dryRun === true ? failure : { ...failure, written };
}

/** The sections one save writes, in the order they reach disk; `all` is split here. */
function sectionsOf(params: SaveParams): SaveParams[] {
  if (params.section !== 'all') {
    return [params];
  }
  const base = {
    workspaceFolders: params.workspaceFolders,
    mods: params.mods,
    provinceId: params.provinceId,
    popDate: params.popDate,
    ...(params.create === undefined ? {} : { create: params.create }),
    ...(params.dryRun === undefined ? {} : { dryRun: params.dryRun }),
  };
  const pops = params.pops;
  return [
    { ...base, section: 'history' as const, ...params.history },
    ...(pops === undefined ? [] : [{ ...base, section: 'pops' as const, ...pops }]),
    { ...base, section: 'positions' as const, ...params.positions },
  ];
}

function climateIn(params: SaveParams): string | undefined {
  return params.section === 'history' ? params.climate : params.create?.climate;
}

function continentIn(params: SaveParams): string | undefined {
  return params.section === 'history' ? params.continent : params.create?.continent;
}

function statesIn(params: SaveParams): readonly string[] | undefined {
  return (params.section === 'history' ? params.states : undefined) ?? params.create?.states;
}

function historyName(created: string, details: ProvinceDetails): string {
  if (created.trim() !== '') {
    return created.trim();
  }
  return details.localisation.text !== '' ? details.localisation.text : details.definitionName;
}

function hiddenHistoryReason(relativePath: string, provinceId: number): string {
  const folder = historyFolderOf(relativePath);
  const where = folder === '' ? 'directly in history/provinces' : `in '${folder}'`;
  return `Province ${String(provinceId)} already has a history file ${where}, which the province folder pattern hides. Widen victorianTools.mapEditor.provinceFolderPattern to edit that file.`;
}

/** Where a history file that already exists is written: in place, or moved to the folder the form picked. */
function historyMove(root: string, relativePath: string, source: string, wantedFolder: string | undefined): HistoryMove {
  const inTarget = isInsideRoot(root, source);
  const folder = wantedFolder ?? historyFolderOf(relativePath);
  const changed = folder !== historyFolderOf(relativePath);
  return {
    destination: !changed && inTarget ? source : path.join(root, PROVINCE_HISTORY_FOLDER, folder, path.basename(relativePath)),
    folder,
    changed,
    rename: changed && inTarget,
  };
}

/** A name with no ASCII shape is refused: the game reads a file name as plain ASCII. */
function fileNameReason(params: SaveParams): string | undefined {
  const named = [
    ...(params.create === undefined ? [] : [params.create.name]),
    ...(params.section === 'history' && params.localisation?.renameHistoryFile === true ? [params.localisation.text] : []),
  ];
  for (const name of named) {
    const stray = unfoldableCharacter(name);
    if (stray !== undefined) {
      return `'${stray}' has no ASCII letter to stand for it, and the game reads a file name as plain ASCII. Name the province without it, or leave the history file its current name.`;
    }
  }
  return undefined;
}

function movedHistoryReason(folder: string): string {
  const where = folder === '' ? 'directly into history/provinces' : `into '${folder}'`;
  return `The history file could not be moved ${where}; check that no file of the same name is there already.`;
}

function withTxt(fileName: string): string {
  return fileName.toLowerCase().endsWith('.txt') ? fileName : `${fileName}.txt`;
}
