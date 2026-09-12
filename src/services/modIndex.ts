import { minBuildKey, researchBonusKey } from '../data/modifierKeys.js';
import { asBlock, assignmentsOf, blockKeysOf, firstByKey, scalarValueOf } from '../model/astQuery.js';
import type { Assignment, Block, Document, Entry } from '../model/ast.js';
import type {
  DuplicateIdentifier,
  EventOccurrence,
  FlagSets,
  IdentifierOccurrence,
  LocKeyDefinition,
  ModIndex,
} from '../model/modIndex.js';
import type { IdentifierCategory } from '../model/symbols.js';
import { csvRows } from '../parser/csv.js';
import { yieldToEventLoop } from './scheduling.js';
import { parseDocument } from './syntaxValidation.js';

/** File access needed to build the index; injected so the service stays testable. */
export interface ModFileProvider {
  readFile(relativePath: string): string | undefined;
  listFiles(relativeDirectory: string, extension: string): string[];
  /** Every file under a folder and its subfolders, as forward-slash paths from the mod root. */
  listFilesRecursive(relativeFolder: string): string[];
}

/** Region files in the order the engine reads them; later files can only add meta-regions. */
const MAP_REGION_FILES: readonly string[] = [
  'map/region.txt',
  'map/region_sea.txt',
  'map/super_region.txt',
];

export function hasIdentifier(index: ModIndex, category: IdentifierCategory, name: string): boolean {
  return index.identifiers.get(category)?.has(name.toLowerCase()) ?? false;
}

export function namesOf(index: ModIndex, category: IdentifierCategory): readonly string[] {
  const set = index.identifiers.get(category);
  return set ? [...set] : [];
}

function parseRelative(provider: ModFileProvider, relativePath: string): Document | undefined {
  const text = provider.readFile(relativePath);
  return text === undefined ? undefined : parseDocument(text).document;
}

/** Bare-word list files (e.g. graphicalculturetype.txt). */
function topLevelScalarNames(provider: ModFileProvider, relativePath: string): string[] {
  const document = parseRelative(provider, relativePath);
  if (!document) {
    return [];
  }
  const names: string[] = [];
  for (const entry of document.entries) {
    if (entry.kind === 'scalar') {
      names.push(entry.value.toLowerCase());
    }
  }
  return names;
}

function topLevelOccurrences(provider: ModFileProvider, filePath: string): IdentifierOccurrence[] {
  const document = parseRelative(provider, filePath);
  if (!document) {
    return [];
  }
  return blockKeysOf(document).map((assignment) => ({
    name: assignment.key.value.toLowerCase(),
    filePath,
    range: assignment.key.range,
  }));
}

interface GroupedOccurrences {
  readonly groups: IdentifierOccurrence[];
  readonly items: IdentifierOccurrence[];
}

function groupThenItemOccurrences(provider: ModFileProvider, filePath: string): GroupedOccurrences {
  const groups: IdentifierOccurrence[] = [];
  const items: IdentifierOccurrence[] = [];
  const document = parseRelative(provider, filePath);
  if (!document) {
    return { groups, items };
  }
  for (const group of blockKeysOf(document)) {
    groups.push({ name: group.key.value.toLowerCase(), filePath, range: group.key.range });
    const groupBlock = asBlock(group.value);
    if (groupBlock) {
      for (const item of blockKeysOf(groupBlock)) {
        items.push({ name: item.key.value.toLowerCase(), filePath, range: item.key.range });
      }
    }
  }
  return { groups, items };
}

function countryTagOccurrences(provider: ModFileProvider): IdentifierOccurrence[] {
  const filePath = 'common/countries.txt';
  const document = parseRelative(provider, filePath);
  if (!document) {
    return [];
  }
  return assignmentsOf(document.entries)
    .filter(
      (assignment) =>
        assignment.value.kind === 'scalar' && assignment.key.value.toLowerCase() !== 'dynamic_tags',
    )
    .map((assignment) => ({
      name: assignment.key.value.toLowerCase(),
      filePath,
      range: assignment.key.range,
    }));
}

