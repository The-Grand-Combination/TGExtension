import { field, scalar, type SymbolDef } from '../model/symbols.js';

const YESNO = scalar('yesno');
const NUMBER = scalar('number');
const TAG = scalar('country');
const FLAG = scalar('flag');

/** News scripting comparisons (`tags_eq = { 0 2 PLAYER }`, ...): free-form lists. */
function newsComparisonTriggers(): Record<string, SymbolDef> {
  const entries: Record<string, SymbolDef> = {
    length_greater: {
      scopes: ['any'],
      arg: { kind: 'block', fields: {}, open: true },
      doc: 'News scripting: a collected list is longer than n.',
    },
  };
  // `date_greater` is the singular spelling the vanilla news scripts use.
  for (const subject of ['tags', 'values', 'strings', 'dates', 'date']) {
    for (const comparison of ['eq', 'greater', 'match', 'contains']) {
      entries[`${subject}_${comparison}`] = {
        scopes: ['any'],
        arg: { kind: 'block', fields: {}, open: true },
        doc: `News scripting: ${comparison} comparison over collected ${subject}.`,
      };
    }
  }
  return entries;
}

/**
 * Conditions. Names and argument shapes follow the NCE engine parser
 * (trigger_parsing.cpp / trigger_parser_defs.txt, extensions excluded);
 * scope sets are the exact main-slot checks of each parsing function.
 * Dynamic trigger keys (ideology/issue/tech/invention names, reform classes,
 * TAG / province-id / region scope keys) are resolved by the validator.
 */
