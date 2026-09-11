# Triggers (conditions)

Every condition recognized by the walker, from [src/data/triggers.ts](../src/data/triggers.ts).
Names and scope sets are extracted from the NCE engine parser (`trigger_parsing.cpp` /
`trigger_parser_defs.txt`, excluding NCE's own extensions beyond vanilla) — see
[scopes.md](scopes.md) for how scope tracking and dynamic trigger keys work, and
[diagnostics-reference.md](diagnostics-reference.md) for what happens when a name, scope, or
argument doesn't match.

**249 triggers** are recognized as static entries, plus a family of 21 *news scripting* comparison
triggers generated from a template (`tags_eq`, `tags_greater`, `tags_match`, `tags_contains`, and
the same four comparisons for `values`, `strings`, `dates`, plus the singular `date_greater`
spelling the vanilla news scripts use, and `length_greater`) — these accept an open, unchecked
block (news scripting's own mini-language is not otherwise validated).

A handful of names are engine aliases of another trigger, kept because mods use both spellings:
`is_culture` (= `culture`), `neighbor` (= `neighbour`), `low_tax` (= `poor_tax`), `pop_type` (=
`type`).

The **Argument** column uses `|` to mean "one of" for a scalar (e.g. `number | country` accepts a
plain number or a country TAG), and `{ field=kind, [optional]=kind, ... }` for a required block
shape (`...` marks a block that also accepts unlisted fields unchecked). See
[hover-and-highlighting.md](hover-and-highlighting.md) for how these render on hover.

| Name | Scopes | Argument | Notes |
|---|---|---|---|
| `accepted_culture` | country | culture | Culture is accepted here. |
| `administration_spending` | country, province, state, pop | number | Admin spending slider at least x. |
| `agree_with_ruling_party` | pop | number | Pop agrees with ruling party (0-1). |
| `ai` | country | yesno | Country is AI-controlled. |
| `alliance_with` | country | country | Allied with TAG. |
| `always` | any | yesno | Always true (yes) or always false (no). |
| `average_consciousness` | country, province, state | number | Average consciousness at least x. |
| `average_militancy` | country, province, state | number | Average militancy at least x. |
| `badboy` | country | number | Infamy as a fraction of the limit (0.8 = 20). |
| `big_producer` | country | good | Major world producer of the good. |
| `blockade` | country | number | Blockaded fraction at least x. |
| `brigades_compare` | country, province | number | Brigade count at least x times the target. |
| `can_build_factory` | country, province, pop | yesno | Factories can be built here. |
| `can_build_factory_in_capital_state` | country | building | Factory type buildable in capital state. |
| `can_build_fort_in_capital` | country | { [in_whole_capital_state]=yesno, [limit_to_world_greatest_level]=yesno } | A fort level can be built in the capital (state). |
| `can_build_in_province` | province | { building=building, ... } | The building can be built in this province. |
| `can_build_railway_in_capital` | country | { [in_whole_capital_state]=yesno, [limit_to_world_greatest_level]=yesno } | A railway level can be built in the capital (state). |
| `can_create_vassals` | country | yesno | A releasable nation exists. |
| `can_nationalize` | country | yesno | Foreign investment can be seized. |
| `capital` | country | province | Our capital is this province. |
| `cash_reserves` | pop | number | Pop cash vs daily needs at least x%. |
| `casus_belli` | country | country | We have any active CB on TAG. |
| `check_variable` | any | { which=variable, value=number } | Variable is at least the given value. |
| `civilization_progress` | country | number | Westernisation progress at least x (0-1). |
| `civilized` | country, province, pop | yesno | Country is civilized. |
| `colonial_nation` | country | yesno | Country has colonies. |
| `consciousness` | country, province, state, pop | number | Consciousness at least x. |
| `constructing_cb` | country | cbType | Currently fabricating this CB type. |
| `constructing_cb_discovered` | country | yesno | Our CB fabrication has been discovered. |
| `constructing_cb_progress` | country | number | CB fabrication progress (0-1). |
| `constructing_cb_type` | country | cbType | Currently fabricating this CB. |
| `continent` | country, province, state, pop | continent | On this continent. |
| `controlled_by` | province | country | Province is controlled by TAG. |
| `controlled_by_rebels` | province | yesno | Province is rebel-controlled. |
| `controls` | country | province | We control this province. |
| `corruption` | country | number | Corruption at least x. |
| `country_units_in_province` | province | country | TAG has units in this province. |
| `country_units_in_state` | state | country | TAG has units in this state. |
| `crime_fighting` | country, province, state, pop | number | Crime fighting funding at least x. |
| `crime_higher_than_education` | country, province, state, pop | yesno | Admin spending above education spending. |
| `crisis_exist` | any | yesno | A crisis is ongoing (HoD). |
| `crisis_temperature` | any | number | Crisis temperature at least n (HoD). |
| `culture` | country, province, state, pop | culture | Province majority culture matches. |
| `culture_group` | country, province, state, pop | cultureGroup | Culture group matches. |
| `culture_has_union_tag` | country, pop | yesno | Primary culture group has a union TAG. |
| `date_contains` | any | { ... } | News scripting: contains comparison over collected date. |
| `date_eq` | any | { ... } | News scripting: eq comparison over collected date. |
| `date_greater` | any | { ... } | News scripting: greater comparison over collected date. |
| `date_match` | any | { ... } | News scripting: match comparison over collected date. |
| `dates_contains` | any | { ... } | News scripting: contains comparison over collected dates. |
| `dates_eq` | any | { ... } | News scripting: eq comparison over collected dates. |
| `dates_greater` | any | { ... } | News scripting: greater comparison over collected dates. |
| `dates_match` | any | { ... } | News scripting: match comparison over collected dates. |
| `diplomatic_influence` | country | { who=country, value=number } | Influence over TAG at least the value. |
| `education_spending` | country, province, state, pop | number | Education spending at least x. |
| `election` | country | yesno | An election is ongoing. |
| `empty` | province, state | yesno | Province is uncolonised. |
| `everyday_needs` | pop | number | Everyday needs satisfaction at least x. |
| `exists` | any | country \| yesno | Country exists (TAG or yes/no for current). |
| `flashpoint_tension` | province, state | number | Flashpoint tension at least x (HoD). |
| `government` | country, pop | government | Government type matches. |
| `great_wars_enabled` | any | yesno | Great wars are unlocked. |
| `has_building` | province, state | building | Building present ('factory' = any factory). |
| `has_country_flag` | country, province, state, pop | flag | The country flag is set. |
| `has_country_modifier` | country, province | modifier | The country modifier is active. |
| `has_crime` | province | crime | Province has this crime. |
| `has_cultural_sphere` | country | yesno | Sphere member shares our culture group. |
| `has_culture_core` | province, pop | yesno | A core nation shares the pop culture. |
| `has_empty_adjacent_province` | province | yesno | Borders an uncolonised province. |
| `has_empty_adjacent_state` | province, state | yesno | Borders an uncolonised state. |
| `has_faction` | country, pop | identifier | A rebel faction of this type is active (pop: is member). |
| `has_factories` | country, state | yesno | State has factories. |
| `has_flashpoint` | state, province | yesno | State or province has flashpoint tension (HoD). No localisation key, so the tooltip is blank in game. |
| `has_global_flag` | any | flag | The global flag has been set. |
| `has_leader` | country | string | Has a leader with this name. |
| `has_national_minority` | country, province, state | yesno | Pops of multiple cultures present. |
| `has_news_flag` | country, province, state, pop | flag | News flag is set (news scripting). |
| `has_pop_culture` | country, province, state, pop | culture \| country | The pop's own culture matches. |
| `has_pop_religion` | country, province, state, pop | religion \| country | The pop's own religion matches. |
| `has_pop_type` | country, province, state, pop | popType | Any pop of this type present. |
| `has_province_flag` | province | flag | The province flag is set. |
| `has_province_modifier` | province | modifier | The province modifier is active. |
| `has_recent_imigration` | province | number | Received immigrants in the last n days. |
| `has_recently_lost_war` | country, pop | yesno | Lost a war in the last 5 years. |
| `has_unclaimed_cores` | country | yesno | Core provinces we do not own exist. |
| `have_core_in` | country | country | We have cores on TAG provinces. |
| `in_default` | country | yesno \| country | Country has defaulted (optionally to TAG). |
| `is_colonial_crisis` | country | yesno | The current crisis is over uncolonized land (HoD). No localisation key. |
| `is_influence_crisis` | country | yesno | The current crisis is over influence in a country (HoD). No localisation key. |
| `in_sphere` | country | country | We are in the sphere of TAG. |
| `industrial_score` | country | number \| country | Industrial score at least n (or vs TAG). |
| `invention` | country, province, pop | invention | Invention has activated. |
| `involved_in_crisis` | country, pop | yesno | We are involved in the crisis (HoD). |
| `is_accepted_culture` | country, province, state, pop | yesno \| country \| culture | Majority/pop culture is accepted. |
| `is_blockaded` | province | yesno | Province is blockaded. |
| `is_canal_enabled` | any | number | Canal n built (1 Kiel, 2 Suez, 3 Panama). |
| `is_capital` | province | yesno | Province is a national capital. |
| `is_claim_crisis` | any | yesno | Current crisis is a claim crisis (HoD). |
| `is_coastal` | province, state | yesno | Province touches water (even lakes). |
| `is_colonial` | country, province, state, pop | yesno | Province/state is colonial. |
| `is_core` | country, province, state, pop | province \| country | Core check (province id or TAG). |
| `is_cultural_union` | country, pop | country \| yesno | TAG is a cultural union (or we are one). |
| `is_culture` | country, province, state, pop | culture | Culture matches (alias of culture). |
| `is_culture_group` | country, province, state, pop | cultureGroup \| country | Culture group matches (group name or TAG). |
| `is_disarmed` | country, pop | yesno | Disarmed via Cut Down to Size. |
| `is_greater_power` | country, province, pop | yesno | Country is a Great Power. |
| `is_ideology_enabled` | any | ideology | Ideology is unlocked globally. |
| `is_independant` | country | yesno | Not a vassal (engine spelling). |
| `is_liberation_crisis` | any | yesno | Current crisis is a liberation crisis. |
| `is_mobilised` | country | yesno | Country is mobilised. |
| `is_next_reform` | country, pop | reformOption | This reform is the next available step. |
| `is_our_vassal` | country, province | country | TAG is our vassal. |
| `is_overseas` | province, state, pop | yesno | Province is overseas. |
| `is_possible_vassal` | country | country | TAG can be released as our puppet. |
| `is_primary_culture` | country, province, state, pop | yesno \| country \| culture | Majority/pop culture is the primary one. |
| `is_releasable_vassal` | any | country | TAG (or FROM) can be released as a vassal. |
| `is_secondary_power` | country, pop | yesno | Country is a secondary power. |
| `is_slave` | country, province, state, pop | yesno | State is a slave state. |
| `is_sphere_leader_of` | country | country | TAG is in our sphere. |
| `is_state_capital` | province, pop | yesno | Province is a state capital. |
| `is_state_religion` | province, state, pop | yesno | Matches the state religion. |
| `is_subject` | country | yesno | Country is a vassal or substate. |
| `is_substate` | country | yesno | Country is a substate. |
| `is_vassal` | country | yesno | Country is a vassal/puppet. |
| `length_greater` | any | { ... } | News scripting: a collected list is longer than n. |
| `life_needs` | pop | number | Life needs satisfaction at least x. |
| `life_rating` | province, state | number | Life rating at least n. |
| `literacy` | country, province, state, pop | number | Average literacy at least x (0-1). |
| `lost_national` | country | number | Lost at least x of core provinces. |
| `low_tax` | country, pop | number | Poor strata tax at least x (alias of poor_tax). |
| `luxury_needs` | pop | number | Luxury needs satisfaction at least x. |
| `middle_strata_everyday_needs` | country, province, state, pop | number | Middle everyday needs satisfaction. |
| `middle_strata_life_needs` | country, province, state, pop | number | Middle life needs satisfaction. |
| `middle_strata_luxury_needs` | country, province, state, pop | number | Middle luxury needs satisfaction. |
| `middle_strata_militancy` | country, province, state, pop | number | Middle strata militancy at least x. |
| `middle_tax` | country, pop | number | Middle strata tax at least x. |
| `militancy` | country, province, state, pop | number | Militancy at least x. |
| `military_access` | country | country | TAG has military access to us. |
| `military_score` | country | number \| country | Military score at least n (or vs TAG). |
| `military_spending` | country, province, state, pop | number | Military spending at least x. |
| `minorities` | country, province, state | yesno | Non-accepted culture pops present. |
| `mobilisation_size` | country | number | Mobilisation size at least x. |
| `money` | country, province | number | Treasury (or pop savings) at least n. |
| `month` | any | number | Current month (0-11) check. |
| `national_provinces_occupied` | country | number | Fraction of home provinces occupied. |
| `nationalism` | province | number | Nationalism (separatism time) at least n. |
| `nationalvalue` | country, province, pop | nationalValue | National value matches. |
| `neighbor` | country | country | We border TAG (alias of neighbour). |
| `neighbour` | country | country | We border TAG. |
| `news_printing_count` | any | number | Times this news style was printed (news scripting). |
| `num_of_allies` | country | number | Ally count at least n. |
| `num_of_cities` | country | number \| country | Owned province count at least n (or vs THIS/FROM). |
| `num_of_ports` | country | number | Port count at least n. |
| `num_of_revolts` | country | number | States under rebel control at least n. |
| `num_of_substates` | country | number | Substate count at least n. |
| `num_of_vassals` | country | number | Vassal count at least n. |
| `num_of_vassals_no_substates` | country | number | Vassals excluding substates at least n. |
| `number_of_states` | country | number | Owned state count at least n. |
| `owned_by` | province, state | country | Province is owned by TAG. |
| `owns` | country, province | province | We own this province. |
| `part_of_sphere` | country | yesno | We are in any sphere. |
| `party_loyalty` | country, province | { value=number, ideology=ideology, [province_id]=province } | Party loyalty toward an ideology at least the value. |
| `party_name` | country | { [ideology]=ideology, [name]=string } | An active party (of the ideology) has this name. |
| `party_position` | country | { [ideology]=ideology, [position]=identifier } | An active party (of the ideology) holds this issue position. |
| `plurality` | country, pop | number | Plurality is at least n. |
| `political_movement` | pop | yesno | Pop is in a political movement. |
| `political_movement_strength` | country | number | Any political movement at least x. |
| `political_reform_want` | country, pop | number | Political reform desire at least x (0-1). |
| `poor_strata_everyday_needs` | country, province, state, pop | number | Poor everyday needs satisfaction. |
| `poor_strata_life_needs` | country, province, state, pop | number | Poor life needs satisfaction (0-1). |
| `poor_strata_luxury_needs` | country, province, state, pop | number | Poor luxury needs satisfaction. |
| `poor_strata_militancy` | country, province, state, pop | number | Poor strata militancy at least x. |
| `poor_tax` | country, pop | number | Poor strata tax at least x. |
| `pop_majority_culture` | country, province, state | culture | Majority pop culture matches. |
| `pop_majority_ideology` | country, province, state, pop | ideology | Majority pop ideology matches. |
| `pop_majority_issue` | country, province, state, pop | issue | Majority pop issue matches. |
| `pop_majority_religion` | country, province, state | religion | Majority pop religion matches. |
| `pop_militancy` | country, province, state, pop | number | Pop militancy at least x. |
| `pop_type` | country, province, state, pop | popType | Pop is of this type (alias of type). |
| `pop_unemployment` | country, province, state, pop | { type=popType, value=number } | Unemployment of a pop type at least x (0-1). |
| `port` | province | yesno | Province has (or could have) a port. |
| `prestige` | country | number \| country | Prestige at least n (or vs THIS/FROM). |
| `primary_culture` | country, pop | culture \| country | Primary culture matches. |
| `produces` | country, province, state, pop | good | Produces the good (RGO or factory). |
| `province_control_days` | province | number | Controlled by non-owner for n days. |
| `province_id` | province | province | Province is exactly this id. |
| `rank` | country | number | Global rank at least n (1 = top). |
| `rebel_power_fraction` | country | number | Any rebel faction power at least x. |
| `recruited_percentage` | country, pop | number | Fraction of regiments recruited. |
| `region` | province, state, pop | stateRegion | Province is in this region/state. |
| `relation` | country | { who=country, value=number } | Relations with TAG at least the value. |
| `religion` | country, pop | religion | State/pop religion matches; `THIS`/`FROM` compares against the scope it came from, the idiom in pop weights (`NOT = { religion = THIS }`). |
| `revanchism` | country, pop | number | Revanchism at least x. |
| `revolt_percentage` | country | number | Fraction of provinces in revolt. |
| `rich_strata_everyday_needs` | country, province, state, pop | number | Rich everyday needs satisfaction. |
| `rich_strata_life_needs` | country, province, state, pop | number | Rich life needs satisfaction. |
| `rich_strata_luxury_needs` | country, province, state, pop | number | Rich luxury needs satisfaction. |
| `rich_strata_militancy` | country, province, state, pop | number | Rich strata militancy at least x. |
| `rich_tax` | country, pop | number | Rich strata tax at least x. |
| `rich_tax_above_poor` | country | yesno | Rich tax is above poor tax. |
| `ruling_party` | country | string \| identifier | Ruling party name matches. |
| `ruling_party_ideology` | country, province, pop | ideology | Ruling party ideology matches. |
| `social_movement` | pop | yesno | Pop is in a social movement. |
| `social_movement_strength` | country | number | Any social movement at least x. |
| `social_reform_want` | country, pop | number | Social reform desire at least x (0-1). |
| `social_spending` | country, province, pop | number | Social spending at least x. |
| `someone_can_form_union_tag` | any | country | A country able to form this union TAG exists. |
| `state_id` | province, state | province | Province belongs to this state (by id). |
| `strata` | pop | strata | Pop strata is poor/middle/rich. |
| `strings_contains` | any | { ... } | News scripting: contains comparison over collected strings. |
| `strings_eq` | any | { ... } | News scripting: eq comparison over collected strings. |
| `strings_greater` | any | { ... } | News scripting: greater comparison over collected strings. |
| `strings_match` | any | { ... } | News scripting: match comparison over collected strings. |
| `stronger_army_than` | country | country | Our army is stronger than TAG. |
| `substate_of` | country | country | We are a substate of TAG. |
| `tag` | country, province, state, pop | country | Country is exactly this TAG. |
| `tags_contains` | any | { ... } | News scripting: contains comparison over collected tags. |
| `tags_eq` | any | { ... } | News scripting: eq comparison over collected tags. |
| `tags_greater` | any | { ... } | News scripting: greater comparison over collected tags. |
| `tags_match` | any | { ... } | News scripting: match comparison over collected tags. |
| `tech_school` | country | modifier | Tech school matches. |
| `terrain` | province, pop | terrain | Province terrain type matches. |
| `this_culture_union` | country | country | TAG shares our cultural union. |
| `total_amount_of_divisions` | country | number | Division count at least n. |
| `total_amount_of_ships` | country | number | Ship count at least n. |
| `total_num_of_ports` | country | number | Total port count at least n. |
| `total_pops` | country, province, state, pop | number | Total population at least n. |
| `total_sunk_by_us` | any | number | Enemy ships sunk at least n. |
| `trade_goods` | province | good | RGO produces this good. |
| `trade_goods_in_state` | province, state | good | The state produces this good. |
| `treasury` | country, province | number | Treasury holds at least n cash. |
| `truce_with` | country | country | Under truce with TAG. |
| `type` | country, province, state, pop | popType | Pop is of this type. |
| `unemployment` | country, province, state, pop | number | Unemployment at least x (0-1). |
| `unemployment_by_type` | country, province, state, pop | { type=popType, value=number } | Unemployment of a pop type at least x. |
| `unit_has_leader` | province | yesno | Any unit has a leader. |
| `unit_in_battle` | province | yesno | Any unit is fighting. |
| `units_in_province` | province | number \| country | At least n units present (or THIS/FROM has units here). |
| `upper_house` | country | { ideology=ideology, value=number } | Upper house share of an ideology at least x (0-1). |
| `values_contains` | any | { ... } | News scripting: contains comparison over collected values. |
| `values_eq` | any | { ... } | News scripting: eq comparison over collected values. |
| `values_greater` | any | { ... } | News scripting: greater comparison over collected values. |
| `values_match` | any | { ... } | News scripting: match comparison over collected values. |
| `vassal_of` | country, province | country | We are a puppet of TAG. |
| `war` | country, pop | yesno | Country is at war. |
| `war_exhaustion` | country, province, pop | number | War exhaustion at least x. |
| `war_score` | country | number | Any current war score at least x. |
| `war_with` | country | country | At war with TAG. |
| `work_available` | country, province, state | { worker=popType } | The pop type could be employed here. |
| `world_wars_enabled` | any | yesno | World wars are unlocked. |
| `year` | any | number | Current year is at least n. |
