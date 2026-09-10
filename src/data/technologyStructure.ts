import type { FieldTable } from '../model/symbols.js';

/**
 * Technology body fields (NCE technology_contents). Remaining keys are
 * modifier values, unit modifier blocks, or goods maps.
 */
export const TECH_SCALAR_FIELDS: FieldTable = {
  area: ['identifier'],
  year: ['number'],
  cost: ['number'],
  unciv_military: ['yesno'],
  unit: ['number'],
  activate_unit: ['unit'],
  activate_building: ['building'],
  colonial_points: ['number'],
  plurality: ['number'],
  shared_prestige: ['number'],
};

/** Technology/invention fields holding `good → number` maps. */
export const TECH_GOODS_MAP_FIELDS: ReadonlySet<string> = new Set([
  'rgo_goods_output',
  'rgo_goods_throughput',
  'rgo_size',
  'factory_goods_output',
  'factory_goods_throughput',
  'factory_goods_input',
]);

/** Valid numeric fields inside a unit stats modifier block (NCE unit_modifier_body). */
export const UNIT_MODIFIER_FIELDS: ReadonlySet<string> = new Set([
  'default_organisation',
  'maximum_speed',
  'build_time',
  'supply_consumption',
  'attack',
  'defence',
  'defense',
  'support',
  'siege',
  'hull',
  'gun_power',
  'torpedo_attack',
  'reconnaissance',
  'fire_range',
  'maneuver',
  'evasion',
  'discipline',
]);

/** Unit-modifier targets that are not unit names. */
export const UNIT_MODIFIER_TARGETS: ReadonlySet<string> = new Set(['army_base', 'navy_base']);

/** Invention effect body scalars beyond modifiers/goods/units (NCE inv_effect). */
export const INVENTION_EFFECT_SCALAR_FIELDS: FieldTable = {
  activate_unit: ['unit'],
  activate_building: ['building'],
  enable_crime: ['crime'],
  gas_attack: ['yesno'],
  gas_defence: ['yesno'],
  gas_defense: ['yesno'],
  shared_prestige: ['number'],
  plurality: ['number'],
  colonial_points: ['number'],
};
