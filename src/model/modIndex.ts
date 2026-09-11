import type { Range } from './range.js';
import type { IdentifierCategory } from './symbols.js';

/** Where an event id or decision name is defined. */
export interface EventOccurrence {
  readonly filePath: string;
  readonly range: Range;
}

/** One definition site of an identifier. */
export interface IdentifierOccurrence {
  readonly name: string;
  readonly filePath: string;
  readonly range: Range;
}

/** An identifier defined more than once where the engine expects it unique. */
export interface DuplicateIdentifier {
  readonly category: IdentifierCategory;
  readonly name: string;
  readonly occurrences: readonly IdentifierOccurrence[];
}

/** Where a localisation key is defined and its English text. */
export interface LocKeyDefinition {
  readonly filePath: string;
  readonly line: number;
  readonly length: number;
  readonly text: string;
}

/** Country and global flags, kept apart because the engine keeps them apart. */
export interface FlagSets {
  readonly country: Set<string>;
  readonly global: Set<string>;
}

/** Everything the semantic validators know about a mod, built from its data files. */
export interface ModIndex {
  readonly identifiers: ReadonlyMap<IdentifierCategory, ReadonlySet<string>>;
  /** Reform/policy class name → the positions defined under it (from issues.txt). */
  readonly reformOptionsByClass: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Reform/policy class name → every position the engine accepts for it. NCE
   * resolves a value against one of two global pools, not against the class:
   * party/political/social issue options, or economic/military reform options.
   */
  readonly optionPoolByClass: ReadonlyMap<string, ReadonlySet<string>>;
  /** Event id → where it is defined (more than one entry = duplicate id). */
  readonly eventOccurrences: ReadonlyMap<string, readonly EventOccurrence[]>;
  /** Decision name → where it is defined (more than one entry = duplicate). */
  readonly decisionOccurrences: ReadonlyMap<string, readonly EventOccurrence[]>;
  /** Localisation key (lowercase) → its first definition site. */
  readonly locKeyDefinitions: ReadonlyMap<string, LocKeyDefinition>;
  /** Identifiers defined more than once in the mod's data files. */
  readonly duplicates: readonly DuplicateIdentifier[];
  /** Country flags set anywhere in the mod (events, decisions, CBs, history). */
  readonly countryFlagsSet: ReadonlySet<string>;
  /** Global flags set anywhere in the mod. */
  readonly globalFlagsSet: ReadonlySet<string>;
  /** Tech folder names from common/technology.txt, in declaration order. */
  readonly techFolders: readonly string[];
  /** `<folder>_research_bonus` modifier keys the mod's tech folders grant. */
  readonly researchBonusKeys: ReadonlySet<string>;
  /** `max_provinces` from map/default.map; province ids must stay below it. */
  readonly maxProvinces: number | undefined;
  /** Province ids listed under `sea_starts` in map/default.map. */
  readonly seaProvinces: ReadonlySet<string>;
  /** Province id → the state (region.txt block) the engine assigns it to. */
  readonly stateOfProvince: ReadonlyMap<string, string>;
}
