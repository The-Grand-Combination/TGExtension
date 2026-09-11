import { LOGICAL_OPERATORS, WEIGHT_BLOCK_DURATION_FIELDS } from '../data/eventStructure.js';
import { BROKEN_EFFECTS, EFFECTS } from '../data/effects.js';
import { MODIFIER_KEYS } from '../data/modifierKeys.js';
import { EFFECT_PASSTHROUGH_KEYS, IMPLICIT_SCOPES, SCOPE_CHANGERS } from '../data/scopes.js';
import { TRIGGERS } from '../data/triggers.js';
import type { Assignment, Block, Entry } from '../model/ast.js';
import { asBlock, firstByKey } from '../model/astQuery.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import {
  CATEGORY_LABELS,
  type ArgKind,
  type ArgSpec,
  type BlockArgSpec,
  type FieldTable,
  type IdentifierCategory,
  type ScalarArgSpec,
  type ScopeChangerDef,
  type ScopeRequirement,
  type ScopeType,
  type SymbolDef,
  type UsageContext,
} from '../model/symbols.js';
import type { FlagSets, ModIndex } from '../model/modIndex.js';
import type { ValidationOptions } from '../model/validationOptions.js';
import { hasIdentifier, namesOf } from './modIndex.js';
import { didYouMean } from './suggestions.js';

/** Shared state threaded through one file's semantic validation. */
export interface Walk {
  readonly index: ModIndex;
  readonly diagnostics: Diagnostic[];
  readonly localEventIdCounts: ReadonlyMap<string, number>;
  readonly localFlags: FlagSets;
  readonly currentFile: string | undefined;
  readonly options: ValidationOptions;
}

const STRATA_VALUES: ReadonlySet<string> = new Set(['poor', 'middle', 'rich']);

/** yyyy.m.d game dates (also used for dated history blocks). */
export const DATE_PATTERN = /^\d{1,4}\.\d{1,2}\.\d{1,2}$/;

// --- Trigger walking ---------------------------------------------------------

export function walkTriggerEntries(walk: Walk, entries: readonly Entry[], scope: ScopeType): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      handleTriggerAssignment(walk, entry, scope);
    } else {
      reportStrayEntry(walk, entry);
    }
  }
}

/** Visit every `key = value` of `entries`; bare values and blocks are reported as strays. */
export function eachAssignment(walk: Walk, entries: readonly Entry[], visit: (entry: Assignment) => void): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      visit(entry);
    } else {
      reportStrayEntry(walk, entry);
    }
  }
}

/** Report a bare value/block in a position that only allows `key = value`. */
export function reportStrayEntry(walk: Walk, entry: Entry): void {
  if (entry.kind === 'scalar') {
    walk.diagnostics.push(
      diagnostic('error', 'stray-value', `Stray value '${entry.value}' — expected 'key = value'.`, entry.range),
    );
  } else if (entry.kind === 'block') {
    walk.diagnostics.push(
      diagnostic('error', 'stray-block', "Stray block — expected 'key = { ... }'.", entry.range),
    );
  }
}

function handleTriggerAssignment(walk: Walk, assignment: Assignment, scope: ScopeType): void {
  const keyLower = assignment.key.value.toLowerCase();

  if (LOGICAL_OPERATORS.has(keyLower)) {
    walkBlockValue(walk, assignment, (block) => { walkTriggerEntries(walk, block.entries, scope); });
    return;
  }
  if (keyLower === 'has_country_flag' || keyLower === 'has_global_flag') {
    checkFlagIsSet(walk, assignment, keyLower === 'has_country_flag' ? 'country' : 'global');
  }
  if (enterScopeChanger(walk, assignment, keyLower, scope, 'trigger', walkTriggerEntries)) {
    return;
  }
  const definition = TRIGGERS[keyLower];
  if (definition) {
    checkSymbol(walk, assignment, definition, scope);
    return;
  }
  if (handleDynamicTriggerKey(walk, assignment, keyLower)) {
    return;
  }
  report(
    walk,
    assignment,
    'unknown-trigger',
    `Unknown trigger '${assignment.key.value}'.${didYouMean(keyLower, triggerCandidates(walk))}`,
  );
}

