import type { ScopeChangerDef } from '../model/symbols.js';

/**
 * Scope-changing keywords. Allowed origin scopes, produced scope, and valid
 * context (trigger/effect) are extracted from the NCE engine parser
 * (trigger_parsing.cpp / effect_parsing.cpp), excluding its extensions.
 * Dynamic scope keys (country TAGs, province IDs, state/region names, pop
 * types, THIS/FROM) are resolved by the validator, not listed here.
 */
export const SCOPE_CHANGERS: Readonly<Record<string, ScopeChangerDef>> = {
  // Iterators over provinces / cores
  all_core: {
    from: ['country', 'province'],
    produces: { country: 'province', province: 'country' },
    contexts: 'both',
    doc: 'Every core: provinces of a country, or core nations of a province.',
  },
  any_core: {
    from: ['country', 'province'],
    produces: { country: 'province', province: 'country' },
    contexts: 'both',
    doc: 'Any core: provinces of a country, or core nations of a province.',
  },
  any_owned_province: { from: ['country', 'state', 'province'], produces: 'province', contexts: 'trigger', doc: 'Any owned province.' },
  any_owned: { from: ['country', 'state', 'province'], produces: 'province', contexts: 'effect', doc: 'Every owned province (use limit to filter).' },
  random_owned: { from: ['country', 'state', 'province'], produces: 'province', contexts: 'effect', doc: 'One random owned province.' },
  random_province: { from: ['country', 'state', 'province'], produces: 'province', contexts: 'effect', doc: 'One random owned province.' },
  any_neighbor_province: { from: ['province', 'state'], produces: 'province', contexts: 'both', doc: 'Any/every land neighbor province.' },
  random_neighbor_province: { from: ['province'], produces: 'province', contexts: 'effect', doc: 'One random land neighbor.' },
  any_empty_neighbor_province: { from: ['province'], produces: 'province', contexts: 'effect', doc: 'Every uncolonised neighbor province.' },
  random_empty_neighbor_province: { from: ['province'], produces: 'province', contexts: 'effect', doc: 'One random uncolonised neighbor.' },
  sea_zone: { from: ['province'], produces: 'province', contexts: 'both', doc: 'Each adjacent sea tile.' },

  // Iterators over countries
  any_country: { from: ['any'], produces: 'country', contexts: 'effect', doc: 'Every country (effects only; self excluded in decisions).' },
  random_country: { from: ['any'], produces: 'country', contexts: 'effect', doc: 'One random matching country.' },
  any_greater_power: { from: ['any'], produces: 'country', contexts: 'both', doc: 'Any/every Great Power.' },
  any_neighbor_country: { from: ['country', 'pop'], produces: 'country', contexts: 'both', doc: 'Any/every bordering country.' },
  random_neighbor_country: { from: ['country'], produces: 'country', contexts: 'effect', doc: 'One random bordering country.' },
  any_sphere_member: { from: ['country'], produces: 'country', contexts: 'trigger', doc: 'Any/every country in our sphere.' },
  any_substate: { from: ['country'], produces: 'country', contexts: 'trigger', doc: 'Any/every substate of ours.' },
  war_countries: { from: ['country', 'pop'], produces: 'country', contexts: 'trigger', doc: 'Every country at war with the scoped one.' },

  // Iterators over states / pops
  any_state: { from: ['country'], produces: 'state', contexts: 'both', doc: 'Any/every owned state.' },
  random_state: { from: ['country'], produces: 'state', contexts: 'effect', doc: 'One random owned state.' },
  any_pop: { from: ['country', 'province', 'state'], produces: 'pop', contexts: 'both', doc: 'Any/every pop in scope.' },
  random_pop: { from: ['country', 'province', 'state'], produces: 'pop', contexts: 'effect', doc: 'One random matching pop.' },
  poor_strata: { from: ['country', 'province', 'state'], produces: 'pop', contexts: 'effect', doc: 'Every poor-strata pop in scope.' },
  middle_strata: { from: ['country', 'province', 'state'], produces: 'pop', contexts: 'effect', doc: 'Every middle-strata pop in scope.' },
  rich_strata: { from: ['country', 'province', 'state'], produces: 'pop', contexts: 'effect', doc: 'Every rich-strata pop in scope.' },

  // Single-target redirections
  owner: { from: ['province', 'state', 'country'], produces: 'country', contexts: 'both', doc: 'The owning country.' },
  controller: { from: ['province'], produces: 'country', contexts: 'both', doc: 'The controlling country (occupier in war).' },
  location: { from: ['pop', 'province'], produces: 'province', contexts: 'both', doc: "The pop's province." },
  country: { from: ['country', 'province', 'state', 'pop'], produces: 'country', contexts: 'both', doc: 'The owning country (prefer owner).' },
  capital_scope: { from: ['country', 'province', 'pop'], produces: 'province', contexts: 'both', doc: 'The capital province.' },
  state_scope: { from: ['province', 'state', 'pop'], produces: 'state', contexts: 'both', doc: 'The state this province belongs to.' },
  overlord: { from: ['country'], produces: 'country', contexts: 'both', doc: 'Our overlord (if we are a vassal).' },
  sphere_owner: { from: ['country'], produces: 'country', contexts: 'both', doc: 'The sphere leader we belong to.' },
  cultural_union: { from: ['country', 'pop'], produces: 'country', contexts: 'both', doc: 'The cultural union country.' },
  independence: { from: ['any'], produces: 'country', contexts: 'both', doc: 'The nation the scoped rebels fight to establish.' },

  // Crisis (HoD)
  flashpoint_tag_scope: { from: ['state'], produces: 'country', contexts: 'both', doc: 'The nation the flashpoint would liberate.' },
  crisis_state_scope: { from: ['any'], produces: 'state', contexts: 'both', doc: 'The state the crisis is about.' },
  crisis_attacker_scope: { from: ['any'], produces: 'state', contexts: 'trigger', doc: 'The crisis attacker side.' },
  crisis_defender_scope: { from: ['any'], produces: 'state', contexts: 'trigger', doc: 'The crisis defender side.' },
};

