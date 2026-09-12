import { exploitField, field, scalar, type SymbolDef } from '../model/symbols.js';

const YESNO = scalar('yesno');
const NUMBER = scalar('number');
const TAG = scalar('country');
const FLAG = scalar('flag');

const EVENT_CALL: SymbolDef['arg'] = {
  kind: 'either',
  scalar: scalar('event'),
  block: { kind: 'block', fields: { id: field(true, 'event'), days: field(false, 'number') } },
};

/**
 * Effects. Names and argument shapes follow the NCE engine parser
 * (effect_parsing.cpp / effect_parser_defs.txt, extensions excluded);
 * scope sets are the exact main-slot checks of each parsing function.
 * Control-flow effects (`random`, `random_list`, `hidden_tooltip`) and
 * dynamic effect keys (goods as stockpile, pop types as targets,
 * TAG/province/state scope keys) are handled by the validator.
 */
export const EFFECTS: Readonly<Record<string, SymbolDef>> = {
  // Pop — List_of_effects.md baseline is pop scope; widenings below are only
  // those the TGC corpus proves the engine accepts (see comments).
  // consciousness at country scope: corpus 3x (applies to every pop).
  consciousness: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Change consciousness of targeted pops by n.' },
  militancy: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Change militancy of targeted pops by n.' },
  // scaled_* at country/state scope: corpus 96x country, 4x state.
  scaled_consciousness: {
    scopes: ['pop', 'province', 'state', 'country'],
    arg: {
      kind: 'block',
      fields: {
        factor: field(true, 'number'),
        ideology: field(false, 'ideology'),
        issue: field(false, 'issue'),
      },
      // `<issue class> = <position>` is the other way to name the issue.
      reformClassKeys: true,
    },
    doc: 'Consciousness change scaled by ideology/issue support.',
  },
  scaled_militancy: {
    scopes: ['pop', 'province', 'state', 'country'],
    arg: {
      kind: 'block',
      fields: {
        factor: field(true, 'number'),
        ideology: field(false, 'ideology'),
        issue: field(false, 'issue'),
      },
      // `<issue class> = <position>` is the other way to name the issue.
      reformClassKeys: true,
    },
    doc: 'Militancy change scaled by ideology/issue support.',
  },
  ideology: {
    scopes: ['pop'],
    arg: { kind: 'block', fields: { factor: field(true, 'number'), value: field(true, 'ideology') } },
    doc: 'Shift pop support toward an ideology.',
  },
  // dominant_issue / move_issue_percentage at country scope: corpus 4x / 34x.
  dominant_issue: {
    scopes: ['pop', 'country'],
    arg: { kind: 'block', fields: { factor: field(true, 'number'), value: field(true, 'issue') } },
    doc: 'Shift pop support toward an issue.',
  },
  move_issue_percentage: {
    scopes: ['country', 'province', 'state', 'pop'],
    arg: {
      kind: 'block',
      fields: {
        from: field(true, 'issue'),
        to: field(true, 'issue'),
        value: field(true, 'number'),
      },
    },
    doc: 'Move support share between two issues.',
  },
  literacy: { scopes: ['pop'], arg: NUMBER, doc: 'Add n to pop literacy (-0.10 = -10%).' },
  // In country scope `money` changes the treasury (legacy alias of `treasury`).
  money: { scopes: ['country', 'province', 'pop'], arg: NUMBER, doc: 'Change pop savings (or treasury at country scope).' },
  pop_type: { scopes: ['pop'], arg: scalar('popType'), doc: 'Convert the pop to another type.' },
  reduce_pop: { scopes: ['country', 'province', 'state', 'pop'], arg: NUMBER, doc: 'Multiply pop size by n (above 1 grows it).' },
  move_pop: { scopes: ['pop'], arg: scalar('province'), doc: 'Relocate the pop to a province.' },
  assimilate: { scopes: ['province', 'state', 'pop'], arg: YESNO, doc: 'Convert all pops here to the primary culture.' },

  // Province (in country scope these take a province id or apply to every province)
  add_core: { scopes: ['country', 'province', 'state'], arg: scalar('country', 'province'), doc: 'Add a core (TAG here, or province id from country).' },
  remove_core: { scopes: ['country', 'province', 'state'], arg: scalar('country', 'province'), doc: 'Remove a core (THIS works, FROM does not).' },
  add_province_modifier: {
    scopes: ['province', 'state'],
    arg: { kind: 'block', fields: { name: field(true, 'modifier'), duration: field(true, 'number') } },
    doc: 'Add a province modifier for n days (-1 = forever).',
  },
  remove_province_modifier: { scopes: ['province', 'state'], arg: scalar('modifier'), doc: 'Remove the province modifier (silent if absent).' },
  change_controller: { scopes: ['province', 'state'], arg: TAG, doc: 'Change the controller (not the owner).' },
  change_province_name: { scopes: ['province'], arg: scalar('string'), doc: 'Rename the province.' },
  change_region_name: { scopes: ['state', 'province'], arg: scalar('string'), doc: 'Rename the state (use alone in its scope).' },
  flashpoint_tension: { scopes: ['state', 'province'], arg: NUMBER, doc: 'Change flashpoint tension (HoD).' },
  fort: { scopes: ['province'], arg: NUMBER, doc: 'Change fort level by n.' },
  infrastructure: { scopes: ['province'], arg: NUMBER, doc: 'Change railroad level by n.' },
  railroad: { scopes: ['province'], arg: NUMBER, doc: 'Change railroad level by n.' },
  naval_base: { scopes: ['province'], arg: NUMBER, doc: 'Change naval base level by n.' },
  bank: { scopes: ['province'], arg: NUMBER, doc: 'Change bank level by n.' },
  university: { scopes: ['province'], arg: NUMBER, doc: 'Change university level by n.' },
  add_crime: { scopes: ['province'], arg: scalar('crime'), doc: 'Add this crime to the province.' },
  life_rating: { scopes: ['province', 'state'], arg: NUMBER, doc: 'Change life rating by n.' },
  rgo_size: { scopes: ['province'], arg: NUMBER, doc: 'Change RGO size by n.' },
  trade_goods: { scopes: ['province'], arg: scalar('good'), doc: 'Change the RGO output good.' },
  // In country scope also takes a province id: that province joins the country.
  secede_province: { scopes: ['province', 'state'], arg: scalar('country', 'province'), doc: 'Transfer province (to TAG, or id to this country).' },
  sub_unit: {
    scopes: ['country', 'province'],
    arg: {
      kind: 'block',
      fields: { type: field(true, 'unit'), value: field(true, 'number', 'identifier') },
    },
    doc: "Spawn a unit ('current' = in this province).",
  },

  treasury: { scopes: ['country', 'province'], arg: NUMBER, doc: 'Change treasury cash by n.' },
  add_tax_relative_income: { scopes: ['country'], arg: NUMBER, doc: 'Add cash equal to n × max-tax income.' },
  prestige: { scopes: ['country'], arg: NUMBER, doc: 'Change prestige by n.' },
  prestige_factor: { scopes: ['country'], arg: NUMBER, doc: 'Multiply current prestige by n.' },
  badboy: { scopes: ['country'], arg: NUMBER, doc: 'Change infamy by n.' },
  plurality: { scopes: ['country'], arg: NUMBER, doc: 'Change plurality by n.' },
  war_exhaustion: { scopes: ['country'], arg: NUMBER, doc: 'Change war exhaustion by n.' },
  civilized: { scopes: ['country'], arg: YESNO, doc: 'Set civilised status.' },
  primary_culture: { scopes: ['country'], arg: scalar('culture', 'country'), doc: 'Change the primary culture.' },
  add_accepted_culture: { scopes: ['country'], arg: scalar('culture'), doc: "Add an accepted culture ('union' = union tag's)." },
  remove_accepted_culture: { scopes: ['country'], arg: scalar('culture'), doc: 'Remove an accepted culture.' },
  religion: { scopes: ['country'], arg: scalar('religion'), doc: 'Change the state religion.' },
  nationalvalue: { scopes: ['country', 'province'], arg: scalar('nationalValue'), doc: 'Set the national value.' },
  capital: { scopes: ['country'], arg: scalar('province'), doc: 'Move the capital to this province.' },
  add_country_modifier: {
    scopes: ['country', 'province'],
    arg: { kind: 'block', fields: { name: field(true, 'modifier'), duration: field(true, 'number') } },
    doc: 'Add a country modifier for n days (-1 = forever).',
  },
  remove_country_modifier: { scopes: ['country'], arg: scalar('modifier'), doc: 'Remove the country modifier (silent if absent).' },
  add_crisis_interest: { scopes: ['country'], arg: YESNO, doc: 'Become interested in the crisis (HoD).' },
  add_crisis_temperature: { scopes: ['any'], arg: NUMBER, doc: 'Change crisis temperature (HoD).' },
  research_points: { scopes: ['country'], arg: NUMBER, doc: 'Add research points.' },
  years_of_research: { scopes: ['country'], arg: NUMBER, doc: 'Add RPs equal to n years of output.' },
  leadership: { scopes: ['country'], arg: NUMBER, doc: 'Add leadership points.' },
  tech_school: { scopes: ['country'], arg: scalar('modifier'), doc: 'Set the tech school / nation title.' },
  enable_canal: { scopes: ['any'], arg: NUMBER, doc: 'Enable canal n (1 Kiel, 2 Suez, 3 Panama).' },
  great_wars_enabled: { scopes: ['any'], arg: YESNO, doc: 'Unlock (or lock) great wars.' },
  world_wars_enabled: { scopes: ['any'], arg: YESNO, doc: 'Unlock (or lock) world wars.' },
  remove_random_economic_reforms: { scopes: ['country'], arg: NUMBER, doc: 'Undo n random economic reforms (unciv).' },
  remove_random_military_reforms: { scopes: ['country'], arg: NUMBER, doc: 'Undo n random military reforms (unciv).' },
  build_railway_in_capital: {
    scopes: ['country'],
    // `= 4` builds up to that level, capped by tech; `= yes` and the block form also parse.
    arg: { kind: 'either', scalar: scalar('yesno', 'number'), block: { kind: 'block', fields: {}, open: true } },
    doc: 'Build railroad in the capital, up to a level or as a yes/no. The engine stops reading the rest of the decision after it.',
  },
  build_fort_in_capital: {
    scopes: ['country'],
    // `= 4` builds up to that level, capped by tech; `= yes` and the block form also parse.
    arg: { kind: 'either', scalar: scalar('yesno', 'number'), block: { kind: 'block', fields: {}, open: true } },
    doc: 'Build a fort in the capital, up to a level or as a yes/no. The engine stops reading the rest of the decision after it.',
  },
  activate_technology: { scopes: ['country'], arg: scalar('technology'), doc: 'Grant a technology out of order (AHD).' },
  build_factory_in_capital_state: { scopes: ['country'], arg: scalar('building'), doc: 'Build this factory in the capital state.' },
  nationalize: { scopes: ['country'], arg: YESNO, doc: 'Seize all foreign-invested factories.' },
  define_general: {
    scopes: ['country'],
    arg: {
      kind: 'block',
      fields: {
        name: field(true, 'string'),
        personality: field(false, 'trait'),
        background: field(false, 'trait'),
      },
    },
    doc: 'Create a named general with traits.',
  },
  define_admiral: {
    scopes: ['country'],
    arg: {
      kind: 'block',
      fields: {
        name: field(true, 'string'),
        personality: field(false, 'trait'),
        background: field(false, 'trait'),
      },
    },
    doc: 'Create a named admiral with traits.',
  },
  kill_leader: { scopes: ['country'], arg: scalar('string', 'number'), doc: 'Kill a leader by name.' },

  government: { scopes: ['country'], arg: scalar('government'), doc: 'Change the government type.' },
  ruling_party_ideology: { scopes: ['country'], arg: scalar('ideology'), doc: 'Put the first party of this ideology in power.' },
  political_reform: { scopes: ['country', 'province'], arg: scalar('reformOption'), doc: 'Enact this political reform option.' },
  social_reform: { scopes: ['country', 'province'], arg: scalar('reformOption'), doc: 'Enact this social reform option.' },
  military_reform: { scopes: ['country'], arg: scalar('reformOption'), doc: 'Enact this military reform (AHD).' },
  economic_reform: { scopes: ['country'], arg: scalar('reformOption'), doc: 'Enact this economic reform (AHD).' },
  election: { scopes: ['country'], arg: YESNO, doc: 'Start an early election.' },
  enable_ideology: { scopes: ['any'], arg: scalar('ideology'), doc: 'Unlock an ideology globally.' },
  is_slave: { scopes: ['province', 'state', 'pop'], arg: YESNO, doc: 'Set slave-state status.' },
  upper_house: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { ideology: field(true, 'ideology'), value: field(true, 'number') } },
    doc: 'Shift upper house composition toward an ideology.',
  },

  relation: {
    scopes: ['country', 'province'],
    // who/tag/with and value/relation are engine-accepted aliases.
    arg: {
      kind: 'block',
      fields: {
        who: field(false, 'country'),
        tag: field(false, 'country'),
        with: field(false, 'country'),
        value: field(false, 'number'),
        relation: field(false, 'number'),
      },
    },
    doc: 'Change relations with TAG by the value.',
  },
  modify_relation: {
    scopes: ['country', 'province'],
    arg: {
      kind: 'block',
      fields: {
        who: field(false, 'country'),
        tag: field(false, 'country'),
        with: field(false, 'country'),
        value: field(false, 'number'),
        relation: field(false, 'number'),
      },
    },
    doc: 'Change relations with TAG by the value (alias of relation).',
  },
  diplomatic_influence: {
    scopes: ['country', 'province'],
    arg: { kind: 'block', fields: { who: field(true, 'country'), value: field(true, 'number') } },
    doc: 'Change influence over TAG by the value.',
  },
  add_casus_belli: {
    scopes: ['country'],
    arg: {
      kind: 'block',
      fields: {
        target: field(true, 'country'),
        type: field(true, 'cbType'),
        months: field(false, 'number'),
      },
      open: true,
    },
    doc: 'Give the target a CB against this country.',
  },
  casus_belli: {
    scopes: ['country'],
    arg: {
      kind: 'block',
      fields: {
        target: field(true, 'country'),
        type: field(true, 'cbType'),
        months: field(false, 'number'),
      },
      open: true,
    },
    doc: 'Give this country a CB against the target.',
  },
  war: {
    scopes: ['country'],
    arg: {
      kind: 'either',
      scalar: TAG,
      // `target` is optional: without it the war targets FROM.
      block: {
        kind: 'block',
        fields: {
          target: exploitField(
            false,
            'Tricking the AI into joining your war — use this exploit with caution.',
            'country',
          ),
          attacker_goal: field(false, 'block'),
          defender_goal: field(false, 'block'),
          call_ally: field(false, 'yesno'),
        },
      },
    },
    doc: 'Declare war (block form sets goals and allies).',
  },
  end_war: { scopes: ['country'], arg: TAG, doc: 'End the war with TAG (no truce, no penalty).' },
  create_alliance: { scopes: ['country'], arg: TAG, doc: 'Form an alliance with TAG.' },
  leave_alliance: { scopes: ['country'], arg: TAG, doc: 'Break the alliance with TAG.' },
  military_access: { scopes: ['country'], arg: TAG, doc: 'Gain military access through TAG.' },
  end_military_access: { scopes: ['country'], arg: TAG, doc: 'Cancel military access through TAG.' },
  create_vassal: { scopes: ['country'], arg: TAG, doc: 'Make TAG our vassal.' },
  release_vassal: { scopes: ['country', 'province'], arg: TAG, doc: 'Free a vassal, or release TAG as one.' },
  release: { scopes: ['country'], arg: TAG, doc: 'Release TAG as an independent nation.' },
  inherit: { scopes: ['country'], arg: TAG, doc: 'Annex all of TAG.' },
  annex_to: { scopes: ['country', 'province'], arg: TAG, doc: 'Annex this country into TAG.' },
  neutrality: { scopes: ['country'], arg: YESNO, doc: 'Drop all alliances and free satellites.' },

  // Function / control flow (random and random_list are walker-handled)
  // In province scope, country_event/set_country_flag act on the owner.
  country_event: { scopes: ['country', 'province'], arg: EVENT_CALL, doc: 'Fire a country event (optionally after n days).' },
  province_event: { scopes: ['province'], arg: EVENT_CALL, doc: 'Fire a province event.' },
  change_tag: { scopes: ['country'], arg: scalar('country', 'identifier'), doc: "Switch to TAG ('culture' = union tag)." },
  change_tag_no_core_switch: { scopes: ['country'], arg: TAG, doc: 'Switch the player to TAG, cores untouched.' },
  set_country_flag: { scopes: ['country', 'province', 'pop'], arg: FLAG, doc: 'Set a country flag.' },
  clr_country_flag: { scopes: ['country'], arg: FLAG, doc: 'Clear a country flag.' },
  set_province_flag: { scopes: ['province'], arg: FLAG, doc: 'Set a province flag. Broken in the engine — do not use.' },
  clr_province_flag: { scopes: ['province'], arg: FLAG, doc: 'Clear a province flag.' },
  set_global_flag: { scopes: ['any'], arg: FLAG, doc: 'Set a global flag.' },
  clr_global_flag: { scopes: ['any'], arg: FLAG, doc: 'Clear a global flag.' },
  set_variable: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { which: field(true, 'variable'), value: field(true, 'number') } },
    doc: 'Create or overwrite a variable.',
  },
  change_variable: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { which: field(true, 'variable'), value: field(true, 'number') } },
    doc: 'Add to an existing variable.',
  },

  trigger_revolt: {
    scopes: ['country', 'province', 'state'],
    arg: {
      kind: 'block',
      fields: {
        culture: field(false, 'culture'),
        religion: field(false, 'religion'),
        ideology: field(false, 'ideology'),
        type: field(false, 'identifier'),
      },
    },
    doc: 'Start a revolt of the matching rebel type here.',
  },
  add_war_goal: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { casus_belli: field(true, 'cbType') } },
    doc: 'Add a war goal of this CB to the current war.',
  },
  remove_casus_belli: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { type: field(true, 'cbType'), target: field(false, 'country') } },
    doc: 'Remove our CB of this type on the target.',
  },
  this_remove_casus_belli: {
    scopes: ['country'],
    arg: { kind: 'block', fields: { type: field(true, 'cbType'), target: field(false, 'country') } },
    doc: "Remove the target's CB of this type on us.",
  },
  party_loyalty: {
    scopes: ['province'],
    arg: {
      kind: 'block',
      fields: {
        ideology: field(false, 'ideology'),
        province_id: field(false, 'province'),
        loyalty_value: field(false, 'number'),
      },
    },
    doc: 'Change party loyalty toward an ideology in the province.',
  },
  build_bank_in_capital: {
    scopes: ['country'],
    arg: { kind: 'either', scalar: YESNO, block: { kind: 'block', fields: {}, open: true } },
    doc: 'Build a bank level in the capital (options in block form).',
  },
  build_university_in_capital: {
    scopes: ['country'],
    arg: { kind: 'either', scalar: YESNO, block: { kind: 'block', fields: {}, open: true } },
    doc: 'Build a university level in the capital (options in block form).',
  },
  set_news_flag: { scopes: ['country', 'province', 'pop'], arg: FLAG, doc: 'Set a news flag (news scripting).' },
  clear_news_flag: { scopes: ['country'], arg: FLAG, doc: 'Clear a news flag (news scripting).' },
};

/**
 * Effects the engine parses and accepts but does not run correctly. Writing one
 * is always a bug, so it is reported wherever it can appear — in an effect
 * block and in province history. The value completes the sentence after the
 * effect name.
 */
export const BROKEN_EFFECTS: Readonly<Record<string, string>> = {
  set_province_flag: 'is broken in the Victoria 2 engine and must not be used.',
};