const NUMERIC_TRIGGER_KEY_CATEGORIES: readonly IdentifierCategory[] = [
  'ideology',
  'issue',
  'technology',
  'invention',
  'good',
];

function handleDynamicTriggerKey(walk: Walk, assignment: Assignment, keyLower: string): boolean {
  if (NUMERIC_TRIGGER_KEY_CATEGORIES.some((category) => hasIdentifier(walk.index, category, keyLower))) {
    requireNumericValue(walk, assignment);
    return true;
  }
  if (hasIdentifier(walk.index, 'reformClass', keyLower)) {
    checkReformOption(walk, assignment, keyLower);
    return true;
  }
  if (hasIdentifier(walk.index, 'popType', keyLower)) {
    // `farmers = 0.5` tests the pop share; `farmers = { ... }` scopes into those pops.
    if (assignment.value.kind === 'block') {
      walkTriggerEntries(walk, assignment.value.entries, 'pop');
    } else {
      requireNumericValue(walk, assignment);
    }
    return true;
  }
  return enterDynamicScope(walk, assignment, keyLower, walkTriggerEntries);
}

// --- Effect walking ----------------------------------------------------------

export function walkEffectEntries(walk: Walk, entries: readonly Entry[], scope: ScopeType): void {
  for (const entry of entries) {
    if (entry.kind === 'assignment') {
      handleEffectAssignment(walk, entry, scope);
    } else {
      reportStrayEntry(walk, entry);
    }
  }
}

function handleEffectAssignment(walk: Walk, assignment: Assignment, scope: ScopeType): void {
  const keyLower = assignment.key.value.toLowerCase();

  if (reportBrokenEffect(walk, assignment, keyLower)) {
    return;
  }
  if (keyLower === 'limit') {
    walkBlockValue(walk, assignment, (block) => { walkTriggerEntries(walk, block.entries, scope); });
    return;
  }
  if (keyLower === 'random') {
    walkBlockValue(walk, assignment, (block) => { walkRandomBlock(walk, block, scope); });
    return;
  }
  if (keyLower === 'random_list') {
    walkBlockValue(walk, assignment, (block) => { walkRandomList(walk, block, scope); });
    return;
  }
  if (EFFECT_PASSTHROUGH_KEYS.has(keyLower)) {
    walkBlockValue(walk, assignment, (block) => { walkEffectEntries(walk, block.entries, scope); });
    return;
  }
  if (enterScopeChanger(walk, assignment, keyLower, scope, 'effect', walkEffectEntries)) {
    return;
  }
  if (keyLower === 'secede_province' && reportUncolonize(walk, assignment)) {
    return;
  }
  const definition = EFFECTS[keyLower];
  if (definition) {
    checkSymbol(walk, assignment, definition, scope);
    return;
  }
  if (handleDynamicEffectKey(walk, assignment, keyLower)) {
    return;
  }
  report(
    walk,
    assignment,
    'unknown-effect',
    `Unknown effect '${assignment.key.value}'.${didYouMean(keyLower, effectCandidates(walk))}`,
  );
}

/**
 * An effect the engine accepts but does not run (`BROKEN_EFFECTS`). The script
 * is syntactically fine and the behavior never happens, so it is an error
 * rather than a warning, and the argument is not checked further.
 */
export function reportBrokenEffect(walk: Walk, assignment: Assignment, keyLower: string): boolean {
  const reason = BROKEN_EFFECTS[keyLower];
  if (reason === undefined) {
    return false;
  }
  report(walk, assignment, 'broken-effect', `'${assignment.key.value}' ${reason}`);
  return true;
}

const TAG_SHAPE = /^(?!\d{3}$)[A-Za-z0-9]{3}$/;

/**
 * `secede_province = <tag the mod never defines>` (`QQQ` by convention), `null`,
 * or `---` hands the province to no one, which uncolonizes it (NCE
 * effect_parsing: annex_to_null_province). Modders rely on this, and it can
 * crash the game, so it is a warning instead of an unknown-tag error.
 */
