import { CB_EFFECT_FIELDS, CB_TRIGGER_FIELDS } from '../data/cbTypeStructure.js';
import { IDEOLOGY_WEIGHT_FIELDS, POP_CHANCE_KEYS } from '../data/commonStructure.js';
import {
  DECISION_EFFECT_FIELDS,
  DECISION_TRIGGER_FIELDS,
  EVENT_EFFECT_FIELDS,
  EVENT_TRIGGER_FIELDS,
  LOGICAL_OPERATORS,
} from '../data/eventStructure.js';
import { POPTYPE_WEIGHT_FIELDS } from '../data/popTypeStructure.js';
import {
  REBEL_EFFECT_FIELDS,
  REBEL_TRIGGER_FIELDS,
  REBEL_WEIGHT_FIELDS,
} from '../data/rebelTypeStructure.js';
import { EFFECT_PASSTHROUGH_KEYS, SCOPE_CHANGERS } from '../data/scopes.js';
import type { FileType } from '../model/fileType.js';
import type { ModIndex } from '../model/modIndex.js';
import type { ScopeType } from '../model/symbols.js';
import { hasIdentifier } from './modIndex.js';
import { resolveProduces } from './validationWalker.js';

/** Trigger and effect context, plus the MTTH-style weight block that holds both. */
export type ScriptUsage = 'trigger' | 'effect' | 'weight';

export interface ScriptPlace {
  readonly scope: ScopeType;
  readonly usage: ScriptUsage;
}

/** `unknown` is a path this code cannot name, not a path that holds nothing. */
export type PathPlace =
  | { readonly kind: 'script'; readonly scope: ScopeType; readonly usage: ScriptUsage }
  | { readonly kind: 'structural' }
  | { readonly kind: 'unknown' };

interface Opener {
  readonly usage: ScriptUsage;
  /** Absent takes the scope the file's root key established. */
  readonly scope?: ScopeType;
}

type OpenerTable = Readonly<Record<string, Opener>>;

function opener(usage: ScriptUsage, scope?: ScopeType): Opener {
  return scope === undefined ? { usage } : { usage, scope };
}

function openers(usage: ScriptUsage, names: Iterable<string>, scope?: ScopeType): OpenerTable {
  return Object.fromEntries([...names].map((name) => [name, opener(usage, scope)]));
}

function scopedOpeners(usage: ScriptUsage, scopes: Readonly<Record<string, ScopeType>>): OpenerTable {
  return Object.fromEntries(
    Object.entries(scopes).map(([name, scope]) => [name, opener(usage, scope)]),
  );
}

/**
 * Where script starts in each file type, mirroring the walker its validator
 * runs. An event body takes its scope from its root key, so those carry none.
 */
const FILE_OPENERS: Readonly<Partial<Record<FileType, OpenerTable>>> = {
  event: {
    ...openers('trigger', EVENT_TRIGGER_FIELDS),
    ...openers('effect', EVENT_EFFECT_FIELDS),
    option: opener('effect'),
    mean_time_to_happen: opener('weight'),
    ai_chance: opener('weight'),
  },
  decision: {
    ...openers('trigger', DECISION_TRIGGER_FIELDS, 'country'),
    ...openers('effect', DECISION_EFFECT_FIELDS, 'country'),
    ai_will_do: opener('weight', 'country'),
  },
  cbType: {
    ...scopedOpeners('trigger', CB_TRIGGER_FIELDS),
    ...scopedOpeners('effect', CB_EFFECT_FIELDS),
  },
  rebelType: {
    ...scopedOpeners('trigger', REBEL_TRIGGER_FIELDS),
    ...scopedOpeners('effect', REBEL_EFFECT_FIELDS),
    ...scopedOpeners('weight', REBEL_WEIGHT_FIELDS),
  },
  crime: { trigger: opener('trigger', 'province') },
  triggeredModifier: { trigger: opener('trigger', 'country') },
  nationalFocus: { limit: opener('trigger', 'province') },
  newsScript: { trigger: opener('trigger', 'country') },
  issues: {
    allow: opener('trigger', 'country'),
    trigger: opener('trigger', 'country'),
    effect: opener('effect', 'country'),
    vote_modifiers: opener('weight', 'country'),
  },
  technology: { limit: opener('trigger', 'country'), chance: opener('weight', 'country') },
  // An invention's `effect` holds modifier values, not script effects.
  invention: { limit: opener('trigger', 'country'), chance: opener('weight', 'country') },
  ideologies: openers('weight', IDEOLOGY_WEIGHT_FIELDS, 'country'),
  popChances: openers('weight', POP_CHANCE_KEYS, 'pop'),
  popType: scopedOpeners('weight', POPTYPE_WEIGHT_FIELDS),
  productionTypes: { trigger: opener('trigger', 'state') },
  countryDefinition: { trigger: opener('trigger', 'country') },
};