function provinceOccurrences(provider: ModFileProvider): IdentifierOccurrence[] {
  const filePath = 'map/definition.csv';
  const text = provider.readFile(filePath);
  if (text === undefined) {
    return [];
  }
  const occurrences: IdentifierOccurrence[] = [];
  for (const row of csvRows(text, { maxFields: 1 })) {
    const id = row.fields[0];
    if (id && /^\d+$/.test(id.text)) {
      occurrences.push({ name: id.text, filePath, range: id.range });
    }
  }
  return occurrences;
}

function terrainOccurrences(provider: ModFileProvider): IdentifierOccurrence[] {
  const filePath = 'map/terrain.txt';
  const document = parseRelative(provider, filePath);
  if (!document) {
    return [];
  }
  const categories = firstByKey(document.entries, 'categories');
  const block = categories ? asBlock(categories.value) : undefined;
  if (!block) {
    return [];
  }
  return blockKeysOf(block).map((assignment) => ({
    name: assignment.key.value.toLowerCase(),
    filePath,
    range: assignment.key.range,
  }));
}

interface DefaultMapData {
  readonly maxProvinces: number | undefined;
  readonly seaProvinces: Set<string>;
}

function readDefaultMap(provider: ModFileProvider): DefaultMapData {
  const document = parseRelative(provider, 'map/default.map');
  const seaProvinces = new Set<string>();
  if (!document) {
    return { maxProvinces: undefined, seaProvinces };
  }
  const seaStarts = firstByKey(document.entries, 'sea_starts');
  const seaBlock = seaStarts ? asBlock(seaStarts.value) : undefined;
  for (const entry of seaBlock?.entries ?? []) {
    if (entry.kind === 'scalar' && entry.type === 'number') {
      seaProvinces.add(entry.value);
    }
  }
  const maxText = scalarValueOf(document.entries, 'max_provinces');
  const maxProvinces = maxText !== undefined && /^\d+$/.test(maxText) ? Number(maxText) : undefined;
  return { maxProvinces, seaProvinces };
}

/** Numeric bare values of a block: the province ids of a state, continent, or climate. */
function provinceIdsOf(block: Block): string[] {
  const ids: string[] = [];
  for (const entry of block.entries) {
    if (entry.kind === 'scalar' && entry.type === 'number') {
      ids.push(entry.value);
    }
  }
  return ids;
}

/**
 * Replay the engine's state assignment: a block whose provinces are all already
 * assigned is a meta-region and claims nothing; otherwise its unassigned
 * provinces join it as a state.
 */
function assignProvincesToStates(provider: ModFileProvider): Map<string, string> {
  const owner = new Map<string, string>();
  for (const filePath of MAP_REGION_FILES) {
    const document = parseRelative(provider, filePath);
    for (const state of document ? blockKeysOf(document) : []) {
      const block = asBlock(state.value);
      const unassigned = block ? provinceIdsOf(block).filter((id) => !owner.has(id)) : [];
      for (const id of unassigned) {
        owner.set(id, state.key.value.toLowerCase());
      }
    }
  }
  return owner;
}

function techSchoolOccurrences(provider: ModFileProvider): IdentifierOccurrence[] {
  const filePath = 'common/technology.txt';
  const document = parseRelative(provider, filePath);
  if (!document) {
    return [];
  }
  const schools = firstByKey(document.entries, 'schools');
  const block = schools ? asBlock(schools.value) : undefined;
  if (!block) {
    return [];
  }
  return blockKeysOf(block).map((assignment) => ({
    name: assignment.key.value.toLowerCase(),
    filePath,
    range: assignment.key.range,
  }));
}

/** Tech folder names from common/technology.txt, in declaration order. */
function techFolderNames(provider: ModFileProvider): string[] {
  const document = parseRelative(provider, 'common/technology.txt');
  const folders = document ? firstByKey(document.entries, 'folders') : undefined;
  const block = folders ? asBlock(folders.value) : undefined;
  return block ? blockKeysOf(block).map((assignment) => assignment.key.value.toLowerCase()) : [];
}

function folderOccurrences(provider: ModFileProvider, folder: string): IdentifierOccurrence[] {
  return provider
    .listFiles(folder, '.txt')
    .flatMap((fileName) => topLevelOccurrences(provider, `${folder}/${fileName}`));
}