function reportUncolonize(walk: Walk, assignment: Assignment): boolean {
  if (assignment.value.kind !== 'scalar' || isEmptyCategory(walk, 'country')) {
    return false;
  }
  const raw = assignment.value.value;
  const explicit = raw.toLowerCase() === 'null' || raw === '---';
  const undefinedTag = TAG_SHAPE.test(raw) && !hasIdentifier(walk.index, 'country', raw);
  if (!explicit && !undefinedTag) {
    return false;
  }
  const message = explicit
    ? `'secede_province = ${raw}' uncolonizes the province (it goes to no one). This may crash the game.`
    : `'${raw}' is not a defined country tag, so secede_province uncolonizes the province instead (it goes to no one). This may crash the game.`;
  walk.diagnostics.push(diagnostic('warning', 'uncolonize-province', message, assignment.value.range));
  return true;
}

function handleDynamicEffectKey(walk: Walk, assignment: Assignment, keyLower: string): boolean {
  if (hasIdentifier(walk.index, 'good', keyLower)) {
    requireNumericValue(walk, assignment);
    return true;
  }
  if (hasIdentifier(walk.index, 'popType', keyLower)) {
    walkBlockValue(walk, assignment, (block) => { walkEffectEntries(walk, block.entries, 'pop'); });
    return true;
  }
  if (hasIdentifier(walk.index, 'reformClass', keyLower)) {
    checkReformOption(walk, assignment, keyLower);
    return true;
  }
  return enterDynamicScope(walk, assignment, keyLower, walkEffectEntries);
}

function walkRandomBlock(walk: Walk, body: Block, scope: ScopeType): void {
  const effects = body.entries.filter(
    (entry) => !(entry.kind === 'assignment' && entry.key.value.toLowerCase() === 'chance'),
  );
  walkEffectEntries(walk, effects, scope);
}

function walkRandomList(walk: Walk, body: Block, scope: ScopeType): void {
  for (const entry of body.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    walkBlockValue(walk, entry, (block) => { walkEffectEntries(walk, block.entries, scope); });
  }
}

// --- Weight (MTTH-style) blocks -----------------------------------------------

export function walkWeightBlock(walk: Walk, body: Block, scope: ScopeType): void {
  for (const entry of body.entries) {
    if (entry.kind !== 'assignment') {
      reportStrayEntry(walk, entry);
      continue;
    }
    const keyLower = entry.key.value.toLowerCase();
    if (WEIGHT_BLOCK_DURATION_FIELDS.has(keyLower)) {
      continue;
    }
    if (keyLower === 'modifier') {
      walkBlockValue(walk, entry, (block) => { walkModifierBlock(walk, block, scope); });
    } else if (keyLower === 'group') {
      // `group = { modifier ... }` bundles modifiers inside a value modifier.
      walkBlockValue(walk, entry, (block) => { walkWeightBlock(walk, block, scope); });
    } else {
      handleTriggerAssignment(walk, entry, scope);
    }
  }
}

function walkModifierBlock(walk: Walk, body: Block, scope: ScopeType): void {
  const conditions = body.entries.filter(
    (entry) =>
      !(
        entry.kind === 'assignment' &&
        WEIGHT_BLOCK_DURATION_FIELDS.has(entry.key.value.toLowerCase())
      ),
  );
  walkTriggerEntries(walk, conditions, scope);
}

// --- Scope changing ----------------------------------------------------------

type EntriesWalker = (walk: Walk, entries: readonly Entry[], scope: ScopeType) => void;

function enterScopeChanger(
  walk: Walk,
  assignment: Assignment,
  keyLower: string,
  scope: ScopeType,
  context: UsageContext,
  walker: EntriesWalker,
): boolean {
  if (IMPLICIT_SCOPES.includes(keyLower)) {
    walkBlockValue(walk, assignment, (block) => { walker(walk, block.entries, 'country'); });
    return true;
  }
  const changer = SCOPE_CHANGERS[keyLower];
  if (!changer) {
    return false;
  }
  if (changer.contexts !== 'both' && changer.contexts !== context) {
    report(
      walk,
      assignment,
      'wrong-context',
      `Scope '${assignment.key.value}' is only valid in ${changer.contexts} context.`,
    );
    return true;
  }
  if (!scopeAllowed(changer.from, scope)) {
    report(
      walk,
      assignment,
      'wrong-scope',
      `Scope '${assignment.key.value}' cannot be used from ${scope} scope (valid from: ${changer.from.join(', ')}).`,
    );
    return true;
  }
  walkBlockValue(walk, assignment, (block) => { walker(walk, block.entries, resolveProduces(changer, scope)); });
  return true;
}

