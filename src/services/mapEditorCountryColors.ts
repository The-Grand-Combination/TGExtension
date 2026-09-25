import { COUNTRY_LIST_FILE } from '../model/gamePaths.js';
import type { MapCountryColorsResult, Rgb } from '../model/mapEditor.js';
import { countryColorOf, countryFilesOf, provinceOwnerOf } from './countryColors.js';
import type { MapEditorProvinceFiles } from './mapEditorProvinceFiles.js';
import { cached, type MapEditorStack } from './mapEditorStack.js';
import type { ModLayers } from './modLayers.js';
import { provinceIdOfHistoryFile } from './provinceHistoryEdit.js';
import { readInBatches } from './scheduling.js';
import { parseDocument } from './syntaxValidation.js';

export interface CountryColorsHost {
  readonly readText: (absolutePath: string) => Promise<string | undefined>;
}

/** Who owns each province at the start date and the colour of each owner, kept per stack. */
export class MapEditorCountryColors {
  private readonly byLayers = new Map<string, Promise<MapCountryColorsResult>>();

  constructor(
    private readonly host: CountryColorsHost,
    private readonly stack: MapEditorStack,
    private readonly provinceFiles: MapEditorProvinceFiles,
  ) {}

  of(layers: ModLayers): Promise<MapCountryColorsResult> {
    return cached(this.byLayers, layers.key, () => this.read(layers));
  }

  forget(layersKey: string): void {
    this.byLayers.delete(layersKey);
  }

  clear(): void {
    this.byLayers.clear();
  }

  private async read(layers: ModLayers): Promise<MapCountryColorsResult> {
    const countriesPath = this.stack.resolve(layers, COUNTRY_LIST_FILE);
    const countriesText = countriesPath === undefined ? undefined : await this.host.readText(countriesPath);
    if (countriesText === undefined) {
      return { kind: 'unavailable', reason: 'The picked mods have no common/countries.txt.' };
    }
    const owners = await this.owners(layers);
    const files = countryFilesOf(parseDocument(countriesText).document);
    const colors: Record<string, Rgb> = {};
    for (const tag of new Set(Object.values(owners))) {
      const relativePath = files.get(tag);
      const absolutePath = relativePath === undefined ? undefined : this.stack.resolve(layers, relativePath);
      const text = absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      const color = text === undefined ? undefined : countryColorOf(parseDocument(text).document);
      if (color) {
        colors[tag] = color;
      }
    }
    return { kind: 'ready', owners, colors };
  }

  private async owners(layers: ModLayers): Promise<Record<string, string>> {
    const owners: Record<string, string> = {};
    const relativePaths = this.provinceFiles.historyFiles(layers).filter((relativePath) =>
      relativePath.toLowerCase().endsWith('.txt'),
    );
    const entries = await readInBatches(relativePaths, async (relativePath) => {
      const id = provinceIdOfHistoryFile(relativePath.slice(relativePath.lastIndexOf('/') + 1));
      const absolutePath = this.stack.resolve(layers, relativePath);
      const text = id === undefined || absolutePath === undefined ? undefined : await this.host.readText(absolutePath);
      const owner = text === undefined ? undefined : provinceOwnerOf(parseDocument(text).document);
      return owner === undefined || id === undefined ? undefined : ([String(id), owner] as const);
    });
    for (const entry of entries) {
      if (entry && !(entry[0] in owners)) {
        owners[entry[0]] = entry[1];
      }
    }
    return owners;
  }
}