export const TRIGGERS: Readonly<Record<string, SymbolDef>> = {
  // Broad — valid anywhere
  year: { scopes: ['any'], arg: NUMBER, doc: 'Current year is at least n.' },
  month: { scopes: ['any'], arg: NUMBER, doc: 'Current month (0-11) check.' },
  always: { scopes: ['any'], arg: YESNO, doc: 'Always true (yes) or always false (no).' },
  has_global_flag: { scopes: ['any'], arg: FLAG, doc: 'The global flag has been set.' },
  is_canal_enabled: { scopes: ['any'], arg: NUMBER, doc: 'Canal n built (1 Kiel, 2 Suez, 3 Panama).' },
  check_variable: {
    scopes: ['any'],
    arg: { kind: 'block', fields: { which: field(true, 'variable'), value: field(true, 'number') } },
    doc: 'Variable is at least the given value.',
  },

  // Country — identity and status. Several country triggers also work in
  // province scope: the engine falls back to the owning country.
  ai: { scopes: ['country'], arg: YESNO, doc: 'Country is AI-controlled.' },
  tag: { scopes: ['country', 'province', 'state', 'pop'], arg: TAG, doc: 'Country is exactly this TAG.' },
  // `exists = TAG` works anywhere; only `exists = yes/no` needs country scope.
  exists: { scopes: ['any'], arg: scalar('country', 'yesno'), doc: 'Country exists (TAG or yes/no for current).' },
  civilized: { scopes: ['country', 'province', 'pop'], arg: YESNO, doc: 'Country is civilized.' },
  colonial_nation: { scopes: ['country'], arg: YESNO, doc: 'Country has colonies.' },
  is_greater_power: { scopes: ['country', 'province', 'pop'], arg: YESNO, doc: 'Country is a Great Power.' },
  is_secondary_power: { scopes: ['country', 'pop'], arg: YESNO, doc: 'Country is a secondary power.' },
  is_disarmed: { scopes: ['country', 'pop'], arg: YESNO, doc: 'Disarmed via Cut Down to Size.' },
  is_mobilised: { scopes: ['country'], arg: YESNO, doc: 'Country is mobilised.' },
  is_independant: { scopes: ['country'], arg: YESNO, doc: 'Not a vassal (engine spelling).' },
  is_vassal: { scopes: ['country'], arg: YESNO, doc: 'Country is a vassal/puppet.' },
  is_substate: { scopes: ['country'], arg: YESNO, doc: 'Country is a substate.' },
  is_our_vassal: { scopes: ['country', 'province'], arg: TAG, doc: 'TAG is our vassal.' },
  is_possible_vassal: { scopes: ['country'], arg: TAG, doc: 'TAG can be released as our puppet.' },
  vassal_of: { scopes: ['country', 'province'], arg: TAG, doc: 'We are a puppet of TAG.' },
  substate_of: { scopes: ['country'], arg: TAG, doc: 'We are a substate of TAG.' },
  is_sphere_leader_of: { scopes: ['country'], arg: TAG, doc: 'TAG is in our sphere.' },
  in_sphere: { scopes: ['country'], arg: TAG, doc: 'We are in the sphere of TAG.' },
  part_of_sphere: { scopes: ['country'], arg: YESNO, doc: 'We are in any sphere.' },
  culture_has_union_tag: { scopes: ['country', 'pop'], arg: YESNO, doc: 'Primary culture group has a union TAG.' },
  is_cultural_union: { scopes: ['country', 'pop'], arg: scalar('country', 'yesno'), doc: 'TAG is a cultural union (or we are one).' },
  this_culture_union: { scopes: ['country'], arg: TAG, doc: 'TAG shares our cultural union.' },
  is_culture_group: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('cultureGroup', 'country'), doc: 'Culture group matches (group name or TAG).' },
  primary_culture: { scopes: ['country', 'pop'], arg: scalar('culture', 'country'), doc: 'Primary culture matches.' },
  accepted_culture: { scopes: ['country'], arg: scalar('culture'), doc: 'Culture is accepted here.' },

  // Country — stats / score
  prestige: { scopes: ['country'], arg: scalar('number', 'country'), doc: 'Prestige at least n (or vs THIS/FROM).' },
  plurality: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Plurality is at least n.' },
  badboy: { scopes: ['country'], arg: NUMBER, doc: 'Infamy as a fraction of the limit (0.8 = 20).' },
  industrial_score: { scopes: ['country'], arg: scalar('number', 'country'), doc: 'Industrial score at least n (or vs TAG).' },
  military_score: { scopes: ['country'], arg: scalar('number', 'country'), doc: 'Military score at least n (or vs TAG).' },
  rank: { scopes: ['country'], arg: NUMBER, doc: 'Global rank at least n (1 = top).' },
  literacy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Average literacy at least x (0-1).' },
  money: { scopes: ['country', 'province'], arg: NUMBER, doc: 'Treasury (or pop savings) at least n.' },
  in_default: { scopes: ['country'], arg: scalar('yesno', 'country'), doc: 'Country has defaulted (optionally to TAG).' },
  is_colonial_crisis: { scopes: ['country'], arg: YESNO, doc: 'The current crisis is over uncolonized land (HoD). No localisation key.' },
  is_influence_crisis: { scopes: ['country'], arg: YESNO, doc: 'The current crisis is over influence in a country (HoD). No localisation key.' },
  lost_national: { scopes: ['country'], arg: NUMBER, doc: 'Lost at least x of core provinces.' },
  national_provinces_occupied: { scopes: ['country'], arg: NUMBER, doc: 'Fraction of home provinces occupied.' },
  recruited_percentage: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Fraction of regiments recruited.' },
  total_pops: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Total population at least n.' },

  // Country — politics
  government: { scopes: ['country', 'pop'], arg: scalar('government'), doc: 'Government type matches.' },
  ruling_party: { scopes: ['country'], arg: scalar('string', 'identifier'), doc: 'Ruling party name matches.' },
  ruling_party_ideology: { scopes: ['country', 'province', 'pop'], arg: scalar('ideology'), doc: 'Ruling party ideology matches.' },
  nationalvalue: { scopes: ['country', 'province', 'pop'], arg: scalar('nationalValue'), doc: 'National value matches.' },
  pop_majority_ideology: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('ideology'), doc: 'Majority pop ideology matches.' },
  pop_majority_culture: { scopes: ['country', 'province', 'state'], arg: scalar('culture'), doc: 'Majority pop culture matches.' },
  pop_majority_religion: { scopes: ['country', 'province', 'state'], arg: scalar('religion'), doc: 'Majority pop religion matches.' },
  pop_majority_issue: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('issue'), doc: 'Majority pop issue matches.' },
  political_movement_strength: { scopes: ['country'], arg: NUMBER, doc: 'Any political movement at least x.' },
  social_movement_strength: { scopes: ['country'], arg: NUMBER, doc: 'Any social movement at least x.' },
  political_reform_want: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Political reform desire at least x (0-1).' },
  social_reform_want: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Social reform desire at least x (0-1).' },
  is_next_reform: { scopes: ['country', 'pop'], arg: scalar('reformOption'), doc: 'This reform is the next available step.' },
  is_ideology_enabled: { scopes: ['any'], arg: scalar('ideology'), doc: 'Ideology is unlocked globally.' },
  election: { scopes: ['country'], arg: YESNO, doc: 'An election is ongoing.' },
  revolt_percentage: { scopes: ['country'], arg: NUMBER, doc: 'Fraction of provinces in revolt.' },
  num_of_revolts: { scopes: ['country'], arg: NUMBER, doc: 'States under rebel control at least n.' },
  rebel_power_fraction: { scopes: ['country'], arg: NUMBER, doc: 'Any rebel faction power at least x.' },
  crime_higher_than_education: { scopes: ['country', 'province', 'state', 'pop'], arg: YESNO, doc: 'Admin spending above education spending.' },
  civilization_progress: { scopes: ['country'], arg: NUMBER, doc: 'Westernisation progress at least x (0-1).' },
  revanchism: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Revanchism at least x.' },
  upper_house: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { ideology: field(true, 'ideology'), value: field(true, 'number') } },
    doc: 'Upper house share of an ideology at least x (0-1).',
  },

  // Country — spending sliders (some also valid in province scope)
  administration_spending: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Admin spending slider at least x.' },
  crime_fighting: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Crime fighting funding at least x.' },
  education_spending: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Education spending at least x.' },
  military_spending: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Military spending at least x.' },
  social_spending: { scopes: ['country', 'province', 'pop'], arg: NUMBER, doc: 'Social spending at least x.' },
  poor_tax: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Poor strata tax at least x.' },
  middle_tax: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Middle strata tax at least x.' },
  rich_tax: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Rich strata tax at least x.' },
  rich_tax_above_poor: { scopes: ['country'], arg: YESNO, doc: 'Rich tax is above poor tax.' },

  // Country — strata needs and mood
  poor_strata_life_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Poor life needs satisfaction (0-1).' },
  poor_strata_everyday_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Poor everyday needs satisfaction.' },
  poor_strata_luxury_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Poor luxury needs satisfaction.' },
  middle_strata_life_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Middle life needs satisfaction.' },
  middle_strata_everyday_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Middle everyday needs satisfaction.' },
  middle_strata_luxury_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Middle luxury needs satisfaction.' },
  rich_strata_life_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Rich life needs satisfaction.' },
  rich_strata_everyday_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Rich everyday needs satisfaction.' },
  rich_strata_luxury_needs: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Rich luxury needs satisfaction.' },
  poor_strata_militancy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Poor strata militancy at least x.' },
  middle_strata_militancy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Middle strata militancy at least x.' },
  rich_strata_militancy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Rich strata militancy at least x.' },

  // Country — diplomacy
  relation: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { who: field(true, 'country'), value: field(true, 'number') } },
    doc: 'Relations with TAG at least the value.',
  },
  diplomatic_influence: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { who: field(true, 'country'), value: field(true, 'number') } },
    doc: 'Influence over TAG at least the value.',
  },
  alliance_with: { scopes: ['country'], arg: TAG, doc: 'Allied with TAG.' },
  truce_with: { scopes: ['country'], arg: TAG, doc: 'Under truce with TAG.' },
  military_access: { scopes: ['country'], arg: TAG, doc: 'TAG has military access to us.' },
  neighbour: { scopes: ['country'], arg: TAG, doc: 'We border TAG.' },
  casus_belli: { scopes: ['country'], arg: TAG, doc: 'We have any active CB on TAG.' },
  constructing_cb_type: { scopes: ['country'], arg: scalar('cbType'), doc: 'Currently fabricating this CB.' },
  constructing_cb_progress: { scopes: ['country'], arg: NUMBER, doc: 'CB fabrication progress (0-1).' },
  war: { scopes: ['country', 'pop'], arg: YESNO, doc: 'Country is at war.' },
  war_with: { scopes: ['country'], arg: TAG, doc: 'At war with TAG.' },
  war_exhaustion: { scopes: ['country', 'province', 'pop'], arg: NUMBER, doc: 'War exhaustion at least x.' },
  war_score: { scopes: ['country'], arg: NUMBER, doc: 'Any current war score at least x.' },
  stronger_army_than: { scopes: ['country'], arg: TAG, doc: 'Our army is stronger than TAG.' },
  brigades_compare: { scopes: ['country', 'province'], arg: NUMBER, doc: 'Brigade count at least x times the target.' },
  crisis_exist: { scopes: ['any'], arg: YESNO, doc: 'A crisis is ongoing (HoD).' },
  involved_in_crisis: { scopes: ['country', 'pop'], arg: YESNO, doc: 'We are involved in the crisis (HoD).' },
  is_claim_crisis: { scopes: ['any'], arg: YESNO, doc: 'Current crisis is a claim crisis (HoD).' },
  is_liberation_crisis: { scopes: ['any'], arg: YESNO, doc: 'Current crisis is a liberation crisis.' },
  has_cultural_sphere: { scopes: ['country'], arg: YESNO, doc: 'Sphere member shares our culture group.' },
  great_wars_enabled: { scopes: ['any'], arg: YESNO, doc: 'Great wars are unlocked.' },
  world_wars_enabled: { scopes: ['any'], arg: YESNO, doc: 'World wars are unlocked.' },

  // Country — counts
  num_of_allies: { scopes: ['country'], arg: NUMBER, doc: 'Ally count at least n.' },
  num_of_cities: { scopes: ['country'], arg: scalar('number', 'country'), doc: 'Owned province count at least n (or vs THIS/FROM).' },
  num_of_ports: { scopes: ['country'], arg: NUMBER, doc: 'Port count at least n.' },
  num_of_substates: { scopes: ['country'], arg: NUMBER, doc: 'Substate count at least n.' },
  num_of_vassals: { scopes: ['country'], arg: NUMBER, doc: 'Vassal count at least n.' },
  num_of_vassals_no_substates: { scopes: ['country'], arg: NUMBER, doc: 'Vassals excluding substates at least n.' },
  number_of_states: { scopes: ['country'], arg: NUMBER, doc: 'Owned state count at least n.' },
  total_amount_of_divisions: { scopes: ['country'], arg: NUMBER, doc: 'Division count at least n.' },
  total_amount_of_ships: { scopes: ['country'], arg: NUMBER, doc: 'Ship count at least n.' },
  total_num_of_ports: { scopes: ['country'], arg: NUMBER, doc: 'Total port count at least n.' },
  total_sunk_by_us: { scopes: ['any'], arg: NUMBER, doc: 'Enemy ships sunk at least n.' },

  // Country — territory and cores
  owns: { scopes: ['country', 'province'], arg: scalar('province'), doc: 'We own this province.' },
  controls: { scopes: ['country'], arg: scalar('province'), doc: 'We control this province.' },
  capital: { scopes: ['country'], arg: scalar('province'), doc: 'Our capital is this province.' },
  is_core: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('province', 'country'), doc: 'Core check (province id or TAG).' },
  have_core_in: { scopes: ['country'], arg: TAG, doc: 'We have cores on TAG provinces.' },
  has_unclaimed_cores: { scopes: ['country'], arg: YESNO, doc: 'Core provinces we do not own exist.' },

  // Country — misc
  invention: { scopes: ['country', 'province', 'pop'], arg: scalar('invention'), doc: 'Invention has activated.' },
  has_country_flag: { scopes: ['country', 'province', 'state', 'pop'], arg: FLAG, doc: 'The country flag is set.' },
  has_country_modifier: { scopes: ['country', 'province'], arg: scalar('modifier'), doc: 'The country modifier is active.' },
  has_recently_lost_war: { scopes: ['country', 'pop'], arg: YESNO, doc: 'Lost a war in the last 5 years.' },
  produces: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('good'), doc: 'Produces the good (RGO or factory).' },
  big_producer: { scopes: ['country'], arg: scalar('good'), doc: 'Major world producer of the good.' },
  can_build_factory_in_capital_state: { scopes: ['country'], arg: scalar('building'), doc: 'Factory type buildable in capital state.' },
  can_nationalize: { scopes: ['country'], arg: YESNO, doc: 'Foreign investment can be seized.' },
  can_create_vassals: { scopes: ['country'], arg: YESNO, doc: 'A releasable nation exists.' },
  has_leader: { scopes: ['country'], arg: scalar('string'), doc: 'Has a leader with this name.' },
  unit_has_leader: { scopes: ['province'], arg: YESNO, doc: 'Any unit has a leader.' },
  unit_in_battle: { scopes: ['province'], arg: YESNO, doc: 'Any unit is fighting.' },
  blockade: { scopes: ['country'], arg: NUMBER, doc: 'Blockaded fraction at least x.' },

  // Province
  province_id: { scopes: ['province'], arg: scalar('province'), doc: 'Province is exactly this id.' },
  state_id: { scopes: ['province', 'state'], arg: scalar('province'), doc: 'Province belongs to this state (by id).' },
  region: { scopes: ['province', 'state', 'pop'], arg: scalar('stateRegion'), doc: 'Province is in this region/state.' },
  continent: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('continent'), doc: 'On this continent.' },
  terrain: { scopes: ['province', 'pop'], arg: scalar('terrain'), doc: 'Province terrain type matches.' },
  owned_by: { scopes: ['province', 'state'], arg: TAG, doc: 'Province is owned by TAG.' },
  controlled_by: { scopes: ['province'], arg: TAG, doc: 'Province is controlled by TAG.' },
  controlled_by_rebels: { scopes: ['province'], arg: YESNO, doc: 'Province is rebel-controlled.' },
  is_capital: { scopes: ['province'], arg: YESNO, doc: 'Province is a national capital.' },
  is_state_capital: { scopes: ['province', 'pop'], arg: YESNO, doc: 'Province is a state capital.' },
  is_coastal: { scopes: ['province', 'state'], arg: YESNO, doc: 'Province touches water (even lakes).' },
  port: { scopes: ['province'], arg: YESNO, doc: 'Province has (or could have) a port.' },
  is_overseas: { scopes: ['province', 'state', 'pop'], arg: YESNO, doc: 'Province is overseas.' },
  is_colonial: { scopes: ['country', 'province', 'state', 'pop'], arg: YESNO, doc: 'Province/state is colonial.' },
  empty: { scopes: ['province', 'state'], arg: YESNO, doc: 'Province is uncolonised.' },
  is_blockaded: { scopes: ['province'], arg: YESNO, doc: 'Province is blockaded.' },
  has_culture_core: { scopes: ['province', 'pop'], arg: YESNO, doc: 'A core nation shares the pop culture.' },
  has_pop_type: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('popType'), doc: 'Any pop of this type present.' },
  has_factories: { scopes: ['country', 'state'], arg: YESNO, doc: 'State has factories.' },
  can_build_factory: { scopes: ['country', 'province', 'pop'], arg: YESNO, doc: 'Factories can be built here.' },
  can_build_in_province: {
    scopes: ['province'],
    arg: { kind: 'block', fields: { building: field(true, 'building') }, open: true },
    doc: 'The building can be built in this province.',
  },
  has_building: { scopes: ['province', 'state'], arg: scalar('building'), doc: "Building present ('factory' = any factory)." },
  has_crime: { scopes: ['province'], arg: scalar('crime'), doc: 'Province has this crime.' },
  has_flashpoint: { scopes: ['state', 'province'], arg: YESNO, doc: 'State or province has flashpoint tension (HoD). No localisation key.' },
  flashpoint_tension: { scopes: ['province', 'state'], arg: NUMBER, doc: 'Flashpoint tension at least x (HoD).' },
  has_national_minority: { scopes: ['country', 'province', 'state'], arg: YESNO, doc: 'Pops of multiple cultures present.' },
  minorities: { scopes: ['country', 'province', 'state'], arg: YESNO, doc: 'Non-accepted culture pops present.' },
  is_primary_culture: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('yesno', 'country', 'culture'), doc: 'Majority/pop culture is the primary one.' },
  is_accepted_culture: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('yesno', 'country', 'culture'), doc: 'Majority/pop culture is accepted.' },
  is_state_religion: { scopes: ['province', 'state', 'pop'], arg: YESNO, doc: 'Matches the state religion.' },
  has_province_flag: { scopes: ['province'], arg: FLAG, doc: 'The province flag is set.' },
  has_province_modifier: { scopes: ['province'], arg: scalar('modifier'), doc: 'The province modifier is active.' },
  has_recent_imigration: { scopes: ['province'], arg: NUMBER, doc: 'Received immigrants in the last n days.' },
  has_empty_adjacent_province: { scopes: ['province'], arg: YESNO, doc: 'Borders an uncolonised province.' },
  has_empty_adjacent_state: { scopes: ['province', 'state'], arg: YESNO, doc: 'Borders an uncolonised state.' },
  country_units_in_province: { scopes: ['province'], arg: TAG, doc: 'TAG has units in this province.' },
  country_units_in_state: { scopes: ['state'], arg: TAG, doc: 'TAG has units in this state.' },
  units_in_province: { scopes: ['province'], arg: scalar('number', 'country'), doc: 'At least n units present (or THIS/FROM has units here).' },
  province_control_days: { scopes: ['province'], arg: NUMBER, doc: 'Controlled by non-owner for n days.' },
  life_rating: { scopes: ['province', 'state'], arg: NUMBER, doc: 'Life rating at least n.' },
  average_consciousness: { scopes: ['country', 'province', 'state'], arg: NUMBER, doc: 'Average consciousness at least x.' },
  average_militancy: { scopes: ['country', 'province', 'state'], arg: NUMBER, doc: 'Average militancy at least x.' },
  pop_militancy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Pop militancy at least x.' },
  unemployment: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Unemployment at least x (0-1).' },
  unemployment_by_type: {
    scopes: ['country', 'province', 'state', 'pop'],
    arg: { kind: 'block', fields: { type: field(true, 'popType'), value: field(true, 'number') } },
    doc: 'Unemployment of a pop type at least x.',
  },
  work_available: {
    scopes: ['country', 'province', 'state'],
    arg: { kind: 'block', fields: { worker: field(true, 'popType') } },
    doc: 'The pop type could be employed here.',
  },
  trade_goods: { scopes: ['province'], arg: scalar('good'), doc: 'RGO produces this good.' },

  // Pop
  culture: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('culture'), doc: 'Province majority culture matches.' },
  has_pop_culture: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('culture', 'country'), doc: "The pop's own culture matches." },
  has_pop_religion: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('religion', 'country'), doc: "The pop's own religion matches." },
  religion: { scopes: ['country', 'pop'], arg: scalar('religion'), doc: 'State/pop religion matches.' },
  strata: { scopes: ['pop'], arg: scalar('strata'), doc: 'Pop strata is poor/middle/rich.' },
  type: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('popType'), doc: 'Pop is of this type.' },
  pop_type: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('popType'), doc: 'Pop is of this type (alias of type).' },
  consciousness: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Consciousness at least x.' },
  militancy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Militancy at least x.' },
  cash_reserves: { scopes: ['pop'], arg: NUMBER, doc: 'Pop cash vs daily needs at least x%.' },
  life_needs: { scopes: ['pop'], arg: NUMBER, doc: 'Life needs satisfaction at least x.' },
  everyday_needs: { scopes: ['pop'], arg: NUMBER, doc: 'Everyday needs satisfaction at least x.' },
  luxury_needs: { scopes: ['pop'], arg: NUMBER, doc: 'Luxury needs satisfaction at least x.' },
  agree_with_ruling_party: { scopes: ['pop'], arg: NUMBER, doc: 'Pop agrees with ruling party (0-1).' },
  political_movement: { scopes: ['pop'], arg: YESNO, doc: 'Pop is in a political movement.' },
  social_movement: { scopes: ['pop'], arg: YESNO, doc: 'Pop is in a social movement.' },

  // State (also seen in country scope in on_action state-conversion events)
  is_slave: { scopes: ['country', 'province', 'state', 'pop'], arg: YESNO, doc: 'State is a slave state.' },

  // From the NCE parser rules (previously missing here)
  is_culture: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('culture'), doc: 'Culture matches (alias of culture).' },
  culture_group: { scopes: ['country', 'province', 'state', 'pop'], arg: scalar('cultureGroup'), doc: 'Culture group matches.' },
  neighbor: { scopes: ['country'], arg: TAG, doc: 'We border TAG (alias of neighbour).' },
  low_tax: { scopes: ['country', 'pop'], arg: NUMBER, doc: 'Poor strata tax at least x (alias of poor_tax).' },
  treasury: { scopes: ['country', 'province'], arg: NUMBER, doc: 'Treasury holds at least n cash.' },
  is_subject: { scopes: ['country'], arg: YESNO, doc: 'Country is a vassal or substate.' },
  corruption: { scopes: ['country'], arg: NUMBER, doc: 'Corruption at least x.' },
  has_faction: { scopes: ['country', 'pop'], arg: scalar('identifier'), doc: 'A rebel faction of this type is active (pop: is member).' },
  nationalism: { scopes: ['province'], arg: NUMBER, doc: 'Nationalism (separatism time) at least n.' },
  tech_school: { scopes: ['country'], arg: scalar('modifier'), doc: 'Tech school matches.' },
  constructing_cb: { scopes: ['country'], arg: scalar('cbType'), doc: 'Currently fabricating this CB type.' },
  mobilisation_size: { scopes: ['country'], arg: NUMBER, doc: 'Mobilisation size at least x.' },
  crisis_temperature: { scopes: ['any'], arg: NUMBER, doc: 'Crisis temperature at least n (HoD).' },
  is_releasable_vassal: { scopes: ['any'], arg: TAG, doc: 'TAG (or FROM) can be released as a vassal.' },
  trade_goods_in_state: { scopes: ['province', 'state'], arg: scalar('good'), doc: 'The state produces this good.' },
  constructing_cb_discovered: { scopes: ['country'], arg: YESNO, doc: 'Our CB fabrication has been discovered.' },
  someone_can_form_union_tag: { scopes: ['any'], arg: TAG, doc: 'A country able to form this union TAG exists.' },
  pop_unemployment: {
    scopes: ['country', 'province', 'state', 'pop'],
    arg: { kind: 'block', fields: { type: field(true, 'popType'), value: field(true, 'number') } },
    doc: 'Unemployment of a pop type at least x (0-1).',
  },
  party_loyalty: {
    scopes: ['country', 'province'],
    arg: {
      kind: 'block',
      fields: {
        value: field(true, 'number'),
        ideology: field(true, 'ideology'),
        province_id: field(false, 'province'),
      },
    },
    doc: 'Party loyalty toward an ideology at least the value.',
  },
  can_build_railway_in_capital: {
    scopes: ['country'],
    arg: {
      kind: 'block',
      fields: {
        in_whole_capital_state: field(false, 'yesno'),
        limit_to_world_greatest_level: field(false, 'yesno'),
      },
    },
    doc: 'A railway level can be built in the capital (state).',
  },
  can_build_fort_in_capital: {
    scopes: ['country'],
    arg: {
      kind: 'block',
      fields: {
        in_whole_capital_state: field(false, 'yesno'),
        limit_to_world_greatest_level: field(false, 'yesno'),
      },
    },
    doc: 'A fort level can be built in the capital (state).',
  },
  has_news_flag: { scopes: ['country', 'province', 'state', 'pop'], arg: FLAG, doc: 'News flag is set (news scripting).' },
  news_printing_count: { scopes: ['any'], arg: NUMBER, doc: 'Times this news style was printed (news scripting).' },
  ...newsComparisonTriggers(),
  party_name: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { ideology: field(false, 'ideology'), name: field(false, 'string') } },
    doc: 'An active party (of the ideology) has this name.',
  },
  party_position: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { ideology: field(false, 'ideology'), position: field(false, 'identifier') } },
    doc: 'An active party (of the ideology) holds this issue position.',
  },
};
