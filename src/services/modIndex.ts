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
import type { Range } from '../model/range.js';
import type { IdentifierCategory } from '../model/symbols.js';
import { csvRows } from '../parser/csv.js';
import { runToEnd, YieldBudget, yieldToEventLoop, type WorkUnits } from './scheduling.js';
import { seaStartsOf } from './mapDefaultEdit.js';
import { parseDocument } from './syntaxValidation.js';

/** File access needed to build the index; injected so the service stays testable. */
export interface ModFileProvider {
  readFile(relativePath: string): string | undefined;
  listFiles(relativeDirectory: string, extension: string): string[];
  /** Every file under a folder and its subfolders, as forward-slash paths from the mod root. */
  listFilesRecursive(relativeFolder: string): string[];
}

/**
 * The states of the world, and the only file that holds them. `map/default.map`
 * names `region_sea` as well, but vanilla ships it as three empty blocks and it
 * describes naval zones rather than states; `super_region.txt` is a mod's own
 * bookkeeping that no `default.map` names, so the engine never reads it. A
 * province's state comes from this file or from nowhere.
 */
const STATE_REGION_FILE = 'map/region.txt';
const CONTINENT_FILE = 'map/continent.txt';

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

/** Buildings whose block says `type = factory`; a state builds those, a province the rest. */
function factoryBuildingNames(provider: ModFileProvider): Set<string> {
  const document = parseRelative(provider, 'common/buildings.txt');
  const names = new Set<string>();
  for (const assignment of document ? blockKeysOf(document) : []) {
    const block = asBlock(assignment.value);
    if (block && scalarValueOf(block.entries, 'type')?.toLowerCase() === 'factory') {
      names.add(assignment.key.value.toLowerCase());
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
  if (!document) {
    return { maxProvinces: undefined, seaProvinces: new Set() };
  }
  const seaProvinces = seaStartsOf(document);
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
  const document = parseRelative(provider, STATE_REGION_FILE);
  for (const state of document ? blockKeysOf(document) : []) {
    const block = asBlock(state.value);
    const unassigned = block ? provinceIdsOf(block).filter((id) => !owner.has(id)) : [];
    for (const id of unassigned) {
      owner.set(id, state.key.value.toLowerCase());
    }
  }
  return owner;
}

/**
 * Province id → its climate. A climate names two blocks — its modifiers and its
 * provinces — and only the second one is a membership; the last block to list a
 * province is the one the engine keeps.
 */
function assignProvincesToClimates(provider: ModFileProvider): Map<string, string> {
  const owner = new Map<string, string>();
  const document = parseRelative(provider, 'map/climate.txt');
  for (const climate of document ? blockKeysOf(document) : []) {
    const block = asBlock(climate.value);
    for (const id of block ? provinceIdsOf(block) : []) {
      owner.set(id, climate.key.value.toLowerCase());
    }
  }
  return owner;
}

/**
 * Province id → its continent. The ids sit under `provinces = { }`, which is how
 * the file is written, but a bare id in the continent block counts too. The last
 * continent to list a province is the one the engine keeps.
 */
function assignProvincesToContinents(provider: ModFileProvider): Map<string, string> {
  const owner = new Map<string, string>();
  const document = parseRelative(provider, CONTINENT_FILE);
  for (const continent of document ? blockKeysOf(document) : []) {
    const block = asBlock(continent.value);
    for (const id of block ? nestedProvinceIdsOf(block) : []) {
      owner.set(id, continent.key.value.toLowerCase());
    }
  }
  return owner;
}

/** `provinceIdsOf`, plus the ids of a `provinces = { }` block inside. */
function nestedProvinceIdsOf(block: Block): string[] {
  const ids = provinceIdsOf(block);
  for (const entry of block.entries) {
    if (entry.kind === 'assignment' && entry.key.value.toLowerCase() === 'provinces') {
      const inner = asBlock(entry.value);
      if (inner) {
        ids.push(...provinceIdsOf(inner));
      }
    }
  }
  return ids;
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

/** A named thing a file declares, and where. */
interface NameAt {
  readonly name: string;
  readonly range: Range;
}

/**
 * Everything one file of a walked folder adds to the index. Keeping this per
 * file is what lets a rebuild skip the files that did not change: the four
 * folders below are pure accumulation, so re-merging a kept contribution gives
 * exactly what re-reading the file would have.
 */
export interface FileContribution {
  readonly eventIds: readonly NameAt[];
  readonly decisionNames: readonly NameAt[];
  readonly countryFlags: readonly string[];
  readonly globalFlags: readonly string[];
  /** In file order; the merge keeps the first definition of a key. */
  readonly locKeys: readonly LocKeyDefinition[];
}

/** The per-file work of a finished build, to hand back to the next one. */
export interface IndexCarry {
  readonly byFile: ReadonlyMap<string, FileContribution>;
}

/** What a rebuild may reuse: last build's work, minus the files that changed since. */
export interface IndexReuse {
  readonly carry: IndexCarry;
  /** Mod-relative paths whose content differs, compared case-insensitively. */
  readonly changed: ReadonlySet<string>;
}

export interface IndexBuildResult {
  readonly index: ModIndex;
  readonly carry: IndexCarry;
}

const NOTHING: FileContribution = {
  eventIds: [],
  decisionNames: [],
  countryFlags: [],
  globalFlags: [],
  locKeys: [],
};

function flagsOf(entries: readonly Entry[]): Pick<FileContribution, 'countryFlags' | 'globalFlags'> {
  const found: FlagSets = { country: new Set(), global: new Set() };
  collectSetFlags(entries, found);
  return { countryFlags: [...found.country], globalFlags: [...found.global] };
}

function eventContribution(text: string): FileContribution {
  const document = parseDocument(text).document;
  return { ...NOTHING, ...flagsOf(document.entries), eventIds: eventIdsOf(document) };
}

function decisionContribution(text: string): FileContribution {
  const document = parseDocument(text).document;
  return { ...NOTHING, ...flagsOf(document.entries), decisionNames: decisionNamesOf(document) };
}

function flagContribution(text: string): FileContribution {
  return { ...NOTHING, ...flagsOf(parseDocument(text).document.entries) };
}

function eventIdsOf(document: Document): NameAt[] {
  const found: NameAt[] = [];
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
    found.push({ name: idAssignment.value.value, range: idAssignment.value.range });
  }
  return found;
}

function decisionNamesOf(document: Document): NameAt[] {
  const found: NameAt[] = [];
  for (const wrapper of blockKeysOf(document)) {
    if (wrapper.key.value.toLowerCase() !== 'political_decisions') {
      continue;
    }
    const wrapperBlock = asBlock(wrapper.value);
    if (!wrapperBlock) {
      continue;
    }
    for (const decision of blockKeysOf(wrapperBlock)) {
      found.push({ name: decision.key.value.toLowerCase(), range: decision.key.range });
    }
  }
  return found;
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

/** The loc keys a CSV declares, in file order. */
function locContribution(text: string, filePath: string): FileContribution {
  const locKeys: LocKeyDefinition[] = [];
  for (const row of csvRows(text, { maxFields: 2 })) {
    const key = row.fields[0]?.text ?? '';
    if (key !== '') {
      locKeys.push({ name: key, filePath, line: row.line, length: key.length, text: row.fields[1]?.text ?? '' });
    }
  }
  return { ...NOTHING, locKeys };
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
  const build = new IndexBuild(provider, undefined);
  for (const step of build.steps) {
    runToEnd(step());
  }
  return build.finish().index;
}

/**
 * The same build, interleaved: the event loop gets a turn between steps and
 * again whenever a step has worked through its share of source, so a language
 * server keeps answering requests while a large mod is indexed.
 *
 * With `reuse`, the files a folder walk would have read are taken from the last
 * build instead, except the ones named as changed. Editing one event file then
 * costs that file rather than the folder.
 */
export async function buildModIndexAsync(
  provider: ModFileProvider,
  reuse?: IndexReuse,
): Promise<IndexBuildResult> {
  const build = new IndexBuild(provider, reuse);
  const budget = new YieldBudget();
  for (const step of build.steps) {
    await budget.run(step());
    await yieldToEventLoop();
  }
  return build.finish();
}

/** Append one declaration site to the occurrence list of its name. */
function occurrenceAt(occurrences: Map<string, EventOccurrence[]>, found: NameAt, filePath: string): void {
  const list = occurrences.get(found.name) ?? [];
  list.push({ filePath, range: found.range });
  occurrences.set(found.name, list);
}

/** A step with nothing to interrupt inside it: it reports no interruptible work. */
function* whole(work: () => void): WorkUnits {
  work();
  yield 0;
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
  private readonly locKeyDefinitions = new Map<string, LocKeyDefinition>();
  private issues: IssueIndex = emptyIssueIndex();
  private defaultMap: DefaultMapData = { maxProvinces: undefined, seaProvinces: new Set() };
  private stateOfProvince = new Map<string, string>();
  private climateOfProvince = new Map<string, string>();
  private continentOfProvince = new Map<string, string>();
  private techFolders: string[] = [];
  /** The per-file work of this build, kept for the next one. */
  private readonly byFile = new Map<string, FileContribution>();

  /**
   * The build, in order. The first four read a fixed handful of files and run
   * whole; the rest walk a folder and report each file, so a mod with hundreds
   * of them does not hold the event loop for the length of the folder.
   */
  readonly steps: readonly (() => WorkUnits)[] = [
    (): WorkUnits => whole(() => { this.indexCommonData(); }),
    (): WorkUnits => whole(() => { this.indexIssuesAndPopTypes(); }),
    (): WorkUnits => whole(() => { this.indexMap(); }),
    (): WorkUnits => whole(() => { this.indexTechnology(); }),
    (): WorkUnits => this.indexLocalisationAndPictures(),
    (): WorkUnits => this.indexEvents(),
    (): WorkUnits => this.indexDecisions(),
    (): WorkUnits => this.indexOtherFlagSources(),
  ];

  private readonly changed: ReadonlySet<string> | undefined;

  constructor(
    private readonly provider: ModFileProvider,
    private readonly reuse: IndexReuse | undefined,
  ) {
    this.changed = reuse === undefined ? undefined : new Set([...reuse.changed].map((p) => p.toLowerCase()));
  }

  /**
   * Walk a folder, merging each file's contribution. A file the last build
   * already read, and that has not changed since, is merged from the carry
   * without being read or parsed again.
   */
  private *walk(
    folder: string,
    extension: string,
    compute: (text: string, filePath: string) => FileContribution,
  ): WorkUnits {
    for (const fileName of this.provider.listFiles(folder, extension)) {
      const filePath = `${folder}/${fileName}`;
      const kept = this.changed?.has(filePath.toLowerCase()) === false ? this.reuse?.carry.byFile.get(filePath) : undefined;
      if (kept) {
        this.merge(filePath, kept);
        continue;
      }
      const text = this.provider.readFile(filePath);
      if (text === undefined) {
        continue;
      }
      this.merge(filePath, compute(text, filePath));
      yield text.length;
    }
  }

  private merge(filePath: string, contribution: FileContribution): void {
    this.byFile.set(filePath, contribution);
    for (const event of contribution.eventIds) {
      occurrenceAt(this.eventOccurrences, event, filePath);
    }
    for (const decision of contribution.decisionNames) {
      occurrenceAt(this.decisionOccurrences, decision, filePath);
    }
    for (const flag of contribution.countryFlags) {
      this.flags.country.add(flag);
    }
    for (const flag of contribution.globalFlags) {
      this.flags.global.add(flag);
    }
    for (const definition of contribution.locKeys) {
      const keyLower = definition.name.toLowerCase();
      if (!this.locKeyDefinitions.has(keyLower)) {
        this.locKeyDefinitions.set(keyLower, definition);
      }
    }
  }

  finish(): IndexBuildResult {
    return { index: this.builtIndex(), carry: { byFile: this.byFile } };
  }

  private builtIndex(): ModIndex {
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
      climateOfProvince: this.climateOfProvince,
      continentOfProvince: this.continentOfProvince,
      techFolders: this.techFolders,
      researchBonusKeys: new Set(this.techFolders.map(researchBonusKey)),
      minBuildKeys: this.minBuildKeys(),
      factoryBuildings: factoryBuildingNames(this.provider),
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
    this.put('stateRegion', this.topLevel(STATE_REGION_FILE), { checkDuplicates: true });
    this.put('continent', this.topLevel(CONTINENT_FILE));
    this.put('terrain', terrainOccurrences(this.provider));
    this.defaultMap = readDefaultMap(this.provider);
    this.stateOfProvince = assignProvincesToStates(this.provider);
    this.climateOfProvince = assignProvincesToClimates(this.provider);
    this.continentOfProvince = assignProvincesToContinents(this.provider);
  }

  private indexTechnology(): void {
    this.techFolders = techFolderNames(this.provider);
    this.put('technology', folderOccurrences(this.provider, 'technologies'), { checkDuplicates: true });
    this.put('invention', folderOccurrences(this.provider, 'inventions'), { checkDuplicates: true });
    this.put('unit', folderOccurrences(this.provider, 'units'), { checkDuplicates: true });
  }

  private *indexLocalisationAndPictures(): WorkUnits {
    yield* this.walk('localisation', '.csv', locContribution);
    this.putNames('locKey', [...this.locKeyDefinitions.keys()]);
    this.putNames('eventPicture', pictureNames(this.provider, 'gfx/pictures/events'));
    this.putNames('decisionPicture', pictureNames(this.provider, 'gfx/pictures/decisions'));
  }

  private *indexEvents(): WorkUnits {
    yield* this.walk('events', '.txt', eventContribution);
    this.putNames('event', [...this.eventOccurrences.keys()]);
  }

  private *indexDecisions(): WorkUnits {
    yield* this.walk('decisions', '.txt', decisionContribution);
  }

  private *indexOtherFlagSources(): WorkUnits {
    for (const flagSource of ['common/cb_types.txt', 'common/rebel_types.txt', 'common/issues.txt']) {
      const flagDocument = parseRelative(this.provider, flagSource);
      if (flagDocument) {
        collectSetFlags(flagDocument.entries, this.flags);
      }
    }
    yield* this.walk('history/countries', '.txt', flagContribution);
  }
}
