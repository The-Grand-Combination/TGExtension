import type { FieldTable } from '../model/symbols.js';

/**
 * common/ data-file grammars (NCE parser_defs.txt groups of the same names).
 */

export const CULTURE_GROUP_FIELDS: FieldTable = {
  leader: ['identifier'],
  unit: ['identifier', 'number'],
  is_overseas: ['yesno'],
  union: ['country'],
};

export const CULTURE_FIELDS: FieldTable = {
  radicalism: ['number'],
  primary: ['country'],
};

export const RELIGION_FIELDS: FieldTable = {
  icon: ['number'],
  pagan: ['yesno'],
};

export const GOOD_FIELDS: FieldTable = {
  cost: ['number'],
  available_from_start: ['yesno'],
  tradeable: ['yesno'],
  overseas_penalty: ['yesno'],
  money: ['yesno'],
};

export const IDEOLOGY_FIELDS: FieldTable = {
  can_reduce_militancy: ['yesno'],
  uncivilized: ['yesno'],
  civilized: ['yesno'],
  date: ['date'],
};

/** Ideology desire blocks: country-scope value modifiers (NCE ideology_condition). */
export const IDEOLOGY_WEIGHT_FIELDS: ReadonlySet<string> = new Set([
  'add_political_reform',
  'remove_political_reform',
  'add_social_reform',
  'remove_social_reform',
  'add_military_reform',
  'add_economic_reform',
]);

export const GOVERNMENT_FIELDS: FieldTable = {
  flagtype: ['identifier'],
  election: ['yesno'],
  duration: ['number'],
  appoint_ruling_party: ['yesno'],
};

export const BUILDING_FIELDS: FieldTable = {
  type: ['identifier'],
  cost: ['number'],
  time: ['number'],
  naval_capacity: ['number'],
  max_level: ['number'],
  colonial_range: ['number'],
  infrastructure: ['number'],
  production_type: ['identifier'],
  default_enabled: ['yesno'],
  on_completion: ['identifier'],
  completion_size: ['number'],
  port: ['yesno'],
  visibility: ['yesno'],
  onmap: ['yesno'],
  province: ['yesno'],
  fort_level: ['number'],
  pop_build_factory: ['yesno'],
  spawn_railway_track: ['yesno'],
  strategic_factory: ['yesno'],
  sail: ['yesno'],
  steam: ['yesno'],
  one_per_state: ['yesno'],
  advanced_factory: ['yesno'],
  capital: ['yesno'],
};

/**
 * Three-letter tokens the engine reads as keywords elsewhere (order of battle,
 * GUI and script files), so a country may not claim them. Declaring one in
 * common/countries.txt makes the game misread the tag.
 *
 * `PAN`, `PHI` and `WIN` are deliberately absent: vanilla ships Panjab and the
 * Philippines under the first two, and TGC ships the West Indies under the
 * third, so they are usable in practice.
 */
export const RESERVED_COUNTRY_TAGS: ReadonlySet<string> = new Set([
  'air',
  'any',
  'con',
  'cot',
  'day',
  'dir',
  'end',
  'gui',
  'hot',
  'hre',
  'key',
  'law',
  'log',
  'mil',
  'min',
  'nap',
  'oob',
  'red',
  'row',
]);

/** Leader trait stats (NCE trait). */
export const TRAIT_FIELDS: ReadonlySet<string> = new Set([
  'organisation',
  'morale',
  'attack',
  'defence',
  'defense',
  'reconnaissance',
  'speed',
  'experience',
  'reliability',
  'attrition',
]);

/** The engine's fixed static modifier names (NCE static_modifiers_file). */
export const STATIC_MODIFIER_NAMES: ReadonlySet<string> = new Set([
  'very_easy_player',
  'easy_player',
  'hard_player',
  'very_hard_player',
  'very_easy_ai',
  'easy_ai',
  'hard_ai',
  'very_hard_ai',
  'overseas',
  'coastal',
  'non_coastal',
  'coastal_sea',
  'sea_zone',
  'land_province',
  'blockaded',
  'no_adjacent_controlled',
  'core',
  'has_siege',
  'occupied',
  'nationalism',
  'infrastructure',
  'base_values',
  'war',
  'peace',
  'disarming',
  'war_exhaustion',
  'badboy',
  'debt_default_to',
  'bad_debter',
  'great_power',
  'second_power',
  'civ_nation',
  'unciv_nation',
  'average_literacy',
  'plurality',
  'generalised_debt_default',
  'total_occupation',
  'total_blockaded',
  'in_bankrupcy',
]);