function resolveProduces(changer: ScopeChangerDef, scope: ScopeType): ScopeType {
  if (typeof changer.produces === 'string') {
    return changer.produces;
  }
  return changer.produces[scope] ?? Object.values(changer.produces)[0] ?? scope;
}

function enterDynamicScope(
  walk: Walk,
  assignment: Assignment,
  keyLower: string,
  walker: EntriesWalker,
): boolean {
  if (assignment.value.kind !== 'block') {
    return false;
  }
  let produces: ScopeType | undefined;
  if (hasIdentifier(walk.index, 'country', keyLower)) {
    produces = 'country';
  } else if (/^\d+$/.test(keyLower) && hasIdentifier(walk.index, 'province', keyLower)) {
    produces = 'province';
  } else if (hasIdentifier(walk.index, 'stateRegion', keyLower)) {
    // Region keys iterate the region's provinces (NCE tr/ef_scope_variable).
    produces = 'province';
  }
  if (produces === undefined) {
    return false;
  }
  walker(walk, assignment.value.entries, produces);
  return true;
}

// --- Symbol checking ---------------------------------------------------------

function checkSymbol(
  walk: Walk,
  assignment: Assignment,
  definition: SymbolDef,
  scope: ScopeType,
): void {
  if (!scopeAllowed(definition.scopes, scope)) {
    report(
      walk,
      assignment,
      'wrong-scope',
      `'${assignment.key.value}' is not valid in ${scope} scope (valid in: ${definition.scopes.join(', ')}).`,
    );
    return;
  }
  checkArg(walk, assignment, definition.arg);
}

// Exact check: the datasets carry the engine's full per-symbol scope sets
// (including its internal fallbacks), so no blanket fallback applies here.
function scopeAllowed(requirement: ScopeRequirement, scope: ScopeType): boolean {
  return requirement.includes('any') || requirement.includes(scope);
}

export function checkArg(walk: Walk, assignment: Assignment, spec: ArgSpec): void {
  if (spec.kind === 'either') {
    checkArg(walk, assignment, assignment.value.kind === 'block' ? spec.block : spec.scalar);
    return;
  }
  if (spec.kind === 'block') {
    checkBlockArg(walk, assignment, spec);
    return;
  }
  checkScalarArg(walk, assignment, spec);
}

function checkScalarArg(walk: Walk, assignment: Assignment, spec: ScalarArgSpec): void {
  if (assignment.value.kind !== 'scalar') {
    report(walk, assignment, 'expected-value', `'${assignment.key.value}' expects a value, not a block.`);
    return;
  }
  const raw = assignment.value.value;
  if (assignment.operator !== '=') {
    if (assignment.value.type !== 'number') {
      report(walk, assignment, 'invalid-value', `Comparison '${assignment.operator}' needs a number.`);
    }
    return;
  }
  if (spec.accepts.some((kind) => scalarMatches(walk, kind, raw, assignment.value.kind === 'scalar' ? assignment.value.type : 'identifier'))) {
    return;
  }
  reportScalarMismatch(walk, assignment, spec, raw);
}

function scalarMatches(walk: Walk, kind: ArgKind, raw: string, scalarType: string): boolean {
  const lower = raw.toLowerCase();
  switch (kind) {
    case 'number':
      return scalarType === 'number';
    case 'yesno':
      return scalarType === 'boolean';
    case 'string':
    case 'flag':
    case 'variable':
    case 'identifier':
      return true;
    case 'strata':
      return STRATA_VALUES.has(lower);
    case 'date':
      return DATE_PATTERN.test(raw);
    case 'block':
      return false;
    case 'event':
      return walk.index.eventOccurrences.has(raw) || walk.localEventIdCounts.has(raw);
    default:
      return hasIdentifier(walk.index, kind, lower);
  }
}

