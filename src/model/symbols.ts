/** The kind of game object a scope refers to. */
export type ScopeType = 'country' | 'province' | 'state' | 'pop';

/** Where a symbol appears: a condition context or an effect context. */
export type UsageContext = 'trigger' | 'effect';

/** Identifier categories resolvable against the mod index. */
export type IdentifierCategory =
  | 'country'
  | 'culture'
  | 'cultureGroup'
  | 'religion'
  | 'good'
  | 'ideology'
  | 'government'
  | 'building'
  | 'modifier'
  | 'nationalValue'
  | 'cbType'
  | 'crime'
  | 'popType'
  | 'rebelType'
  | 'graphicalCulture'
  | 'province'
  | 'stateRegion'
  | 'continent'
  | 'terrain'
  | 'technology'
  | 'invention'
  | 'reformClass'
  | 'reformOption'
  | 'issue'
  | 'unit'
  | 'trait'
  | 'event'
  | 'locKey'
  | 'eventPicture'
  | 'decisionPicture';

/** Human-readable labels for identifier categories, used in diagnostics. */
export const CATEGORY_LABELS: Readonly<Record<IdentifierCategory, string>> = {
  country: 'country tag',
  culture: 'culture',
  cultureGroup: 'culture group',
  religion: 'religion',
  good: 'trade good',
  ideology: 'ideology',
  government: 'government',
  building: 'building',
  modifier: 'modifier',
  nationalValue: 'national value',
  cbType: 'casus belli type',
  crime: 'crime',
  popType: 'pop type',
  rebelType: 'rebel type',
  graphicalCulture: 'graphical culture',
  province: 'province id',
  stateRegion: 'state/region',
  continent: 'continent',
  terrain: 'terrain',
  technology: 'technology',
  invention: 'invention',
  reformClass: 'reform class',
  reformOption: 'reform option',
  issue: 'issue',
  unit: 'unit type',
  trait: 'leader trait',
  event: 'event id',
  locKey: 'localisation key',
  eventPicture: 'event picture',
  decisionPicture: 'decision picture',
};

/** What a scalar argument may be. Unchecked kinds accept any token of that shape. */
export type ArgKind =
  | IdentifierCategory
  | 'number'
  | 'yesno'
  | 'string'
  | 'flag'
  | 'variable'
  | 'strata'
  | 'identifier'
  | 'date'
  | 'block';

/** `field name -> accepted scalar kinds`, the shape of every data-file field table. */
export type FieldTable = Readonly<Record<string, readonly ArgKind[]>>;

export interface ScalarArgSpec {
  readonly kind: 'scalar';
  readonly accepts: readonly ArgKind[];
}

export interface BlockFieldSpec {
  readonly accepts: readonly ArgKind[];
  readonly required: boolean;
}

export interface BlockArgSpec {
  readonly kind: 'block';
  readonly fields: Readonly<Record<string, BlockFieldSpec>>;
  /** Permit fields not listed in `fields` (validated as unchecked). */
  readonly open?: boolean;
}

/** Accepts either the scalar or the block form (e.g. `war = TAG` / `war = { ... }`). */
export interface EitherArgSpec {
  readonly kind: 'either';
  readonly scalar: ScalarArgSpec;
  readonly block: BlockArgSpec;
}

export type ArgSpec = ScalarArgSpec | BlockArgSpec | EitherArgSpec;

/** Scopes a symbol is valid in; 'any' short-circuits the scope check. */
export type ScopeRequirement = readonly (ScopeType | 'any')[];

/** A validated trigger (condition) or effect. */
export interface SymbolDef {
  readonly scopes: ScopeRequirement;
  readonly arg: ArgSpec;
  /** One-line usage note shown on hover. */
  readonly doc: string;
}

/** A scope-changing keyword (`any_owned`, `capital_scope`, `owner`, ...). */
export interface ScopeChangerDef {
  readonly from: ScopeRequirement;
  /** Target scope; a map when it depends on the origin (e.g. any_core). */
  readonly produces: ScopeType | Readonly<Partial<Record<ScopeType, ScopeType>>>;
  readonly contexts: UsageContext | 'both';
  /** One-line usage note shown on hover. */
  readonly doc: string;
}

export function scalar(...accepts: readonly ArgKind[]): ScalarArgSpec {
  return { kind: 'scalar', accepts };
}

export function field(required: boolean, ...accepts: readonly ArgKind[]): BlockFieldSpec {
  return { accepts, required };
}
