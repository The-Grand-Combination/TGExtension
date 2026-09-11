# Effects

Every effect recognized by the walker, from [src/data/effects.ts](../src/data/effects.ts). Names
and scope sets are extracted from the NCE engine parser (`effect_parsing.cpp` /
`effect_parser_defs.txt`, excluding NCE's own extensions beyond vanilla) — see
[scopes.md](scopes.md) for how scope tracking, `random`/`random_list`/`hidden_tooltip`, and dynamic
effect keys (goods, pop types, reform classes) work.

**116 effects** are recognized. A few scopes look wider than the wiki documents — those are
calibration widenings verified against the TGC corpus (comments in the source cite the count, e.g.
"corpus 96x country, 4x state" for `scaled_consciousness`/`scaled_militancy`).

The **Argument** column uses `|` for "one of" on a scalar, `{ field=kind, [optional]=kind, ... }`
for a block, and `A OR B` for effects that accept either a scalar or a block form (e.g.
`country_event = 1234` or `country_event = { id = 1234 days = 30 }`).

| Name | Scopes | Argument | Notes |
|---|---|---|---|
| `activate_technology` | country | technology | Grant a technology out of order (AHD). |
| `add_accepted_culture` | country | culture | Add an accepted culture ('union' = union tag's). |
| `add_casus_belli` | country | { target=country, type=cbType, [months]=number, ... } | Give the target a CB against this country. |
| `add_core` | country, province, state | country \| province | Add a core (TAG here, or province id from country). |
| `add_country_modifier` | country, province | { name=modifier, duration=number } | Add a country modifier for n days (-1 = forever). |
| `add_crime` | province | crime | Add this crime to the province. |
| `add_crisis_interest` | country | yesno | Become interested in the crisis (HoD). |
| `add_crisis_temperature` | any | number | Change crisis temperature (HoD). |
| `add_province_modifier` | province, state | { name=modifier, duration=number } | Add a province modifier for n days (-1 = forever). |
| `add_tax_relative_income` | country | number | Add cash equal to n × max-tax income. |
| `add_war_goal` | country | { casus_belli=cbType } | Add a war goal of this CB to the current war. |
| `annex_to` | country, province | country | Annex this country into TAG. |
| `assimilate` | province, state, pop | yesno | Convert all pops here to the primary culture. |
| `badboy` | country | number | Change infamy by n. |
| `bank` | province | number | Change bank level by n. |
| `build_bank_in_capital` | country | yesno OR { ... } | Build a bank level in the capital (options in block form). |
| `build_factory_in_capital_state` | country | building | Build this factory in the capital state. |
| `build_fort_in_capital` | country | yesno OR { ... } | Build a fort in the capital (options in block form). |
| `build_railway_in_capital` | country | yesno OR { ... } | Build railroad in the capital (options in block form). |
| `build_university_in_capital` | country | yesno OR { ... } | Build a university level in the capital (options in block form). |
| `capital` | country | province | Move the capital to this province. |
| `casus_belli` | country | { target=country, type=cbType, [months]=number, ... } | Give this country a CB against the target. |
| `change_controller` | province, state | country | Change the controller (not the owner). |
| `change_province_name` | province | string | Rename the province. |
| `change_region_name` | state, province | string | Rename the state (use alone in its scope). |
| `change_tag` | country | country \| identifier | Switch to TAG ('culture' = union tag). |
| `change_tag_no_core_switch` | country | country | Switch the player to TAG, cores untouched. |
| `change_variable` | country | { which=variable, value=number } | Add to an existing variable. |
| `civilized` | country | yesno | Set civilised status. |
| `clear_news_flag` | country | flag | Clear a news flag (news scripting). |
| `clr_country_flag` | country | flag | Clear a country flag. |
| `clr_global_flag` | any | flag | Clear a global flag. |
| `clr_province_flag` | province | flag | Clear a province flag. |
| `consciousness` | country, province, state, pop | number | Change consciousness of targeted pops by n. |
| `country_event` | country, province | event OR { id=event, [days]=number } | Fire a country event (optionally after n days). |
| `create_alliance` | country | country | Form an alliance with TAG. |
| `create_vassal` | country | country | Make TAG our vassal. |
| `define_admiral` | country | { name=string, [personality]=trait, [background]=trait } | Create a named admiral with traits. |
| `define_general` | country | { name=string, [personality]=trait, [background]=trait } | Create a named general with traits. |
| `diplomatic_influence` | country, province | { who=country, value=number } | Change influence over TAG by the value. |
| `dominant_issue` | pop, country | { factor=number, value=issue } | Shift pop support toward an issue. |
| `economic_reform` | country | reformOption | Enact this economic reform (AHD). |
| `election` | country | yesno | Start an early election. |
| `enable_canal` | any | number | Enable canal n (1 Kiel, 2 Suez, 3 Panama). |
| `enable_ideology` | any | ideology | Unlock an ideology globally. |
| `end_military_access` | country | country | Cancel military access through TAG. |
| `end_war` | country | country | End the war with TAG (no truce, no penalty). |
| `flashpoint_tension` | state, province | number | Change flashpoint tension (HoD). |
| `fort` | province | number | Change fort level by n. |
| `government` | country | government | Change the government type. |
| `great_wars_enabled` | any | yesno | Unlock (or lock) great wars. |
| `ideology` | pop | { factor=number, value=ideology } | Shift pop support toward an ideology. |
| `infrastructure` | province | number | Change railroad level by n. |
| `inherit` | country | country | Annex all of TAG. |
| `is_slave` | province, state, pop | yesno | Set slave-state status. |
| `kill_leader` | country | string \| number | Kill a leader by name. |
| `leadership` | country | number | Add leadership points. |
| `leave_alliance` | country | country | Break the alliance with TAG. |
| `life_rating` | province, state | number | Change life rating by n. |
| `literacy` | pop | number | Add n to pop literacy (-0.10 = -10%). |
| `militancy` | country, province, state, pop | number | Change militancy of targeted pops by n. |
| `military_access` | country | country | Gain military access through TAG. |
| `military_reform` | country | reformOption | Enact this military reform (AHD). |
| `modify_relation` | country, province | { [who]=country, [tag]=country, [with]=country, [value]=number, [relation]=number } | Change relations with TAG by the value (alias of relation). |
| `money` | country, province, pop | number | Change pop savings (or treasury at country scope). |
| `move_issue_percentage` | country, province, state, pop | { from=issue, to=issue, value=number } | Move support share between two issues. |
| `move_pop` | pop | province | Relocate the pop to a province. |
| `nationalize` | country | yesno | Seize all foreign-invested factories. |
| `nationalvalue` | country, province | nationalValue | Set the national value. |
| `naval_base` | province | number | Change naval base level by n. |
| `neutrality` | country | yesno | Drop all alliances and free satellites. |
| `party_loyalty` | province | { [ideology]=ideology, [province_id]=province, [loyalty_value]=number } | Change party loyalty toward an ideology in the province. |
| `plurality` | country | number | Change plurality by n. |
| `political_reform` | country, province | reformOption | Enact this political reform option. |
| `pop_type` | pop | popType | Convert the pop to another type. |
| `prestige` | country | number | Change prestige by n. |
| `prestige_factor` | country | number | Multiply current prestige by n. |
| `primary_culture` | country | culture \| country | Change the primary culture. |
| `province_event` | province | event OR { id=event, [days]=number } | Fire a province event. |
| `railroad` | province | number | Change railroad level by n. |
| `reduce_pop` | country, province, state, pop | number | Multiply pop size by n (above 1 grows it). |
| `relation` | country, province | { [who]=country, [tag]=country, [with]=country, [value]=number, [relation]=number } | Change relations with TAG by the value. |
| `release` | country | country | Release TAG as an independent nation. |
| `release_vassal` | country, province | country | Free a vassal, or release TAG as one. |
| `religion` | country | religion | Change the state religion. |
| `remove_accepted_culture` | country | culture | Remove an accepted culture. |
| `remove_casus_belli` | country | { type=cbType, [target]=country } | Remove our CB of this type on the target. |
| `remove_core` | country, province, state | country \| province | Remove a core (THIS works, FROM does not). |
| `remove_country_modifier` | country | modifier | Remove the country modifier (silent if absent). |
| `remove_province_modifier` | province, state | modifier | Remove the province modifier (silent if absent). |
| `remove_random_economic_reforms` | country | number | Undo n random economic reforms (unciv). |
| `remove_random_military_reforms` | country | number | Undo n random military reforms (unciv). |
| `research_points` | country | number | Add research points. |
| `rgo_size` | province | number | Change RGO size by n. |
| `ruling_party_ideology` | country | ideology | Put the first party of this ideology in power. |
| `scaled_consciousness` | pop, province, state, country | { factor=number, [ideology]=ideology, [issue]=issue } | Consciousness change scaled by ideology/issue support. |
| `scaled_militancy` | pop, province, state, country | { factor=number, [ideology]=ideology, [issue]=issue } | Militancy change scaled by ideology/issue support. |
| `secede_province` | province, state | country \| province | Transfer province (to TAG, or id to this country). An undefined tag, `null`, or `---` uncolonizes it instead (`uncolonize-province` warning). |
| `set_country_flag` | country, province, pop | flag | Set a country flag. |
| `set_global_flag` | any | flag | Set a global flag. |
| `set_news_flag` | country, province, pop | flag | Set a news flag (news scripting). |
| `set_province_flag` | province | flag | **Broken in the engine — `broken-effect` error.** Set a province flag. |
| `set_variable` | country | { which=variable, value=number } | Create or overwrite a variable. |
| `social_reform` | country, province | reformOption | Enact this social reform option. |
| `sub_unit` | country, province | { type=unit, value=number\|identifier } | Spawn a unit ('current' = in this province). |
| `tech_school` | country | modifier | Set the tech school / nation title. |
| `this_remove_casus_belli` | country | { type=cbType, [target]=country } | Remove the target's CB of this type on us. |
| `trade_goods` | province | good | Change the RGO output good. |
| `treasury` | country, province | number | Change treasury cash by n. |
| `trigger_revolt` | country, province, state | { [culture]=culture, [religion]=religion, [ideology]=ideology, [type]=identifier } | Start a revolt of the matching rebel type here. |
| `university` | province | number | Change university level by n. |
| `upper_house` | country | { ideology=ideology, value=number } | Shift upper house composition toward an ideology. |
| `war` | country | country OR { [target]=country, [attacker_goal]=block, [defender_goal]=block, [call_ally]=yesno } | Declare war (block form sets goals and allies). |
| `war_exhaustion` | country | number | Change war exhaustion by n. |
| `world_wars_enabled` | any | yesno | Unlock (or lock) world wars. |
| `years_of_research` | country | number | Add RPs equal to n years of output. |

## Dynamic effect keys (not in the table above)

- A trade good name (`machine_parts = 25`) — requires a numeric value; adds to the country's
  stockpile of that good.
- A pop type name (`farmers = { ... }`) — scopes into `pop` and walks the block as effects.
- A reform class name (`slavery = yes_slavery`) — checked as a reform-option value against
  `common/issues.txt` (see [mod-index.md](mod-index.md#reform-classes-and-options)).
- A country TAG / province id / state-region name as a key — scope-changes exactly as in trigger
  context (see [scopes.md](scopes.md#dynamic-scope-keys-resolved-against-the-mod-index-not-hard-coded)).