function reportScalarMismatch(
  walk: Walk,
  assignment: Assignment,
  spec: ScalarArgSpec,
  raw: string,
): void {
  const categories = spec.accepts.filter(
    (kind): kind is IdentifierCategory => kind in CATEGORY_LABELS,
  );
  const primary = categories[0];
  if (primary === 'event') {
    report(walk, assignment, 'unknown-event-id', `Event ${raw} is not defined in this mod.`);
    return;
  }
  if (primary !== undefined) {
    const labels = categories.map((category) => CATEGORY_LABELS[category]).join(' or ');
    const candidates = categories.flatMap((category) => namesOf(walk.index, category));
    const suggestion = didYouMean(raw.toLowerCase(), candidates);
    report(walk, assignment, `unknown-${primary.toLowerCase()}`, `Unknown ${labels} '${raw}'.${suggestion}`);
    return;
  }
  report(
    walk,
    assignment,
    'invalid-value',
    `'${raw}' is not a valid value for '${assignment.key.value}' (expected: ${spec.accepts.join(' | ')}).`,
  );
}

function checkBlockArg(walk: Walk, assignment: Assignment, spec: BlockArgSpec): void {
  const block = asBlock(assignment.value);
  if (!block) {
    report(walk, assignment, 'expected-block', `'${assignment.key.value}' expects a { ... } block.`);
    return;
  }
  checkRequiredFields(walk, assignment, block, spec);
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    const fieldSpec = spec.fields[entry.key.value.toLowerCase()];
    if (fieldSpec) {
      checkArg(walk, entry, fieldSpecToArg(fieldSpec.accepts));
    } else if (spec.open !== true) {
      report(walk, entry, 'unknown-field', `Unknown field '${entry.key.value}' in '${assignment.key.value}'.`);
    }
  }
}

function fieldSpecToArg(accepts: readonly ArgKind[]): ArgSpec {
  if (accepts.length === 1 && accepts[0] === 'block') {
    return { kind: 'block', fields: {}, open: true };
  }
  return { kind: 'scalar', accepts };
}

function checkRequiredFields(
  walk: Walk,
  assignment: Assignment,
  block: Block,
  spec: BlockArgSpec,
): void {
  for (const [name, fieldSpec] of Object.entries(spec.fields)) {
    if (fieldSpec.required && !firstByKey(block.entries, name)) {
      report(walk, assignment, 'missing-field', `'${assignment.key.value}' is missing required field '${name}'.`);
    }
  }
}

/** `color = { r g b }`: exactly three plain numbers (no commas or suffixes). */
export function checkColorBlock(walk: Walk, assignment: Assignment): void {
  const block = asBlock(assignment.value);
  if (!block) {
    report(walk, assignment, 'invalid-color', `'${assignment.key.value}' expects three numbers: color = { 136 170 0 }.`);
    return;
  }
  for (const entry of block.entries) {
    if (entry.kind === 'scalar' && entry.type === 'number') {
      continue;
    }
    const range = entry.kind === 'assignment' ? entry.key.range : entry.range;
    const shown = entry.kind === 'scalar' ? `'${entry.value}' is not a number — colors` : 'Colors';
    walk.diagnostics.push(
      diagnostic('error', 'invalid-color', `${shown} take three plain numbers (no commas): color = { 136 170 0 }.`, range),
    );
  }
  if (block.entries.length !== 3) {
    report(
      walk,
      assignment,
      'invalid-color',
      `'${assignment.key.value}' has ${String(block.entries.length)} components — colors take exactly three: color = { 136 170 0 }.`,
    );
  }
}

// --- Keyed maps and field tables ----------------------------------------------

/** Validate `key = value` where the key must be a known table entry; returns
 *  false when the key is not in the table (caller decides how to report). */
export function checkTableField(
  walk: Walk,
  entry: Assignment,
  table: FieldTable,
): boolean {
  const accepts = table[entry.key.value.toLowerCase()];
  if (!accepts) {
    return false;
  }
  checkArg(walk, entry, { kind: 'scalar', accepts });
  return true;
}

/** Validate a `<identifier> = number` map block (e.g. goods, upper_house). */
export function checkKeyedNumberMap(walk: Walk, block: Block, category: IdentifierCategory): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    checkMapKey(walk, entry, category);
    requireNumericValue(walk, entry);
  }
}

