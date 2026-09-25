import {
  CLIMATE_FILE,
  CONTINENT_FILE,
  DEFAULT_MAP_FILE,
  POSITIONS_FILE,
  REGION_FILE,
} from '../model/gamePaths.js';
import type {
  ClimateSection,
  ContinentSection,
  HistorySection,
  LocSection,
  PopsSection,
  PositionsSection,
  ProvinceDetails,
  StateSection,
  TerrainSection,
} from '../model/mapEditor.js';
import { seaStartsOf } from './mapDefaultEdit.js';
import type { MapEditorProvinceFiles } from './mapEditorProvinceFiles.js';
import type { MapEditorStack, ScriptFile, Target } from './mapEditorStack.js';
import type { MapEditorTerrain } from './mapEditorTerrain.js';
import { namedIdentifiersOf } from './mapEditorVocabulary.js';
import { isInsideRoot } from './modLayout.js';
import { groupNames, groupOffsetOf, groupsOfProvince, type ProvinceListShape } from './provinceGroupEdit.js';
import { findHistoryFile, historyFolderOf, parseProvinceHistory } from './provinceHistoryEdit.js';
import { readProvinceLoc } from './provinceLocEdit.js';
import { findPopsBlock, parsePops } from './provincePopsEdit.js';
import { findPositionsBlock, parseProvincePositions } from './provincePositionsEdit.js';
import { parseDocument } from './syntaxValidation.js';
import { lineOf } from './textPatch.js';

/** `continent.txt` keeps a continent's ids in a `provinces = { }`, next to its modifiers. */
export const CONTINENT_LIST: ProvinceListShape = 'nested';
const OCEAN_TERRAIN = 'ocean';

export interface DetailsHost {
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
}

interface GroupSection {
  readonly names: string[];
  readonly file: { absolutePath: string; line: number } | undefined;
  readonly inTarget: boolean;
  readonly options: ReturnType<typeof namedIdentifiersOf>;
}

/** Everything the page shows about one province, read from the stack. */
export class MapEditorDetails {
  constructor(
    private readonly host: DetailsHost,
    private readonly stack: MapEditorStack,
    private readonly terrain: MapEditorTerrain,
    private readonly provinceFiles: MapEditorProvinceFiles,
  ) {}

  async of(target: Target, provinceId: number, popDate: string): Promise<ProvinceDetails> {
    const { definitions } = await this.stack.definitions(target.layers);
    const history = await this.history(target, provinceId);
    const isSea = (await this.seaProvinces(target)).has(String(provinceId));
    const declared = definitions.find((definition) => definition.id === provinceId);
    return {
      id: provinceId,
      definitionName: declared?.name ?? '',
      isSea,
      isNew: declared === undefined,
      localisation: this.localisation(target, provinceId),
      history,
      pops: await this.pops(target, provinceId, popDate),
      positions: await this.positions(target, provinceId),
      terrain: await this.terrainOf(target, provinceId, history, isSea),
      climate: await this.climate(target, provinceId),
      continent: await this.continent(target, provinceId),
      state: await this.state(target, provinceId),
    };
  }

  /** `sea_starts` as the disk has it; the index stands in when the stack has no default.map. */
  async seaProvinces(target: Target): Promise<ReadonlySet<string>> {
    const file = await this.stack.scriptFile(target.layers, DEFAULT_MAP_FILE);
    return file ? seaStartsOf(file.document) : target.index.seaProvinces;
  }

  localisation(target: Target, provinceId: number): LocSection {
    const loc = readProvinceLoc(target.index, provinceId);
    const absolutePath = loc.filePath === undefined ? undefined : this.stack.resolve(target.layers, loc.filePath);
    return {
      key: loc.key,
      text: loc.text,
      file: absolutePath === undefined ? undefined : { absolutePath, line: loc.line },
      inTarget: absolutePath !== undefined && isInsideRoot(target.root, absolutePath),
    };
  }

