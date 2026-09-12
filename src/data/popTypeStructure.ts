import type { FieldTable, ScopeType } from '../model/symbols.js';

/**
 * Pop type file fields (NCE poptype_file). Scalar fields map to accepted arg
 * kinds; block-shaped fields are handled by the pop type validator.
 */
export const POPTYPE_SCALAR_FIELDS: FieldTable = {
  sprite: ['number'],
  is_artisan: ['yesno'],
  max_size: ['number'],
  merge_max_size: ['number'],
  strata: ['strata'],
  state_capital_only: ['yesno'],
  unemployment: ['yesno'],
  equivalent: ['popType'],
  allowed_to_vote: ['yesno'],
  is_slave: ['yesno'],
  can_be_recruited: ['yesno'],
  leadership: ['number'],
  research_optimum: ['number'],
  demote_migrant: ['yesno'],
  administrative_efficiency: ['yesno'],
  tax_eff: ['number'],
  can_build: ['yesno'],
  research_points: ['number'],
  can_reduce_consciousness: ['yesno'],
  factory: ['yesno'],
  workplace_input: ['number'],
  workplace_output: ['number'],
  starter_share: ['number'],
  can_work_factory: ['yesno'],
};

export const POPTYPE_GOODS_FIELDS: ReadonlySet<string> = new Set([
  'life_needs',
  'everyday_needs',
  'luxury_needs',
]);

/** Pop type weight blocks and their evaluation scope (NCE read_*migration_target). */
export const POPTYPE_WEIGHT_FIELDS: Readonly<Record<string, ScopeType>> = {
  country_migration_target: 'country',
  migration_target: 'province',
};

export const POPTYPE_INCOME_FIELDS: ReadonlySet<string> = new Set([
  'life_needs_income',
  'everyday_needs_income',
  'luxury_needs_income',
]);