/** Validate a `<identifier> = { weight block }` map (e.g. promote_to, ideologies). */
export function checkKeyedWeightMap(
  walk: Walk,
  block: Block,
  category: IdentifierCategory,
  scope: ScopeType,
): void {
  for (const entry of block.entries) {
    if (entry.kind !== 'assignment') {
      continue;
    }
    checkMapKey(walk, entry, category);
    walkBlockValue(walk, entry, (body) => { walkWeightBlock(walk, body, scope); });
  }
}

function checkMapKey(walk: Walk, entry: Assignment, category: IdentifierCategory): void {
  const keyLower = entry.key.value.toLowerCase();
  if (isEmptyCategory(walk, category) || hasIdentifier(walk.index, category, keyLower)) {
    return;
  }
  report(
    walk,
    entry,
    `unknown-${category.toLowerCase()}`,
    `Unknown ${CATEGORY_LABELS[category]} '${entry.key.value}'.${didYouMean(keyLower, namesOf(walk.index, category))}`,
  );
}

// --- Small shared helpers ----------------------------------------------------

/**
 * `<class> = <option>`. The engine accepts any option from the class's pool
 * (issue options or reform options), not only the class's own positions, so
 * `economic_policy = no_position_set` is legal when `no_position_set` exists
 * under another issue.
 */
export function checkReformOption(walk: Walk, assignment: Assignment, classNameLower: string): void {
  if (assignment.value.kind !== 'scalar') {
    report(walk, assignment, 'expected-value', `'${assignment.key.value}' expects a reform option value.`);
    return;
  }
  const pool = walk.index.optionPoolByClass.get(classNameLower);
  const valueLower = assignment.value.value.toLowerCase();
  if (pool && !pool.has(valueLower)) {
    const own = walk.index.reformOptionsByClass.get(classNameLower) ?? [];
    report(
      walk,
      assignment,
      'unknown-reform-option',
      `'${assignment.value.value}' is not a known option for '${assignment.key.value}'.${didYouMean(valueLower, [...own, ...pool])}`,
    );
  }
}

/**
 * A modifier value key: the static NCE set plus the `<folder>_research_bonus`
 * key every tech folder of the mod grants.
 */
export function isModifierKey(walk: Walk, keyLower: string): boolean {
  return MODIFIER_KEYS.has(keyLower) || walk.index.researchBonusKeys.has(keyLower);
}

/** Every modifier key the mod accepts, for `didYouMean` candidate lists. */
export function modifierKeyNames(walk: Walk): readonly string[] {
  return [...MODIFIER_KEYS, ...walk.index.researchBonusKeys];
}

/** `<modifier> = number` (NCE modifier_base); false when the key is not a modifier. */
export function checkModifierValueField(walk: Walk, entry: Assignment): boolean {
  if (!isModifierKey(walk, entry.key.value.toLowerCase())) {
    return false;
  }
  requireNumericValue(walk, entry);
  return true;
}

/** `Unknown <label> '<key>'.` plus a spelling suggestion drawn from `candidates`. */
export function reportUnknownKey(
  walk: Walk,
  entry: Assignment,
  code: string,
  label: string,
  candidates: Iterable<string>,
): void {
  report(
    walk,
    entry,
    code,
    `Unknown ${label} '${entry.key.value}'.${didYouMean(entry.key.value.toLowerCase(), candidates)}`,
  );
}

export function requireNumericValue(walk: Walk, assignment: Assignment): void {
  if (assignment.value.kind !== 'scalar' || assignment.value.type !== 'number') {
    report(walk, assignment, 'invalid-value', `'${assignment.key.value}' expects a number.`);
  }
}

export function requireBlockValue(walk: Walk, assignment: Assignment): void {
  if (assignment.value.kind !== 'block') {
    report(walk, assignment, 'expected-block', `'${assignment.key.value}' expects a { ... } block.`);
  }
}

export function walkBlockValue(walk: Walk, assignment: Assignment, visit: (block: Block) => void): void {
  const block = asBlock(assignment.value);
  if (block) {
    visit(block);
  } else {
    report(walk, assignment, 'expected-block', `'${assignment.key.value}' expects a { ... } block.`);
  }
}