export const PRODUCTION_TYPE_FIELDS: FieldTable = {
  template: ['identifier'],
  type: ['identifier'],
  workforce: ['number'],
  farm: ['yesno'],
  mine: ['yesno'],
  is_coastal: ['yesno'],
  limit_by_local_supply: ['yesno'],
  output_goods: ['good'],
  value: ['number'],
};

export const PRODUCTION_EMPLOYEE_FIELDS: FieldTable = {
  poptype: ['popType'],
  effect: ['identifier'],
  effect_multiplier: ['number'],
  amount: ['number'],
};

export const BOOKMARK_FIELDS: FieldTable = {
  date: ['date'],
  name: ['string', 'identifier'],
  desc: ['string', 'identifier'],
  camerax: ['number'],
  cameray: ['number'],
};

/** common/pop_types.txt: pop-scope promotion/migration value modifiers. */
export const POP_CHANCE_KEYS: ReadonlySet<string> = new Set([
  'promotion_chance',
  'demotion_chance',
  'migration_chance',
  'colonialmigration_chance',
  'emigration_chance',
  'assimilation_chance',
  'conversion_chance',
]);

export const PARTY_FIELDS: FieldTable = {
  name: ['string', 'identifier'],
  start_date: ['date'],
  end_date: ['date'],
  ideology: ['ideology'],
};

/** Reform toggles an issue option may set (NCE option_rules). */
export const OPTION_RULES_KEYS: ReadonlySet<string> = new Set([
  'build_factory',
  'expand_factory',
  'open_factory',
  'destroy_factory',
  'factory_priority',
  'can_subsidise',
  'pop_build_factory',
  'pop_expand_factory',
  'pop_open_factory',
  'delete_factory_if_no_input',
  'build_factory_invest',
  'expand_factory_invest',
  'open_factory_invest',
  'build_railway_invest',
  'can_invest_in_pop_projects',
  'pop_build_factory_invest',
  'pop_expand_factory_invest',
  'pop_open_factory_invest',
  'allow_foreign_investment',
  'slavery_allowed',
  'primary_culture_voting',
  'culture_voting',
  'all_voting',
  'largest_share',
  'dhont',
  'sainte_laque',
  'same_as_ruling_party',
  'rich_only',
  'state_vote',
  'population_vote',
  'build_railway',
  'build_bank',
  'build_university',
]);

export const ISSUE_OPTION_FIELDS: FieldTable = {
  technology_cost: ['number'],
  war_exhaustion_effect: ['number'],
  administrative_multiplier: ['number'],
  is_jingoism: ['yesno'],
};

/** National focus scalar fields beyond modifier values (NCE national_focus). */
export const FOCUS_FIELDS: FieldTable = {
  railroads: ['number'],
  own_provinces: ['yesno'],
  has_flashpoint: ['yesno'],
  flashpoint_tension: ['number'],
  outliner_show_as_percent: ['yesno'],
  loyalty_value: ['number'],
};

/** The engine's fixed on_actions hooks; anything else never fires. */
export const ON_ACTION_KEYS: ReadonlySet<string> = new Set([
  'on_yearly_pulse',
  'on_quarterly_pulse',
  'on_battle_won',
  'on_battle_lost',
  'on_surrender',
  'on_new_great_nation',
  'on_lost_great_nation',
  'on_election_tick',
  'on_colony_to_state',
  'on_state_conquest',
  'on_colony_to_state_free_slaves',
  'on_debtor_default',
  'on_debtor_default_small',
  'on_debtor_default_second',
  'on_civilize',
  'on_my_factories_nationalized',
  'on_crisis_declare_interest',
]);