interface IssueIndex {
  readonly classes: IdentifierOccurrence[];
  readonly reformOptions: IdentifierOccurrence[];
  readonly partyIssues: IdentifierOccurrence[];
  readonly optionsByClass: Map<string, Set<string>>;
  readonly poolByClass: Map<string, Set<string>>;
}

/** NCE keeps economic and military reform options apart from every other issue option. */
const REFORM_POOL_CATEGORIES: ReadonlySet<string> = new Set(['economic_reforms', 'military_reforms']);

function emptyIssueIndex(): IssueIndex {
  return { classes: [], reformOptions: [], partyIssues: [], optionsByClass: new Map(), poolByClass: new Map() };
}

function indexIssues(provider: ModFileProvider): IssueIndex {
  const filePath = 'common/issues.txt';
  const result = emptyIssueIndex();
  const document = parseRelative(provider, filePath);
  if (!document) {
    return result;
  }
  const issuePool = new Set<string>();
  const reformPool = new Set<string>();
  for (const category of blockKeysOf(document)) {
    const categoryName = category.key.value.toLowerCase();
    const categoryBlock = asBlock(category.value);
    if (!categoryBlock) {
      continue;
    }
    const pool = REFORM_POOL_CATEGORIES.has(categoryName) ? reformPool : issuePool;
    indexIssueCategory(categoryBlock, categoryName, filePath, result, pool);
  }
  return result;
}

function indexIssueCategory(
  categoryBlock: Block,
  categoryName: string,
  filePath: string,
  result: IssueIndex,
  pool: Set<string>,
): void {
  for (const issueClass of blockKeysOf(categoryBlock)) {
    const className = issueClass.key.value.toLowerCase();
    result.classes.push({ name: className, filePath, range: issueClass.key.range });
    const classBlock = asBlock(issueClass.value);
    if (!classBlock) {
      continue;
    }
    const positions = blockKeysOf(classBlock).map((position) => ({
      name: position.key.value.toLowerCase(),
      filePath,
      range: position.key.range,
    }));
    result.optionsByClass.set(className, new Set(positions.map((position) => position.name)));
    result.poolByClass.set(className, pool);
    for (const position of positions) {
      pool.add(position.name);
    }
    if (categoryName === 'party_issues') {
      result.partyIssues.push(...positions);
    } else {
      result.reformOptions.push(...positions);
    }
  }
}

function indexEventLike(
  provider: ModFileProvider,
  folder: 'events' | 'decisions',
  record: (document: Document, filePath: string) => void,
): void {
  for (const fileName of provider.listFiles(folder, '.txt')) {
    const relativePath = `${folder}/${fileName}`;
    const document = parseRelative(provider, relativePath);
    if (document) {
      record(document, relativePath);
    }
  }
}

function recordEventIds(
  document: Document,
  filePath: string,
  occurrences: Map<string, EventOccurrence[]>,
): void {
  for (const eventAssignment of blockKeysOf(document)) {
    const keyLower = eventAssignment.key.value.toLowerCase();
    if (keyLower !== 'country_event' && keyLower !== 'province_event') {
      continue;
    }
    const eventBlock = asBlock(eventAssignment.value);
    const idAssignment = eventBlock ? firstByKey(eventBlock.entries, 'id') : undefined;
    if (idAssignment?.value.kind !== 'scalar') {
      continue;
    }
    const list = occurrences.get(idAssignment.value.value) ?? [];
    list.push({ filePath, range: idAssignment.value.range });
    occurrences.set(idAssignment.value.value, list);
  }
}

function recordDecisionNames(
  document: Document,
  filePath: string,
  occurrences: Map<string, EventOccurrence[]>,
): void {
  for (const wrapper of blockKeysOf(document)) {
    if (wrapper.key.value.toLowerCase() !== 'political_decisions') {
      continue;
    }
    const wrapperBlock = asBlock(wrapper.value);
    if (!wrapperBlock) {
      continue;
    }
    for (const decision of blockKeysOf(wrapperBlock)) {
      const nameLower = decision.key.value.toLowerCase();
      const list = occurrences.get(nameLower) ?? [];
      list.push({ filePath, range: decision.key.range });
      occurrences.set(nameLower, list);
    }
  }
}

