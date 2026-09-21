import { CB_BODY_FIELDS } from '../data/cbTypeStructure.js';
import {
  BOOKMARK_FIELDS,
  BUILDING_FIELDS,
  CULTURE_FIELDS,
  CULTURE_GROUP_FIELDS,
  FOCUS_FIELDS,
  GOOD_FIELDS,
  GOVERNMENT_FIELDS,
  IDEOLOGY_FIELDS,
  ISSUE_OPTION_FIELDS,
  ON_ACTION_KEYS,
  PARTY_FIELDS,
  PRODUCTION_EMPLOYEE_FIELDS,
  PRODUCTION_TYPE_FIELDS,
  RELIGION_FIELDS,
  TRAIT_FIELDS,
} from '../data/commonStructure.js';
import { EFFECTS } from '../data/effects.js';
import {
  DECISION_BODY_FIELDS,
  EVENT_BODY_FIELDS,
  EVENT_LOC_FIELDS,
  LOGICAL_OPERATORS,
  WEIGHT_BLOCK_DURATION_FIELDS,
} from '../data/eventStructure.js';
import {
  COUNTRY_HISTORY_FIELDS,
  POP_HISTORY_FIELDS,
  PROVINCE_HISTORY_FIELDS,
} from '../data/historyStructure.js';
import { POPTYPE_SCALAR_FIELDS } from '../data/popTypeStructure.js';
import { REBEL_BODY_FIELDS } from '../data/rebelTypeStructure.js';
import { EFFECT_PASSTHROUGH_KEYS, KEYWORD_DOCS, SCOPE_CHANGERS } from '../data/scopes.js';
import { INVENTION_EFFECT_SCALAR_FIELDS, TECH_SCALAR_FIELDS } from '../data/technologyStructure.js';
import { TRIGGERS } from '../data/triggers.js';
import type { FileType } from '../model/fileType.js';
import type { ModIndex } from '../model/modIndex.js';
import type { Range } from '../model/range.js';
import {
  CATEGORY_LABELS,
  type ArgKind,
  type BlockArgSpec,
  type FieldTable,
  type IdentifierCategory,
  type ScopeType,
  type SymbolDef,
  type UsageContext,
} from '../model/symbols.js';
import type { AnalyzedDocument } from './documentAnalysis.js';
import { completionContextAt, type CompletionContext } from './completionContext.js';
import { openerKeysOf, placeOf, rootKeysOf, type ScriptUsage } from './completionScope.js';
import { namesOf } from './modIndex.js';
import { symbolHoverMarkdown } from './symbolHover.js';
import { scopeAllowed } from './validationWalker.js';

export type CompletionKind = 'value' | 'trigger' | 'effect' | 'scope' | 'field';

export interface CompletionEntry {
  readonly label: string;
  readonly kind: CompletionKind;
  readonly detail: string;
  readonly documentation: string | undefined;
  readonly insertText: string;
  /** `insertText` carries snippet placeholders. */
  readonly snippet: boolean;
}

export interface CompletionResult {
  readonly entries: readonly CompletionEntry[];
  /** The list was cut down to what is typed; ask again on the next keystroke. */
  readonly incomplete: boolean;
  /** The word the items replace. */
  readonly range: Range;
}

interface Draft {
  readonly entries: readonly CompletionEntry[];
  readonly incomplete: boolean;
}

/**
 * Above this many names a category waits for something to be typed. It sits
 * above every category a modder names by hand (a big mod has ~1,100 modifiers)
 * and below the machine-sized ones: province ids, event ids, localisation keys.
 */
const LARGE_CATEGORY_SIZE = 2000;
const REQUIRED_PREFIX = 2;
const LARGE_CATEGORY_LIMIT = 300;

/**
 * What the cursor can be completed with: the values an argument accepts, or the
 * keys valid where it sits. Both come from the datasets the validator uses, so
 * what is offered is what would pass validation. Nothing is offered where the
 * position cannot be named — a wrong list is the problem being solved.
 */
export function completionsAt(
  document: AnalyzedDocument,
  offset: number,
  fileType: FileType,
  index: ModIndex,
): CompletionResult | undefined {
  const context = completionContextAt(document, offset);
  if (!context) {
    return undefined;
  }
  const draft = context.position === 'value'
    ? valueDraft(context, fileType, index)
    : keyDraft(context, fileType, index);
  return { entries: draft.entries, incomplete: draft.incomplete, range: context.range };
}

