import type { FieldTable } from '../model/symbols.js';

/** Country history fields (NCE country_history_file); dynamic tech/invention/
 *  reform keys and dated blocks are handled by the history validator. */
export const COUNTRY_HISTORY_FIELDS: FieldTable = {
  capital: ['province'],
  primary_culture: ['culture'],
  culture: ['culture'],
  remove_culture: ['culture'],
  religion: ['religion'],
  government: ['government'],
  plurality: ['number'],
  prestige: ['number'],
  nationalvalue: ['nationalValue'],
  literacy: ['number'],
  non_state_culture_literacy: ['number'],
  civilized: ['yesno'],
  is_releasable_vassal: ['yesno'],
  ruling_party: ['identifier'],
  schools: ['modifier'],
  consciousness: ['number'],
  nonstate_consciousness: ['number'],
  last_election: ['date'],
  oob: ['string', 'identifier'],
  colonial_points: ['number'],
  set_country_flag: ['flag'],
  set_global_flag: ['flag'],
  // The game also clears flags from history (dated blocks of a ruler's death, ...).
  clr_country_flag: ['flag'],
  clr_global_flag: ['flag'],
};

/**
 * The effect-form reform keys the game also accepts in country history
 * (`military_reform = yes_military_constructions` starts the country with that
 * reform). NCE rejects them, the game does not.
 */
export const REFORM_EFFECT_KEYS: ReadonlySet<string> = new Set([
  'political_reform',
  'social_reform',
  'economic_reform',
  'military_reform',
]);

/** Province history fields (NCE province_history_file); building levels and
 *  dated blocks are handled by the history validator. */
export const PROVINCE_HISTORY_FIELDS: FieldTable = {
  life_rating: ['number'],
  colony: ['number'],
  colonial: ['number'],
  trade_goods: ['good'],
  owner: ['country'],
  controller: ['country'],
  terrain: ['terrain'],
  add_core: ['country'],
  remove_core: ['country'],
  is_slave: ['yesno'],
  set_province_flag: ['flag'],
  clr_province_flag: ['flag'],
};

/** Pop definition fields inside history/pops files (NCE pop_history_definition). */
export const POP_HISTORY_FIELDS: FieldTable = {
  culture: ['culture'],
  religion: ['religion'],
  size: ['number'],
  militancy: ['number'],
  rebel_type: ['rebelType'],
};

export const DIPLOMACY_RELATION_KEYS: ReadonlySet<string> = new Set([
  'alliance',
  'vassal',
  'union',
  'substate',
]);

export const DIPLOMACY_RELATION_FIELDS: FieldTable = {
  first: ['country'],
  second: ['country'],
  start_date: ['date'],
  end_date: ['date'],
};

/** OOB (history/units) leader and relationship fields (NCE oob_*). */
export const OOB_LEADER_FIELDS: FieldTable = {
  name: ['string', 'identifier'],
  date: ['date'],
  type: ['identifier'],
  personality: ['trait'],
  background: ['trait'],
  prestige: ['number'],
  picture: ['string', 'identifier'],
};

export const OOB_RELATIONSHIP_FIELDS: FieldTable = {
  value: ['number'],
  level: ['number'],
  influence_value: ['number'],
  truce_until: ['date'],
  military_access: ['yesno'],
};

export const OOB_SHIP_FIELDS: FieldTable = {
  name: ['string', 'identifier'],
  type: ['unit'],
  home: ['province'],
};

/** War history block fields (NCE war_block / history_war_goal). */
export const WAR_BLOCK_FIELDS: FieldTable = {
  add_attacker: ['country'],
  add_defender: ['country'],
  rem_attacker: ['country'],
  rem_defender: ['country'],
  world_war: ['yesno'],
};

export const WAR_GOAL_FIELDS: FieldTable = {
  casus_belli: ['cbType'],
  actor: ['country'],
  receiver: ['country'],
  country: ['country'],
  state_province_id: ['province'],
};