/** Recursively collect `set_country_flag` / `set_global_flag` values. */
export function collectSetFlags(entries: readonly Entry[], into: FlagSets): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      collectFlagAssignment(entry, into);
    } else if (entry.kind === 'block') {
      collectSetFlags(entry.entries, into);
    }
  }
}

function collectFlagAssignment(assignment: Assignment, into: FlagSets): void {
  if (assignment.value.kind === 'block') {
    collectSetFlags(assignment.value.entries, into);
    return;
  }
  const keyLower = assignment.key.value.toLowerCase();
  if (keyLower === 'set_country_flag') {
    into.country.add(assignment.value.value.toLowerCase());
  } else if (keyLower === 'set_global_flag') {
    into.global.add(assignment.value.value.toLowerCase());
  }
}

function collectFlagsFromFolder(provider: ModFileProvider, folder: string, into: FlagSets): void {
  for (const fileName of provider.listFiles(folder, '.txt')) {
    const document = parseRelative(provider, `${folder}/${fileName}`);
    if (document) {
      collectSetFlags(document.entries, into);
    }
  }
}

function localisationDefinitions(provider: ModFileProvider): Map<string, LocKeyDefinition> {
  const definitions = new Map<string, LocKeyDefinition>();
  for (const fileName of provider.listFiles('localisation', '.csv')) {
    const filePath = `localisation/${fileName}`;
    const text = provider.readFile(filePath);
    if (text === undefined) {
      continue;
    }
    for (const row of csvRows(text, { maxFields: 2 })) {
      const key = row.fields[0]?.text ?? '';
      const keyLower = key.toLowerCase();
      if (key !== '' && !definitions.has(keyLower)) {
        definitions.set(keyLower, {
          filePath,
          line: row.line,
          length: key.length,
          text: row.fields[1]?.text ?? '',
        });
      }
    }
  }
  return definitions;
}

const PICTURE_EXTENSION = /\.(tga|dds)$/i;

/**
 * Picture names as a `picture = <name>` value spells them: the path under the
 * folder, extension dropped. Subfolders are part of the name, so a file at
 * `gfx/pictures/events/Brasil/Dom Pedro.tga` is `brasil/dom pedro`.
 */
function pictureNames(provider: ModFileProvider, folder: string): string[] {
  const prefix = `${folder}/`;
  return provider
    .listFilesRecursive(folder)
    .filter((relativePath) => PICTURE_EXTENSION.test(relativePath))
    .map((relativePath) => relativePath.slice(prefix.length).replace(PICTURE_EXTENSION, '').toLowerCase());
}

function collectDuplicates(
  category: IdentifierCategory,
  occurrences: readonly IdentifierOccurrence[],
  out: DuplicateIdentifier[],
): void {
  const byName = new Map<string, IdentifierOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = byName.get(occurrence.name) ?? [];
    list.push(occurrence);
    byName.set(occurrence.name, list);
  }
  for (const [name, sites] of byName) {
    if (sites.length > 1) {
      out.push({ category, name, occurrences: sites });
    }
  }
}

/** Build the identifier index for a mod root. Missing files yield empty categories. */
export function buildModIndex(provider: ModFileProvider): ModIndex {
  const build = new IndexBuild(provider);
  for (const step of build.steps) {
    step();
  }
  return build.finish();
}

/**
 * The same build with the event loop given a turn between steps, so a language
 * server keeps answering requests while a large mod is indexed. Each step covers
 * one folder or one group of related files.
 */
export async function buildModIndexAsync(provider: ModFileProvider): Promise<ModIndex> {
  const build = new IndexBuild(provider);
  for (const step of build.steps) {
    step();
    await yieldToEventLoop();
  }
  return build.finish();
}

interface PutOptions {
  readonly specials?: readonly string[];
  readonly checkDuplicates?: boolean;
}