const ROOT_SCOPES: Readonly<Partial<Record<FileType, Readonly<Record<string, ScopeType>>>>> = {
  event: { country_event: 'country', province_event: 'province' },
};

/** Keys a file's definitions live under, before any field of their own. */
const ROOT_KEYS: Readonly<Partial<Record<FileType, readonly string[]>>> = {
  event: Object.keys(ROOT_SCOPES.event ?? {}),
  decision: ['political_decisions'],
};

export function rootKeysOf(fileType: FileType): readonly string[] {
  return ROOT_KEYS[fileType] ?? [];
}

export function openerKeysOf(fileType: FileType): readonly string[] {
  return Object.keys(FILE_OPENERS[fileType] ?? {});
}

/** Effect keys whose block runs in the same scope and context. */
const PASSTHROUGH_KEYS: ReadonlySet<string> = new Set([...EFFECT_PASSTHROUGH_KEYS, 'random', 'random_list']);

export function placeOf(path: readonly string[], fileType: FileType, index: ModIndex): PathPlace {
  const fileOpeners = FILE_OPENERS[fileType] ?? {};
  const rootScopes = ROOT_SCOPES[fileType] ?? {};
  let rootScope: ScopeType | undefined;
  let place: ScriptPlace | undefined;

  for (const [position, raw] of path.entries()) {
    const key = raw.toLowerCase();
    if (place) {
      place = advance(place, key, (path[position - 1] ?? '').toLowerCase(), index);
      if (!place) {
        return { kind: 'unknown' };
      }
      continue;
    }
    rootScope = rootScopes[key] ?? rootScope;
    const entry = fileOpeners[key];
    const scope = entry?.scope ?? rootScope;
    if (entry && scope === undefined) {
      return { kind: 'unknown' };
    }
    if (entry && scope !== undefined) {
      place = { scope, usage: entry.usage };
    }
  }
  return place ? { kind: 'script', ...place } : { kind: 'structural' };
}

function advance(
  place: ScriptPlace,
  key: string,
  previousKey: string,
  index: ModIndex,
): ScriptPlace | undefined {
  const { scope, usage } = place;
  if (usage === 'weight') {
    return key === 'modifier' ? { scope, usage: 'trigger' } : undefined;
  }
  if (key === 'limit' || LOGICAL_OPERATORS.has(key)) {
    return { scope, usage: 'trigger' };
  }
  // A `random_list` weight is a number, never the province of the same id.
  if (PASSTHROUGH_KEYS.has(key) || previousKey === 'random_list') {
    return place;
  }
  const changer = SCOPE_CHANGERS[key];
  if (changer) {
    return changer.contexts === 'both' || changer.contexts === usage
      ? { scope: resolveProduces(changer, scope), usage }
      : undefined;
  }
  const dynamic = dynamicScope(key, index);
  return dynamic === undefined ? undefined : { scope: dynamic, usage };
}

/** Scope keys the index names rather than the dataset. */
function dynamicScope(key: string, index: ModIndex): ScopeType | undefined {
  if (hasIdentifier(index, 'country', key)) {
    return 'country';
  }
  if (/^\d+$/.test(key) && hasIdentifier(index, 'province', key)) {
    return 'province';
  }
  // A region key iterates the region's provinces (NCE tr/ef_scope_variable).
  if (hasIdentifier(index, 'stateRegion', key)) {
    return 'province';
  }
  return hasIdentifier(index, 'popType', key) ? 'pop' : undefined;
}