// --- Values ------------------------------------------------------------------------

function valueDraft(context: CompletionContext, fileType: FileType, index: ModIndex): Draft {
  const key = lastOf(context.path);
  const reformOptions = index.optionPoolByClass.get(key);
  if (reformOptions) {
    return plain([...reformOptions].map((name) => valueEntry(name, CATEGORY_LABELS.reformOption)));
  }
  return itemsFor(acceptsFor(context.path, fileType, key), key, context.prefix, index);
}

/**
 * The file's own table outranks the symbol tables: `primary_culture` in
 * `history/countries` is that file's culture field, not the trigger of the same
 * name, which also accepts a country.
 */
function acceptsFor(path: readonly string[], fileType: FileType, key: string): readonly ArgKind[] {
  const parent = path[path.length - 2];
  const inBlock = parent === undefined ? undefined : blockFieldAccepts(parent.toLowerCase(), key);
  return inBlock ?? FIELD_TABLES[fileType]?.[key] ?? scalarAccepts(key) ?? [];
}

function itemsFor(accepts: readonly ArgKind[], key: string, prefix: string, index: ModIndex): Draft {
  const entries: CompletionEntry[] = [];
  let incomplete = false;
  for (const kind of accepts) {
    const part = itemsOfKind(kind, key, prefix, index);
    entries.push(...part.entries);
    incomplete = incomplete || part.incomplete;
  }
  return { entries: dedupe(entries), incomplete };
}

function itemsOfKind(kind: ArgKind, key: string, prefix: string, index: ModIndex): Draft {
  if (kind === 'yesno') {
    return plain(['yes', 'no'].map((name) => valueEntry(name, 'yes/no')));
  }
  if (kind === 'strata') {
    return plain(['poor', 'middle', 'rich'].map((name) => valueEntry(name, 'strata')));
  }
  if (kind === 'flag') {
    return plain(flagNames(key, index).map((name) => valueEntry(name, 'flag already set')));
  }
  const category = categoryOf(kind);
  return category === undefined ? plain([]) : categoryItems(category, prefix, index);
}

function categoryItems(category: IdentifierCategory, prefix: string, index: ModIndex): Draft {
  const names = displayNames(category, index);
  if (names.length <= LARGE_CATEGORY_SIZE) {
    return plain(names.map((name) => categoryEntry(category, name, index)));
  }
  if (prefix.length < REQUIRED_PREFIX) {
    return { entries: [], incomplete: true };
  }
  const lower = prefix.toLowerCase();
  const matched = names.filter((name) => name.toLowerCase().startsWith(lower));
  return {
    entries: matched.slice(0, LARGE_CATEGORY_LIMIT).map((name) => categoryEntry(category, name, index)),
    incomplete: true,
  };
}

/** The index folds every name to lowercase; only TAGs are read back as mods write them. */
function displayNames(category: IdentifierCategory, index: ModIndex): readonly string[] {
  if (category === 'locKey') {
    return [...index.locKeyDefinitions.values()].map((definition) => definition.name);
  }
  const names = namesOf(index, category);
  return category === 'country' ? names.map((name) => name.toUpperCase()) : names;
}

/** A localisation key reads better with its text beside it than with its category. */
function categoryEntry(category: IdentifierCategory, name: string, index: ModIndex): CompletionEntry {
  const translation = category === 'locKey'
    ? index.locKeyDefinitions.get(name.toLowerCase())?.text
    : undefined;
  const detail = translation === undefined || translation === '' ? CATEGORY_LABELS[category] : translation;
  return valueEntry(name, detail);
}

function flagNames(key: string, index: ModIndex): readonly string[] {
  return [...(key.includes('global') ? index.globalFlagsSet : index.countryFlagsSet)];
}

function valueEntry(label: string, detail: string): CompletionEntry {
  return { label, kind: 'value', detail, documentation: undefined, insertText: label, snippet: false };
}

// --- Keys --------------------------------------------------------------------------