export function report(walk: Walk, at: Assignment, code: string, message: string): void {
  walk.diagnostics.push(diagnostic('error', code, message, at.key.range));
}

export function isEmptyCategory(walk: Walk, category: IdentifierCategory): boolean {
  return (walk.index.identifiers.get(category)?.size ?? 0) === 0;
}

/** Flags set by the game engine itself, not by mod files. */
const ENGINE_SET_GLOBAL_FLAGS: ReadonlySet<string> = new Set(['project_alice']);

/** Warn when a checked flag is never set anywhere in the mod (or this buffer). */
export function checkFlagIsSet(walk: Walk, assignment: Assignment, kind: 'country' | 'global'): void {
  if (assignment.value.kind !== 'scalar') {
    return;
  }
  const indexed = kind === 'country' ? walk.index.countryFlagsSet : walk.index.globalFlagsSet;
  const local = kind === 'country' ? walk.localFlags.country : walk.localFlags.global;
  if (indexed.size === 0 && local.size === 0) {
    return;
  }
  const flagLower = assignment.value.value.toLowerCase();
  if (indexed.has(flagLower) || local.has(flagLower)) {
    return;
  }
  if (kind === 'global' && ENGINE_SET_GLOBAL_FLAGS.has(flagLower)) {
    return;
  }

  const otherNamespace = kind === 'country' ? walk.index.globalFlagsSet : walk.index.countryFlagsSet;
  const label = kind === 'country' ? 'Country' : 'Global';
  const message = otherNamespace.has(flagLower)
    ? `${label} flag '${assignment.value.value}' is only ever set as a ${kind === 'country' ? 'global' : 'country'} flag — country and global flags are separate namespaces.`
    : `${label} flag '${assignment.value.value}' is checked but never set by any event, decision, CB, or history file.${didYouMean(flagLower, indexed)}`;
  walk.diagnostics.push(diagnostic('warning', 'flag-never-set', message, assignment.value.range));
}

/**
 * Loc/picture checks are warnings, and skip entirely when the source folder is
 * absent. A value that does not match `locKeyPattern` is literal display text
 * (`desc = "Death of Dom Pedro II"`), not a key the engine looks up.
 */
export function checkLocKey(walk: Walk, assignment: Assignment): void {
  if (assignment.value.kind !== 'scalar' || isEmptyCategory(walk, 'locKey')) {
    return;
  }
  const key = assignment.value.value;
  if (walk.options.locKeyPattern?.test(key) === false) {
    return;
  }
  if (!hasIdentifier(walk.index, 'locKey', key)) {
    walk.diagnostics.push(
      diagnostic(
        'warning',
        'missing-localisation',
        `Localisation key '${key}' was not found in localisation/.`,
        assignment.value.range,
      ),
    );
  }
}

export function checkPicture(
  walk: Walk,
  assignment: Assignment,
  category: 'eventPicture' | 'decisionPicture',
): void {
  if (assignment.value.kind !== 'scalar' || isEmptyCategory(walk, category)) {
    return;
  }
  // A picture may sit in a subfolder: `picture = "Brasil/Dom Pedro"` is
  // `gfx/pictures/events/Brasil/Dom Pedro.tga`, and the index keys it by that
  // same path under the folder.
  const name = assignment.value.value;
  if (!hasIdentifier(walk.index, category, name)) {
    const folder = category === 'eventPicture' ? 'gfx/pictures/events' : 'gfx/pictures/decisions';
    const suggestion = didYouMean(name.toLowerCase(), namesOf(walk.index, category));
    walk.diagnostics.push(
      diagnostic(
        'warning',
        'missing-picture',
        `Picture '${name}' was not found in ${folder}/.${suggestion}`,
        assignment.value.range,
      ),
    );
  }
}

function triggerCandidates(walk: Walk): string[] {
  return [...Object.keys(TRIGGERS), ...Object.keys(SCOPE_CHANGERS), ...namesOf(walk.index, 'ideology')];
}

function effectCandidates(walk: Walk): string[] {
  return [...Object.keys(EFFECTS), ...Object.keys(SCOPE_CHANGERS), ...namesOf(walk.index, 'popType')];
}