  async history(target: Target, provinceId: number): Promise<HistorySection> {
    const relativePath = findHistoryFile(this.provinceFiles.historyFiles(target.layers), provinceId);
    const absolutePath = relativePath === undefined ? undefined : this.stack.resolve(target.layers, relativePath);
    const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
    if (absolutePath === undefined || relativePath === undefined || text === undefined) {
      return { file: undefined, inTarget: false, data: undefined, folder: undefined };
    }
    return {
      file: { absolutePath, line: 0 },
      inTarget: isInsideRoot(target.root, absolutePath),
      data: parseProvinceHistory(parseDocument(text).document),
      folder: historyFolderOf(relativePath),
    };
  }

  private async climate(target: Target, provinceId: number): Promise<ClimateSection> {
    const { names, ...rest } = await this.group(target, provinceId, CLIMATE_FILE);
    return { name: names[0], ...rest };
  }

  private async continent(target: Target, provinceId: number): Promise<ContinentSection> {
    const { names, ...rest } = await this.group(target, provinceId, CONTINENT_FILE, CONTINENT_LIST);
    return { name: names[0], ...rest };
  }

  private state(target: Target, provinceId: number): Promise<StateSection> {
    return this.group(target, provinceId, REGION_FILE);
  }

  private async group(
    target: Target,
    provinceId: number,
    relativePath: string,
    shape: ProvinceListShape = 'bare',
  ): Promise<GroupSection> {
    const file = await this.stack.scriptFile(target.layers, relativePath);
    const names = file ? groupsOfProvince(file.document, provinceId, shape) : [];
    return {
      names,
      file: file ? { absolutePath: file.absolutePath, line: groupLine(file, names[0], shape) } : undefined,
      inTarget: file !== undefined && isInsideRoot(target.root, file.absolutePath),
      options: namedIdentifiersOf(target.index, file ? groupNames(file.document) : []),
    };
  }

  private async terrainOf(
    target: Target,
    provinceId: number,
    history: HistorySection,
    isSea: boolean,
  ): Promise<TerrainSection> {
    if (isSea) {
      return { name: OCEAN_TERRAIN, dominant: undefined, pictureDataUri: await this.terrain.oceanPicture(target.layers) };
    }
    const info = await this.terrain.info(target.layers);
    const name = history.data?.terrain;
    const pictureDataUri =
      name === undefined
        ? await this.terrain.noTerrainPicture()
        : await this.terrain.pictureOf(target.layers, info, name);
    return { name, dominant: info.dominant.get(provinceId), pictureDataUri };
  }

  private async pops(target: Target, provinceId: number, date: string): Promise<PopsSection> {
    const relativePath = (await this.provinceFiles.popsFiles(target.layers, date)).get(provinceId);
    const absolutePath = relativePath === undefined ? undefined : this.stack.resolve(target.layers, relativePath);
    const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
    const block = text === undefined ? undefined : findPopsBlock(parseDocument(text).document, provinceId);
    if (absolutePath === undefined || text === undefined || block?.value.kind !== 'block') {
      return { date, file: undefined, inTarget: false, pops: undefined };
    }
    return {
      date,
      file: { absolutePath, line: lineOf(text, block.range.start) },
      inTarget: isInsideRoot(target.root, absolutePath),
      pops: parsePops(block.value),
    };
  }

  private async positions(target: Target, provinceId: number): Promise<PositionsSection> {
    const file = await this.stack.scriptFile(target.layers, POSITIONS_FILE);
    const block = file ? findPositionsBlock(file.document, provinceId) : undefined;
    if (!file) {
      return { file: undefined, inTarget: false, data: undefined };
    }
    return {
      file: { absolutePath: file.absolutePath, line: block ? lineOf(file.text, block.range.start) : 0 },
      inTarget: isInsideRoot(target.root, file.absolutePath),
      data: block?.value.kind === 'block' ? parseProvincePositions(block.value) : undefined,
    };
  }
}

function groupLine(file: ScriptFile, name: string | undefined, shape: ProvinceListShape): number {
  const offset = name === undefined ? undefined : groupOffsetOf(file.document, name, shape);
  return offset === undefined ? 0 : lineOf(file.text, offset);
}