/** Mutable state of one index build; `steps` fill it, `finish` freezes it into a ModIndex. */
class IndexBuild {
  private readonly identifiers = new Map<IdentifierCategory, Set<string>>();
  private readonly duplicates: DuplicateIdentifier[] = [];
  private readonly flags: FlagSets = { country: new Set(), global: new Set() };
  private readonly eventOccurrences = new Map<string, EventOccurrence[]>();
  private readonly decisionOccurrences = new Map<string, EventOccurrence[]>();
  private locKeyDefinitions = new Map<string, LocKeyDefinition>();
  private issues: IssueIndex = emptyIssueIndex();
  private defaultMap: DefaultMapData = { maxProvinces: undefined, seaProvinces: new Set() };
  private stateOfProvince = new Map<string, string>();
  private techFolders: string[] = [];

  readonly steps: readonly (() => void)[] = [
    (): void => { this.indexCommonData(); },
    (): void => { this.indexIssuesAndPopTypes(); },
    (): void => { this.indexMap(); },
    (): void => { this.indexTechnology(); },
    (): void => { this.indexLocalisationAndPictures(); },
    (): void => { this.indexEvents(); },
    (): void => { this.indexDecisions(); },
    (): void => { this.indexOtherFlagSources(); },
  ];

  constructor(private readonly provider: ModFileProvider) {}

  finish(): ModIndex {
    return {
      identifiers: this.identifiers,
      reformOptionsByClass: this.issues.optionsByClass,
      optionPoolByClass: this.issues.poolByClass,
      eventOccurrences: this.eventOccurrences,
      decisionOccurrences: this.decisionOccurrences,
      locKeyDefinitions: this.locKeyDefinitions,
      duplicates: this.duplicates,
      countryFlagsSet: this.flags.country,
      globalFlagsSet: this.flags.global,
      maxProvinces: this.defaultMap.maxProvinces,
      seaProvinces: this.defaultMap.seaProvinces,
      stateOfProvince: this.stateOfProvince,
      techFolders: this.techFolders,
      researchBonusKeys: new Set(this.techFolders.map(researchBonusKey)),
      minBuildKeys: this.minBuildKeys(),
    };
  }

  /**
   * `min_build_<building>` for every building the mod declares. `factory` is a
   * synthetic entry of the building set (see `indexCommon`), not a block in
   * common/buildings.txt, so it grants no key.
   */
  private minBuildKeys(): ReadonlySet<string> {
    const buildings = this.identifiers.get('building') ?? new Set<string>();
    return new Set([...buildings].filter((name) => name !== 'factory').map(minBuildKey));
  }

  private put(category: IdentifierCategory, occurrences: readonly IdentifierOccurrence[], options: PutOptions = {}): void {
    this.identifiers.set(
      category,
      new Set([...occurrences.map((occurrence) => occurrence.name), ...(options.specials ?? [])]),
    );
    if (options.checkDuplicates === true) {
      collectDuplicates(category, occurrences, this.duplicates);
    }
  }

  private putNames(category: IdentifierCategory, names: readonly string[]): void {
    this.identifiers.set(category, new Set(names));
  }

  private topLevel(filePath: string): IdentifierOccurrence[] {
    return topLevelOccurrences(this.provider, filePath);
  }

  private indexCommonData(): void {
    const provider = this.provider;
    // Specials: THIS/FROM back-references (a scope's own culture/religion, as in
    // `religion = THIS` inside a pop weight), `owner` as a tag value, the
    // cultural `union`/`this_union` keywords, and `factory` meaning "any factory".
    this.put('country', countryTagOccurrences(provider), {
      specials: ['this', 'from', 'owner', 'this_union'],
      checkDuplicates: true,
    });
    const cultures = groupThenItemOccurrences(provider, 'common/cultures.txt');
    this.put('culture', cultures.items, { specials: ['this', 'from', 'union'], checkDuplicates: true });
    this.put('cultureGroup', cultures.groups, { checkDuplicates: true });
    this.put('religion', groupThenItemOccurrences(provider, 'common/religion.txt').items, {
      specials: ['this', 'from'],
      checkDuplicates: true,
    });
    this.put('good', groupThenItemOccurrences(provider, 'common/goods.txt').items, { checkDuplicates: true });
    this.put('ideology', groupThenItemOccurrences(provider, 'common/ideologies.txt').items, { checkDuplicates: true });
    this.put('trait', groupThenItemOccurrences(provider, 'common/traits.txt').items);
    this.put('government', this.topLevel('common/governments.txt'), { checkDuplicates: true });
    this.put('building', this.topLevel('common/buildings.txt'), { specials: ['factory'], checkDuplicates: true });
    this.put('nationalValue', this.topLevel('common/nationalvalues.txt'), { checkDuplicates: true });
    // peace_order is the treaty ordering list, not a CB definition.
    this.put(
      'cbType',
      this.topLevel('common/cb_types.txt').filter((occurrence) => occurrence.name !== 'peace_order'),
      { checkDuplicates: true },
    );
    this.put('crime', this.topLevel('common/crime.txt'), { checkDuplicates: true });
    this.put('rebelType', this.topLevel('common/rebel_types.txt'), { checkDuplicates: true });
    this.putNames('graphicalCulture', topLevelScalarNames(provider, 'common/graphicalculturetype.txt'));
    this.put(
      'modifier',
      [
        ...this.topLevel('common/event_modifiers.txt'),
        ...this.topLevel('common/triggered_modifiers.txt'),
        ...this.topLevel('common/static_modifiers.txt'),
        ...techSchoolOccurrences(provider),
      ],
      { checkDuplicates: true },
    );
  }