function keyDraft(context: CompletionContext, fileType: FileType, index: ModIndex): Draft {
  // Only inside script: `country_event` names an event definition at the top of
  // an events file and the effect that fires one everywhere else.
  if (placeOf(context.path.slice(0, -1), fileType, index).kind === 'script') {
    const fields = blockFieldEntries(lastOf(context.path), index);
    if (fields.length > 0) {
      return plain(fields);
    }
  }
  const place = placeOf(context.path, fileType, index);
  if (place.kind === 'script') {
    return plain(scriptEntries(place.usage, place.scope, index));
  }
  return plain(place.kind === 'structural' ? structuralEntries(context.path, fileType) : []);
}

function blockFieldEntries(parent: string, index: ModIndex): readonly CompletionEntry[] {
  const entries: CompletionEntry[] = [];
  for (const spec of blockSpecsOf(parent)) {
    for (const [name, field] of Object.entries(spec.fields)) {
      entries.push(fieldEntry(name, field.required ? 'required field' : 'field'));
    }
    if (spec.reformClassKeys === true) {
      entries.push(...namesOf(index, 'reformClass').map((name) => fieldEntry(name, CATEGORY_LABELS.reformClass)));
    }
  }
  return dedupe(entries);
}

function scriptEntries(
  usage: ScriptUsage,
  scope: ScopeType,
  index: ModIndex,
): readonly CompletionEntry[] {
  if (usage === 'weight') {
    return weightEntries();
  }
  const symbols = Object.entries(usage === 'trigger' ? TRIGGERS : EFFECTS)
    .filter(([, definition]) => scopeAllowed(definition.scopes, scope))
    .map(([name, definition]) => symbolEntry(name, usage, definition));
  const changers = Object.entries(SCOPE_CHANGERS)
    .filter(([, changer]) => fitsUsage(changer.contexts, usage) && scopeAllowed(changer.from, scope))
    .map(([name]) => blockKeyEntry(name, 'scope', 'scope'));
  const pops = namesOf(index, 'popType').map((name) => blockKeyEntry(name, 'scope', 'pops in scope'));
  return dedupe([...symbols, ...changers, ...pops, ...controlEntries(usage)]);
}

function fitsUsage(contexts: UsageContext | 'both', usage: UsageContext): boolean {
  return contexts === 'both' || contexts === usage;
}

function controlEntries(usage: UsageContext): readonly CompletionEntry[] {
  const names = usage === 'trigger'
    ? [...LOGICAL_OPERATORS]
    : ['limit', 'random', 'random_list', ...EFFECT_PASSTHROUGH_KEYS];
  return names.map((name) => blockKeyEntry(name, 'field', 'control'));
}

function weightEntries(): readonly CompletionEntry[] {
  return [
    ...[...WEIGHT_BLOCK_DURATION_FIELDS].map((name) => fieldEntry(name, 'weight field')),
    blockKeyEntry('modifier', 'field', 'conditional multiplier'),
  ];
}

/** Fields of the file's own grammar, for the levels that hold no script. */
function structuralEntries(path: readonly string[], fileType: FileType): readonly CompletionEntry[] {
  const rootKeys = rootKeysOf(fileType);
  if (path.length === 0 && rootKeys.length > 0) {
    return rootKeys.map((name) => blockKeyEntry(name, 'field', 'definition'));
  }
  const fields = [
    ...Object.keys(FIELD_TABLES[fileType] ?? {}),
    ...(BODY_FIELDS[fileType] ?? []),
  ].map((name) => fieldEntry(name, 'field'));
  const openers = openerKeysOf(fileType).map((name) => blockKeyEntry(name, 'field', 'block'));
  return dedupe([...fields, ...openers]);
}

function symbolEntry(name: string, usage: UsageContext, definition: SymbolDef): CompletionEntry {
  const block = definition.arg.kind === 'block';
  return {
    label: name,
    kind: usage,
    detail: usage,
    documentation: symbolHoverMarkdown(name),
    insertText: block ? blockSnippet(name) : `${name} = `,
    snippet: block,
  };
}

function blockKeyEntry(name: string, kind: CompletionKind, detail: string): CompletionEntry {
  return {
    label: name,
    kind,
    detail,
    documentation: symbolHoverMarkdown(name) ?? KEYWORD_DOCS[name],
    insertText: blockSnippet(name),
    snippet: true,
  };
}

function fieldEntry(name: string, detail: string): CompletionEntry {
  return {
    label: name,
    kind: 'field',
    detail,
    documentation: KEYWORD_DOCS[name],
    insertText: `${name} = `,
    snippet: false,
  };
}

