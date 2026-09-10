import type { ScopeType } from '../model/symbols.js';

/** Rebel type fields, from the rebel_types.txt header notes. */
export const REBEL_BODY_FIELDS: ReadonlySet<string> = new Set([
  'icon',
  'area',
  'break_alliance_on_win',
  'defection',
  'independence',
  'defect_delay',
  'allow_all_cultures',
  'allow_all_culture_groups',
  'allow_all_religions',
  'allow_all_ideologies',
  'resilient',
  'reinforcing',
  'general',
  'smart',
  'unit_transfer',
  'occupation_mult',
]);

/** Rebel fields holding MTTH-style weight blocks (factor + modifiers).
 *  Scopes are the NCE evaluation contexts (make_reb_* in cultures_parsing.cpp). */
export const REBEL_WEIGHT_FIELDS: Readonly<Record<string, ScopeType>> = {
  will_rise: 'country',
  spawn_chance: 'pop',
  movement_evaluation: 'province',
};

export const REBEL_TRIGGER_FIELDS: Readonly<Record<string, ScopeType>> = {
  demands_enforced_trigger: 'country',
  siege_won_trigger: 'province',
};

export const REBEL_EFFECT_FIELDS: Readonly<Record<string, ScopeType>> = {
  demands_enforced_effect: 'country',
  siege_won_effect: 'province',
};
