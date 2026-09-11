/** The kind of Victoria 2 script file, inferred from its location in the mod. */
export type FileType =
  | 'event'
  | 'decision'
  | 'crime'
  | 'triggeredModifier'
  | 'cbType'
  | 'nationalFocus'
  | 'rebelType'
  | 'onActions'
  | 'issues'
  | 'graphicalCulture'
  | 'countryColors'
  | 'countryList'
  | 'cultures'
  | 'religions'
  | 'goods'
  | 'ideologies'
  | 'governments'
  | 'buildings'
  | 'nationalValues'
  | 'eventModifiers'
  | 'staticModifiers'
  | 'traits'
  | 'productionTypes'
  | 'bookmarks'
  | 'popChances'
  | 'techFolders'
  | 'countryDefinition'
  | 'commonOther'
  | 'popType'
  | 'technology'
  | 'invention'
  | 'newsScript'
  | 'historyCountry'
  | 'historyProvince'
  | 'historyPops'
  | 'historyDiplomacy'
  | 'historyUnits'
  | 'historyWars'
  | 'historyOther'
  | 'mapDefault'
  | 'mapDefinition'
  | 'mapAdjacencies'
  | 'mapRegion'
  | 'mapContinent'
  | 'mapClimate'
  | 'mapTerrain'
  | 'mapPositions'
  | 'mapOther'
  | 'unknown';

/** File types whose content is CSV, not Paradox script. */
export const CSV_FILE_TYPES: ReadonlySet<FileType> = new Set(['mapDefinition', 'mapAdjacencies']);

const COMMON_FILE_TYPES: Readonly<Record<string, FileType>> = {
  'crime.txt': 'crime',
  'triggered_modifiers.txt': 'triggeredModifier',
  'cb_types.txt': 'cbType',
  'national_focus.txt': 'nationalFocus',
  'rebel_types.txt': 'rebelType',
  'on_actions.txt': 'onActions',
  'issues.txt': 'issues',
  // A bare list of graphical culture names — the one common/ file with no `=`.
  'graphicalculturetype.txt': 'graphicalCulture',
  'country_colors.txt': 'countryColors',
  'countries.txt': 'countryList',
  'cultures.txt': 'cultures',
  'religion.txt': 'religions',
  'goods.txt': 'goods',
  'ideologies.txt': 'ideologies',
  'governments.txt': 'governments',
  'buildings.txt': 'buildings',
  'nationalvalues.txt': 'nationalValues',
  'event_modifiers.txt': 'eventModifiers',
  'static_modifiers.txt': 'staticModifiers',
  'traits.txt': 'traits',
  'production_types.txt': 'productionTypes',
  'bookmarks.txt': 'bookmarks',
  'pop_types.txt': 'popChances',
  'technology.txt': 'techFolders',
};

const MAP_FILE_TYPES: Readonly<Record<string, FileType>> = {
  'default.map': 'mapDefault',
  'definition.csv': 'mapDefinition',
  'adjacencies.csv': 'mapAdjacencies',
  'region.txt': 'mapRegion',
  'region_sea.txt': 'mapRegion',
  'super_region.txt': 'mapRegion',
  'continent.txt': 'mapContinent',
  'climate.txt': 'mapClimate',
  'terrain.txt': 'mapTerrain',
  'positions.txt': 'mapPositions',
};

const HISTORY_FILE_TYPES: Readonly<Record<string, FileType>> = {
  countries: 'historyCountry',
  provinces: 'historyProvince',
  pops: 'historyPops',
  diplomacy: 'historyDiplomacy',
  units: 'historyUnits',
  wars: 'historyWars',
};

/**
 * Classify a file by its path or URI. Matching is case-insensitive and works on
 * both `\`- and `/`-separated paths, and on `file://` URIs (folder segments are
 * not percent-encoded).
 */
export function classifyFile(pathOrUri: string): FileType {
  const normalized = pathOrUri.replace(/\\/g, '/').toLowerCase();
  // Only script files and the two map CSVs are mod data; scripts, images, and
  // notes sitting next to them (a .vbs in history/pops/, a .bmp in map/) are not.
  if (!normalized.endsWith('.txt') && !normalized.endsWith('.map')) {
    return normalized.endsWith('.csv') ? classifyMapFile(normalized) ?? 'unknown' : 'unknown';
  }
  return (
    classifyByFolder(normalized) ??
    classifyHistoryFile(normalized) ??
    classifyMapFile(normalized) ??
    classifyCommonFile(normalized) ??
    'unknown'
  );
}

const FOLDER_FILE_TYPES: readonly (readonly [RegExp, FileType])[] = [
  [/(?:^|\/)events\//, 'event'],
  [/(?:^|\/)decisions\//, 'decision'],
  [/(?:^|\/)poptypes\/[^/]+\.txt$/, 'popType'],
  [/(?:^|\/)technologies\/[^/]+\.txt$/, 'technology'],
  [/(?:^|\/)inventions\/[^/]+\.txt$/, 'invention'],
  [/(?:^|\/)news\/[^/]+\.txt$/, 'newsScript'],
];

function classifyByFolder(normalized: string): FileType | undefined {
  return FOLDER_FILE_TYPES.find(([pattern]) => pattern.test(normalized))?.[1];
}

function classifyHistoryFile(normalized: string): FileType | undefined {
  const historyFolder = /(?:^|\/)history\/([^/]+)\//.exec(normalized)?.[1];
  if (historyFolder === undefined) {
    return undefined;
  }
  return HISTORY_FILE_TYPES[historyFolder] ?? 'historyOther';
}

function classifyMapFile(normalized: string): FileType | undefined {
  const mapFile = /(?:^|\/)map\/([^/]+\.(?:txt|csv|map))$/.exec(normalized)?.[1];
  if (mapFile !== undefined) {
    return MAP_FILE_TYPES[mapFile] ?? (mapFile.endsWith('.txt') ? 'mapOther' : 'unknown');
  }
  return /(?:^|\/)map\/.*\.txt$/.test(normalized) ? 'mapOther' : undefined;
}

// The common/ checks go last: full paths may carry an unrelated `common/`
// segment (Steam installs mods under `steamapps/common/<game>/mod/`).
function classifyCommonFile(normalized: string): FileType | undefined {
  if (/(?:^|\/)common\/countries\/[^/]+\.txt$/.test(normalized)) {
    return 'countryDefinition';
  }
  const commonFile = /(?:^|\/)common\/([^/]+\.txt)$/.exec(normalized)?.[1];
  if (commonFile !== undefined) {
    return COMMON_FILE_TYPES[commonFile] ?? 'commonOther';
  }
  return /(?:^|\/)common\/.*\.txt$/.test(normalized) ? 'commonOther' : undefined;
}