/** Implicit back-references; both are country-valued in events/decisions. */
export const IMPLICIT_SCOPES: readonly string[] = ['this', 'from'];

/** Effect keys that keep the current scope (tooltip control only). */
export const EFFECT_PASSTHROUGH_KEYS: ReadonlySet<string> = new Set(['hidden_tooltip']);

/** Brief usage notes for structural fields and control-flow keys, for hover. */
export const KEYWORD_DOCS: Readonly<Record<string, string>> = {
  and: 'All inner conditions must be true (lists already AND).',
  or: 'At least one inner condition must be true.',
  not: 'True when every inner condition is false.',
  limit: 'Filter: conditions the scope must satisfy for the effects to apply.',
  random: 'random = { chance = n ... } — n% chance to run the effects.',
  random_list: 'Weighted choice: random_list = { 50 = { ... } 50 = { ... } }.',
  hidden_tooltip: 'Run the inner effects without showing them in the tooltip.',
  this: 'The scope this block is inside (back-reference).',
  from: 'The scope that triggered this one (e.g. the firing country).',
  country_event: 'A country-scoped event definition.',
  province_event: 'A province-scoped event definition.',
  political_decisions: 'Wrapper block holding decision definitions.',
  trigger: 'Conditions for the event to be eligible.',
  mean_time_to_happen: 'Average months until it fires; modifiers multiply.',
  option: 'One player choice: name (loc key), ai_chance, and effects.',
  immediate: 'Effects that run when the event fires, before any option.',
  ai_chance: 'Relative AI weight for this option; modifiers multiply factor.',
  ai_will_do: 'AI enacts when nonzero: factor times modifier chain.',
  potential: 'Conditions for the decision to be visible.',
  allow: 'Conditions for the decision to be enactable.',
  effect: 'Effects applied when the decision is enacted.',
  modifier: 'modifier = { factor = n <conditions> } — multiplies the base.',
  factor: 'Multiplier applied when the enclosing modifier matches.',
  fire_only_once: 'The event fires at most once per game.',
  is_triggered_only: 'Never fires naturally; must be invoked by id.',
  major: 'Major-event frame, broadcast to other countries; no picture.',
  news: 'Post to the newspaper (needs news_desc_* loc keys).',
  picture: 'Image from gfx/pictures/events|decisions (no extension).',
  id: 'Unique numeric event id — collisions break saves.',
  title: 'Localisation key for the title.',
  desc: 'Localisation key for the body text.',
  name: 'Localisation key shown on the option button.',
  alert: 'alert = no suppresses the decision notification.',
  election: 'Uses the election event frame.',
  allow_multiple_instances: 'The event may run concurrently for several targets.',
  months: 'MTTH base in months.',
  days: 'Delay/base in days.',
  years: 'MTTH base in years.',
  chance: 'Percent chance for the random block.',
  base: 'Base weight before modifiers.',
  peace_order: 'The order CBs are executed in a peace treaty (list of CB names).',
  can_use: 'Conditions to pick this CB; scope is the target, THIS is us.',
  is_valid: 'Conditions for the CB to stay valid during the war.',
  prerequisites: 'Conditions that auto-activate this CB (non-triggered CBs).',
  allowed_states: "Which of the target's states po_demand_state may take.",
  allowed_countries: 'Which third countries this CB may target (e.g. liberate).',
  allowed_substate_regions: 'Which substate regions this CB may take.',
  allowed_states_in_crisis: 'Which states this CB may claim in a crisis.',
  on_add: 'Effects when the war goal is added; scope is the attacker.',
  on_po_accepted: 'Effects when the peace option is enforced.',
  war_name: 'Localisation key for the war name (engine keys like WAR_NAME work).',
  will_rise: "Weight for a general rising, vs. the country's army strength.",
  spawn_chance: 'Weight for a pop to join this rebel type (highest wins).',
  movement_evaluation: 'Weight for a movement to turn into this rebel type.',
  demands_enforced_trigger: "Conditions for the rebels' demands to be enforceable.",
  demands_enforced_effect: 'Effects on the country when rebel demands are enforced.',
  siege_won_trigger: 'Conditions checked when these rebels win a siege.',
  siege_won_effect: 'Effects on the province when these rebels win a siege.',
  on_execute: 'Reform enactment hook: trigger gates it, effect then runs.',
  next_step_only: 'Reform can only move one step at a time.',
  rules: 'Game-rule switches this reform option toggles.',
};