  private indexIssuesAndPopTypes(): void {
    this.issues = indexIssues(this.provider);
    this.put('reformClass', this.issues.classes, { checkDuplicates: true });
    this.put('reformOption', this.issues.reformOptions);
    // Reform positions behave as issues too (pop support, dominant_issue, ...).
    this.put('issue', [...this.issues.partyIssues, ...this.issues.reformOptions]);
    this.putNames(
      'popType',
      this.provider.listFiles('poptypes', '.txt').map((name) => name.replace(/\.txt$/i, '').toLowerCase()),
    );
  }

  private indexMap(): void {
    this.put('province', provinceOccurrences(this.provider), { checkDuplicates: true });
    // A name may legally appear in both region.txt and super_region.txt (the
    // engine keeps the last), so duplicates are only checked within one file.
    const regionFiles = MAP_REGION_FILES.map((filePath) => this.topLevel(filePath));
    this.put('stateRegion', regionFiles.flat());
    for (const occurrences of regionFiles) {
      collectDuplicates('stateRegion', occurrences, this.duplicates);
    }
    this.put('continent', this.topLevel('map/continent.txt'));
    this.put('terrain', terrainOccurrences(this.provider));
    this.defaultMap = readDefaultMap(this.provider);
    this.stateOfProvince = assignProvincesToStates(this.provider);
  }

  private indexTechnology(): void {
    this.techFolders = techFolderNames(this.provider);
    this.put('technology', folderOccurrences(this.provider, 'technologies'), { checkDuplicates: true });
    this.put('invention', folderOccurrences(this.provider, 'inventions'), { checkDuplicates: true });
    this.put('unit', folderOccurrences(this.provider, 'units'), { checkDuplicates: true });
  }

  private indexLocalisationAndPictures(): void {
    this.locKeyDefinitions = localisationDefinitions(this.provider);
    this.putNames('locKey', [...this.locKeyDefinitions.keys()]);
    this.putNames('eventPicture', pictureNames(this.provider, 'gfx/pictures/events'));
    this.putNames('decisionPicture', pictureNames(this.provider, 'gfx/pictures/decisions'));
  }

  private indexEvents(): void {
    indexEventLike(this.provider, 'events', (document, filePath) => {
      recordEventIds(document, filePath, this.eventOccurrences);
      collectSetFlags(document.entries, this.flags);
    });
    this.putNames('event', [...this.eventOccurrences.keys()]);
  }

  private indexDecisions(): void {
    indexEventLike(this.provider, 'decisions', (document, filePath) => {
      recordDecisionNames(document, filePath, this.decisionOccurrences);
      collectSetFlags(document.entries, this.flags);
    });
  }

  private indexOtherFlagSources(): void {
    for (const flagSource of ['common/cb_types.txt', 'common/rebel_types.txt', 'common/issues.txt']) {
      const flagDocument = parseRelative(this.provider, flagSource);
      if (flagDocument) {
        collectSetFlags(flagDocument.entries, this.flags);
      }
    }
    collectFlagsFromFolder(this.provider, 'history/countries', this.flags);
  }
}
