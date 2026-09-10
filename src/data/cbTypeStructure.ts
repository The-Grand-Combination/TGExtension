import type { ScopeType } from '../model/symbols.js';

/**
 * Casus belli fields, from the cb_types.txt header notes. Scalar/metadata
 * fields on one side; trigger/effect blocks (with their evaluation scope) on
 * the other.
 */
export const CB_BODY_FIELDS: ReadonlySet<string> = new Set([
  // war_name is a loc key, but engine-provided keys (WAR_NAME, ...) resolve
  // from vanilla localisation, so its existence is not checked.
  'war_name',
  'sprite_index',
  'is_triggered_only',
  'months',
  'crisis',
  'construction_speed',
  'constructing_cb',
  'mutual',
  'is_civil_war',
  'always',
  'great_war_obligatory',
  'badboy_factor',
  'prestige_factor',
  'peace_cost_factor',
  'penalty_factor',
  'break_truce_prestige_factor',
  'break_truce_infamy_factor',
  'break_truce_militancy_factor',
  'truce_months',
  'good_relation_prestige_factor',
  'good_relation_infamy_factor',
  'good_relation_militancy_factor',
  'tws_battle_factor',
  'all_allowed_states',
  'po_annex',
  'po_demand_state',
  'po_add_to_sphere',
  'po_disarmament',
  'po_destroy_forts',
  'po_destroy_naval_bases',
  'po_reparations',
  'po_transfer_provinces',
  'po_remove_prestige',
  'po_make_puppet',
  'po_release_puppet',
  'po_status_quo',
  'po_install_communist_gov_type',
  'po_uninstall_communist_gov_type',
  'po_remove_cores',
  'po_colony',
  'po_gunboat',
  'po_clear_union_sphere',
]);

export const CB_TRIGGER_FIELDS: Readonly<Record<string, ScopeType>> = {
  can_use: 'country',
  is_valid: 'country',
  prerequisites: 'country',
  allowed_countries: 'country',
  allowed_states: 'state',
  allowed_substate_regions: 'state',
  allowed_states_in_crisis: 'state',
};

export const CB_EFFECT_FIELDS: Readonly<Record<string, ScopeType>> = {
  on_add: 'country',
  on_po_accepted: 'country',
};