function blockSnippet(name: string): string {
  return `${name} = {\n\t$0\n}`;
}

// --- Dataset lookups ---------------------------------------------------------------

function symbolsNamed(name: string): readonly SymbolDef[] {
  return [EFFECTS[name], TRIGGERS[name]].filter((definition): definition is SymbolDef => definition !== undefined);
}

function blockSpecOf(definition: SymbolDef): BlockArgSpec | undefined {
  if (definition.arg.kind === 'block') {
    return definition.arg;
  }
  return definition.arg.kind === 'either' ? definition.arg.block : undefined;
}

function blockSpecsOf(name: string): readonly BlockArgSpec[] {
  return symbolsNamed(name)
    .map(blockSpecOf)
    .filter((spec): spec is BlockArgSpec => spec !== undefined);
}

function blockFieldAccepts(parent: string, key: string): readonly ArgKind[] | undefined {
  for (const spec of blockSpecsOf(parent)) {
    const field = spec.fields[key];
    if (field) {
      return field.accepts;
    }
  }
  return undefined;
}

function scalarAccepts(name: string): readonly ArgKind[] | undefined {
  for (const definition of symbolsNamed(name)) {
    if (definition.arg.kind === 'scalar') {
      return definition.arg.accepts;
    }
    if (definition.arg.kind === 'either') {
      return definition.arg.scalar.accepts;
    }
  }
  return undefined;
}

const CATEGORY_NAMES: ReadonlySet<string> = new Set(Object.keys(CATEGORY_LABELS));

function categoryOf(kind: ArgKind): IdentifierCategory | undefined {
  return CATEGORY_NAMES.has(kind) ? (kind as IdentifierCategory) : undefined;
}

/** Event and decision loc fields, from the set the validator already checks. */
const LOC_VALUE_FIELDS: FieldTable = Object.fromEntries(
  [...EVENT_LOC_FIELDS, 'name'].map((name) => [name, ['locKey']]),
);

/** `field -> accepted kinds` per file type; the keys double as that file's field names. */
const FIELD_TABLES: Readonly<Partial<Record<FileType, FieldTable>>> = {
  event: { ...LOC_VALUE_FIELDS, picture: ['eventPicture'], id: ['number'] },
  decision: { ...LOC_VALUE_FIELDS, picture: ['decisionPicture'] },
  historyCountry: COUNTRY_HISTORY_FIELDS,
  historyProvince: PROVINCE_HISTORY_FIELDS,
  historyPops: POP_HISTORY_FIELDS,
  cultures: { ...CULTURE_GROUP_FIELDS, ...CULTURE_FIELDS },
  religions: RELIGION_FIELDS,
  goods: GOOD_FIELDS,
  ideologies: IDEOLOGY_FIELDS,
  governments: GOVERNMENT_FIELDS,
  buildings: BUILDING_FIELDS,
  productionTypes: { ...PRODUCTION_TYPE_FIELDS, ...PRODUCTION_EMPLOYEE_FIELDS },
  bookmarks: BOOKMARK_FIELDS,
  popType: POPTYPE_SCALAR_FIELDS,
  technology: TECH_SCALAR_FIELDS,
  invention: INVENTION_EFFECT_SCALAR_FIELDS,
  issues: ISSUE_OPTION_FIELDS,
  countryDefinition: PARTY_FIELDS,
  nationalFocus: FOCUS_FIELDS,
};

/** Field names with no value list of their own. */
const BODY_FIELDS: Readonly<Partial<Record<FileType, ReadonlySet<string>>>> = {
  event: EVENT_BODY_FIELDS,
  decision: DECISION_BODY_FIELDS,
  cbType: CB_BODY_FIELDS,
  rebelType: REBEL_BODY_FIELDS,
  traits: TRAIT_FIELDS,
  onActions: ON_ACTION_KEYS,
};

// --- Small helpers -----------------------------------------------------------------

function plain(entries: readonly CompletionEntry[]): Draft {
  return { entries, incomplete: false };
}

function lastOf(path: readonly string[]): string {
  return (path[path.length - 1] ?? '').toLowerCase();
}

function dedupe(entries: readonly CompletionEntry[]): readonly CompletionEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.label)) {
      return false;
    }
    seen.add(entry.label);
    return true;
  });
}
