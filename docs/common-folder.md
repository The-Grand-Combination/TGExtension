# `common/` folder

Validators for every typed file directly under `common/`, plus `common/countries/<name>.txt`. All
grammars follow the NCE parser's `parser_defs.txt` groupings of the same name. Implementation: one
service per grammar under [src/services/](../src/services/) (`cbTypeValidation.ts`,
`rebelTypeValidation.ts`, `issuesValidation.ts`, `nationalFocusValidation.ts`,
`onActionsValidation.ts`, `countryColorsValidation.ts`, `modifierFileValidation.ts`,
`cultureValidation.ts`, `groupedItemValidation.ts`, `governmentValidation.ts`,
`buildingValidation.ts`, `traitValidation.ts`, `productionTypeValidation.ts`,
`bookmarkValidation.ts`, `popChanceValidation.ts`, `techFolderValidation.ts`,
`countryDefinitionValidation.ts`, `commonOtherValidation.ts`), with the field tables in
[src/data/commonStructure.ts](../src/data/commonStructure.ts),
[src/data/cbTypeStructure.ts](../src/data/cbTypeStructure.ts), and
[src/data/rebelTypeStructure.ts](../src/data/rebelTypeStructure.ts).

Every file below also gets the generic checks described in
[file-classification.md](file-classification.md): recursive `color = { ... }` validation
(exactly three plain numbers, no commas — see below), and a top-level stray-entry check (except
where the file's own validator already owns top-level shape).

## `color = { r g b }` (shared rule, everywhere)

`checkColorBlock` requires **exactly three plain numeric scalars**, no commas, no suffixes:
`color = { 136 170 0 }`. Both `color = { 136 170, 0 }` (commas) and `color = { 136 170n 0 }` (a
malformed number) are `invalid-color` (error); so is a block with any count other than three, or a
non-block value.

## `crime.txt` → `validateCrimesFile`

Each crime: `trigger` walked as a **trigger at `province` scope**; `active` accepts `yesno`; every
other key must be `icon` or a known modifier key (see [Modifier keys](#modifier-keys) below),
checked as numeric (`unknown-modifier-key` otherwise).

## `triggered_modifiers.txt` → `validateTriggeredModifiersFile`

Same shape as `crime.txt`, but `trigger` is walked at **`country` scope**, and `active` is **not**
accepted (that field is crime-specific).

## `cb_types.txt` → `validateCbTypeFile` / `validateCbBody` / `checkPeaceOrder`

- `peace_order` (special top-level key, not a CB definition): a bare list of CB type names, each
  checked against the CB index (`unknown-cbtype`).
- Every other top-level block is a CB definition. Trigger fields (scope in parens): `can_use`
  (country), `is_valid` (country), `prerequisites` (country), `allowed_countries` (country),
  `allowed_states` (state), `allowed_substate_regions` (state), `allowed_states_in_crisis` (state).
  Effect fields: `on_add` (country), `on_po_accepted` (country).
- Plain metadata fields (`CB_BODY_FIELDS`, not validated further): `war_name` (a loc key, but engine
  keys like `WAR_NAME` resolve from vanilla loc so it's never checked), `sprite_index`,
  `is_triggered_only`, `months`, `crisis`, `construction_speed`, `constructing_cb`, `mutual`,
  `is_civil_war`, `always`, `great_war_obligatory`, `badboy_factor`, `prestige_factor`,
  `peace_cost_factor`, `penalty_factor`, `break_truce_prestige_factor`,
  `break_truce_infamy_factor`, `break_truce_militancy_factor`, `truce_months`,
  `good_relation_prestige_factor`, `good_relation_infamy_factor`, `good_relation_militancy_factor`,
  `tws_battle_factor`, `all_allowed_states`, and every `po_*` peace-option flag (`po_annex`,
  `po_demand_state`, `po_add_to_sphere`, `po_disarmament`, `po_destroy_forts`,
  `po_destroy_naval_bases`, `po_reparations`, `po_transfer_provinces`, `po_remove_prestige`,
  `po_make_puppet`, `po_release_puppet`, `po_status_quo`, `po_install_communist_gov_type`,
  `po_uninstall_communist_gov_type`, `po_remove_cores`, `po_colony`, `po_gunboat`,
  `po_clear_union_sphere`).
- Anything else → `unknown-cb-field`.

## `national_focus.txt` → `validateNationalFocusFile` / `validateFocusBody`

Structure is category → focus name → body (two levels of grouping). Inside each focus body:

- `limit` — walked as a **trigger at `province` scope** (NCE: the focus limit is evaluated per
  province of the state, not the state itself).
- `ideology` — must be a known ideology.
- `FOCUS_FIELDS` table: `railroads`, `own_provinces`, `has_flashpoint`, `flashpoint_tension`,
  `outliner_show_as_percent`, `loyalty_value`.
- Anything else (modifier keys, and dynamic numeric keys — a trade good name for RGO-boosting
  foci) requires a plain numeric value; nothing is rejected purely for being unrecognized here,
  matching the NCE grammar's "any float" catch-all.

## `rebel_types.txt` → `validateRebelTypeFile` / `handleRebelField`

- Weight-block fields (evaluated as MTTH-style blocks): `will_rise` (`country` scope),
  `spawn_chance` (`pop` scope), `movement_evaluation` (`province` scope).
- Trigger fields: `demands_enforced_trigger` (`country`), `siege_won_trigger` (`province`).
- Effect fields: `demands_enforced_effect` (`country`), `siege_won_effect` (`province`).
- `government` — a `<current government> = <government on win>` map, both sides checked against
  the government index.
- `ideology` — a single ideology reference.
- Plain fields (`REBEL_BODY_FIELDS`): `icon`, `area`, `break_alliance_on_win`, `defection`,
  `independence`, `defect_delay`, `allow_all_cultures`, `allow_all_culture_groups`,
  `allow_all_religions`, `allow_all_ideologies`, `resilient`, `reinforcing`, `general`, `smart`,
  `unit_transfer`, `occupation_mult`.
- Anything else → `unknown-rebel-field`.

## `on_actions.txt` → `validateOnActionsFile`

Only the engine's fixed hook names are recognized (`ON_ACTION_KEYS`) — anything else is flagged
with `unknown-on-action` and the note "the engine will never fire it", since `on_actions.txt` has no
generic fallback in the engine: `on_yearly_pulse`, `on_quarterly_pulse`, `on_battle_won`,
`on_battle_lost`, `on_surrender`, `on_new_great_nation`, `on_lost_great_nation`,
`on_election_tick`, `on_colony_to_state`, `on_state_conquest`, `on_colony_to_state_free_slaves`,
`on_debtor_default`, `on_debtor_default_small`, `on_debtor_default_second`, `on_civilize`,
`on_my_factories_nationalized`, `on_crisis_declare_interest`. Every entry inside a recognized hook
must be an event reference (`checkArg(..., ['event'])`).

## `issues.txt` → `validateIssuesFile` / `validateIssueOptionBody`

Three levels of grouping: category → reform/issue class → option. Each option body:

- `allow` — walked as a **trigger at `country` scope**.
- `on_execute` — its own two-key body: `trigger` (country-scope trigger) and `effect`
  (country-scope effect); any other key → `unknown-field`.
- `rules` — each entry must be one of the fixed `OPTION_RULES_KEYS` (33 engine game-rule toggles:
  `build_factory`, `expand_factory`, `open_factory`, `destroy_factory`, `factory_priority`,
  `can_subsidise`, `pop_build_factory`, `pop_expand_factory`, `pop_open_factory`,
  `delete_factory_if_no_input`, `build_factory_invest`, `expand_factory_invest`,
  `open_factory_invest`, `build_railway_invest`, `can_invest_in_pop_projects`,
  `pop_build_factory_invest`, `pop_expand_factory_invest`, `pop_open_factory_invest`,
  `allow_foreign_investment`, `slavery_allowed`, `primary_culture_voting`, `culture_voting`,
  `all_voting`, `largest_share`, `dhont`, `sainte_laque`, `same_as_ruling_party`, `rich_only`,
  `state_vote`, `population_vote`, `build_railway`, `build_bank`, `build_university`), each with a
  `yesno` value.
- `vote_modifiers` — a map of ideology → weight block, each weight block walked at `country` scope.
- `ISSUE_OPTION_FIELDS`: `technology_cost`, `war_exhaustion_effect`, `administrative_multiplier`
  (all numeric), `is_jingoism` (`yesno`).
- Any remaining key that is a known modifier key → checked as numeric.
- Anything else → `unknown-issue-option-field`.

## `country_colors.txt` (HoD) → `validateCountryColorsFile`

`TAG = { color1 = { r g b } color2 = { ... } color3 = { ... } }`. The TAG is checked against the
country index (`unknown-country`); each `color1`/`color2`/`color3` is validated as a color block;
any other key inside a country entry → `unknown-field`.

## `cultures.txt` → `validateCulturesFile`

Group → culture. Group-level fields (`CULTURE_GROUP_FIELDS`): `leader`, `unit`, `is_overseas`
(`yesno`), `union` (a country TAG). Culture-level: `color` (color block), `first_names`/
`last_names` (must be blocks, not further validated), `radicalism`/`primary` (`CULTURE_FIELDS`).
Anything else at either level → `unknown-culture-field`.

## `religion.txt` / `goods.txt` → `validateReligionsFile` / `validateGoodsFile`

Both are group → item files, validated the same way (`validateGroupedItems` +
`validateColorAndTable`): `color` as a color block, plus a fixed field table per file.

- Religion fields (`RELIGION_FIELDS`): `icon` (number), `pagan` (`yesno`).
- Good fields (`GOOD_FIELDS`): `cost` (number), `available_from_start`, `tradeable`,
  `overseas_penalty`, `money` (all `yesno`).

Unknown field → `unknown-religion-field` / `unknown-good-field`.

## `ideologies.txt` → `validateIdeologiesFile`

Group → ideology. `color` as a color block. Reform-desire fields
(`IDEOLOGY_WEIGHT_FIELDS`: `add_political_reform`, `remove_political_reform`,
`add_social_reform`, `remove_social_reform`, `add_military_reform`, `add_economic_reform`) are
walked as **country-scope value modifiers** (weight blocks). Plain fields (`IDEOLOGY_FIELDS`):
`can_reduce_militancy`, `uncivilized`, `civilized` (`yesno`), `date`. Anything else →
`unknown-ideology-field`.

## `governments.txt` → `validateGovernmentsFile`

Per government: `GOVERNMENT_FIELDS` (`flagtype`, `election` (`yesno`), `duration` (number),
`appoint_ruling_party` (`yesno`)), plus one toggle per known ideology name
(`<ideology> = yes/no`). Any key that is neither a known field nor a known ideology →
`unknown-government-field`.

## `buildings.txt` → `validateBuildingsFile`

Per building: `goods_cost` (a `good → number` map, keys checked against the goods index),
`colonial_points` (a bare numeric list — any non-number entry is a stray entry),
`BUILDING_FIELDS` (`type`, `cost`, `time`, `naval_capacity`, `max_level`, `colonial_range`,
`infrastructure`, `production_type`, `default_enabled`, `on_completion`, `completion_size`, `port`,
`visibility`, `onmap`, `province`, `fort_level`, `pop_build_factory`, `spawn_railway_track`,
`strategic_factory`, `sail`, `steam`, `one_per_state`, `advanced_factory`, `capital`), and any
recognized modifier key (numeric). Anything else → `unknown-building-field`.

## `nationalvalues.txt` / `event_modifiers.txt` / `static_modifiers.txt`

All three share `checkModifierBody`: every field must be `icon` or a recognized modifier key (see
below), each checked as numeric; anything else → `unknown-modifier-key`.
`static_modifiers.txt` additionally restricts the **top-level name** itself to the engine's fixed
set (`STATIC_MODIFIER_NAMES`, 39 names the engine reads directly — `very_easy_player`,
`easy_player`, `hard_player`, `very_hard_player`, `very_easy_ai`, `easy_ai`, `hard_ai`,
`very_hard_ai`, `overseas`, `coastal`, `non_coastal`, `coastal_sea`, `sea_zone`, `land_province`,
`blockaded`, `no_adjacent_controlled`, `core`, `has_siege`, `occupied`, `nationalism`,
`infrastructure`, `base_values`, `war`, `peace`, `disarming`, `war_exhaustion`, `badboy`,
`debt_default_to`, `bad_debter`, `great_power`, `second_power`, `civ_nation`, `unciv_nation`,
`average_literacy`, `plurality`, `generalised_debt_default`, `total_occupation`,
`total_blockaded`, `in_bankrupcy`) — an unrecognized name gets `unknown-static-modifier` ("the
engine only reads its fixed set").

## `traits.txt` → `validateTraitsFile`

Only two top-level sets are allowed: `personality` and `background`. Each trait's stat body accepts
only `TRAIT_FIELDS` (`organisation`, `morale`, `attack`, `defence`/`defense`, `reconnaissance`,
`speed`, `experience`, `reliability`, `attrition`), each numeric. Anything else →
`unknown-trait-stat`.

## `production_types.txt` → `validateProductionTypesFile`

Per production type: `owner` and each entry of `employees` (a list of **bare blocks**, not
assignments) are validated as an employee spec (`PRODUCTION_EMPLOYEE_FIELDS`: `poptype`, `effect`,
`effect_multiplier`, `amount`); `efficiency`/`input_goods` are `good → number` maps; `bonus`/
`input_bonus` hold `trigger` (walked at **`state` scope** — production bonuses are evaluated per
state) and `value` (numeric); the rest is `PRODUCTION_TYPE_FIELDS` (`template`, `type`, `workforce`,
`farm`, `mine`, `is_coastal`, `output_goods`, `value`).

## `bookmarks.txt` → `validateBookmarksFile`

Only `bookmark` blocks are allowed at the top level; each holds `BOOKMARK_FIELDS` (`date`, `name`,
`desc`, `camerax`, `cameray`).

## `pop_types.txt` → `validatePopChancesFile`

Top-level keys must be one of the seven fixed `POP_CHANCE_KEYS` (`promotion_chance`,
`demotion_chance`, `migration_chance`, `colonialmigration_chance`, `emigration_chance`,
`assimilation_chance`, `conversion_chance`), each walked as a **pop-scope weight block**.

## `technology.txt` → `validateTechFoldersFile`

Only two top-level sections: `folders` (a bare list of tech folder names, each a block — not
further validated) and `schools` (each entry a modifier body, `checkModifierBody`). Anything else →
`unknown-field`.

## `common/countries/<name>.txt` → `validateCountryDefinitionFile`

Top-level fields only (no recursion beyond what's described):

- `color` — color block.
- `graphical_culture` — checked against `common/graphicalculturetype.txt`'s bare list (skipped
  entirely when that file is empty/absent).
- `template` — ignored (not further validated).
- `party` — each entry: `trigger` (country-scope trigger), `PARTY_FIELDS` (`name`, `start_date`,
  `end_date`, `ideology`), or a reform-class name (checked as a reform-option value, e.g. a party's
  `slavery = no_position_set` is checked against `issues.txt`'s options for the `slavery` class —
  this is what caught the genuine `no_position_set` bug in TGC's `Wasteland.txt`). Anything else →
  `unknown-party-field`.
- `unit_names` — each key checked against the unit index, each value must be a block.
- Any other block-valued key — treated as a government-specific color override and validated as a
  color block.
- Any other scalar-valued key → `unknown-country-def-field`.

## `common/countries.txt` (the TAG → file-path list)

Classified as `commonOther` (see [file-classification.md](file-classification.md)) — not typed
beyond duplicate-TAG detection and stray-entry checks via the mod index (`dynamic_tags = yes` is
recognized as a special, non-TAG entry and excluded from the TAG list).

## Modifier keys

`checkModifierBody` and every "modifier value" field above accept a fixed set of **187 modifier
keys**, extracted from the NCE engine's `modifier_base` table
([src/data/modifierKeys.ts](../src/data/modifierKeys.ts)):

`admin_efficiency`, `administrative_efficiency`, `administrative_efficiency_modifier`,
`army_organisation`, `army_organization`, `army_tech_research_bonus`, `artisan_input`,
`artisan_output`, `artisan_throughput`, `assimilation_rate`, `attack`, `attacker`, `attrition`,
`badboy`, `boost_strongest_party`, `cb_creation_speed`, `cb_generation_speed_modifier`,
`civilization_progress_modifier`, `colonial_life_rating`, `colonial_migration`,
`colonial_prestige`, `combat_width`, `commerce_tech_research_bonus`, `conversion_rate`,
`core_pop_consciousness_modifier`, `core_pop_militancy_modifier`, `culture_tech_research_bonus`,
`defence`, `defender`, `defense`, `dig_in_cap`, `diplomatic_influence`, `diplomatic_points`,
`diplomatic_points_modifier`, `education`, `education_efficiency`,
`education_efficiency_modifier`, `factory_cost`, `factory_input`, `factory_maintenance`,
`factory_output`, `factory_owner_cost`, `factory_throughput`, `farm_rgo_eff`, `farm_rgo_size`,
`global_assimilation_rate`, `global_conversion_rate`, `global_immigrant_attract`,
`global_pop_consciousness_modifier`, `global_pop_growth`, `global_pop_militancy_modifier`,
`global_population_growth`, `goods_demand`, `icon`, `immigrant_attract`, `immigrant_push`,
`immigration`, `import_cost`, `increase_research`, `industry_tech_research_bonus`, `influence`,
`influence_modifier`, `issue_change_speed`, `land_attack_modifier`, `land_attrition`,
`land_defence_modifier`, `land_defense_modifier`, `land_organisation`, `land_organization`,
`land_unit_start_experience`, `leadership`, `leadership_modifier`, `life_rating`,
`literacy_con_impact`, `loan_interest`, `local_artisan_input`, `local_artisan_output`,
`local_artisan_throughput`, `local_factory_input`, `local_factory_output`,
`local_factory_owner_cost`, `local_factory_throughput`, `local_repair`, `local_rgo_input`,
`local_rgo_output`, `local_rgo_throughput`, `local_ruling_party_support`, `local_ship_build`,
`low_income_modifier`, `max_attrition`, `max_domestic_investment`, `max_loan_modifier`,
`max_military_spending`, `max_national_focus`, `max_social_spending`, `max_tariff`, `max_tax`,
`max_war_exhaustion`, `middle_everyday_needs`, `middle_income_modifier`, `middle_life_needs`,
`middle_luxury_needs`, `middle_savings_modifier`, `middle_vote`, `military_tactics`,
`min_build_bank`, `min_build_fort`, `min_build_naval_base`, `min_build_railroad`,
`min_build_university`, `min_domestic_investment`, `min_military_spending`, `min_social_spending`,
`min_tariff`, `min_tax`, `mine_rgo_eff`, `mine_rgo_size`, `minimum_wage`,
`mobilisation_economy_impact`, `mobilisation_impact`, `mobilisation_size`,
`mobilization_economy_impact`, `mobilization_impact`, `mobilization_size`, `morale`,
`movement_cost`, `naval_attack_modifier`, `naval_attrition`, `naval_defence_modifier`,
`naval_defense_modifier`, `naval_organisation`, `naval_organization`,
`naval_unit_start_experience`, `navy_tech_research_bonus`,
`non_accepted_pop_consciousness_modifier`, `non_accepted_pop_militancy_modifier`,
`number_of_voters`, `org_regain`, `pension_level`, `permanent_prestige`,
`political_reform_desire`, `poor_everyday_needs`, `poor_income_modifier`, `poor_life_needs`,
`poor_luxury_needs`, `poor_savings_modifier`, `poor_vote`, `pop_consciousness_modifier`,
`pop_growth`, `pop_militancy_modifier`, `population_growth`, `prestige`,
`regular_experience_level`, `reinforce_rate`, `reinforce_speed`, `research_points`,
`research_points_modifier`, `research_points_on_conquer`, `rgo_input`, `rgo_output`, `rgo_size`,
`rgo_throughput`, `rich_everyday_needs`, `rich_income_modifier`, `rich_life_needs`,
`rich_luxury_needs`, `rich_savings_modifier`, `rich_vote`, `ruling_party_support`,
`self_unciv_economic_modifier`, `self_unciv_military_modifier`, `seperatism`,
`social_reform_desire`, `soldier_to_pop_loss`, `supply_consumption`, `supply_limit`,
`supply_range`, `suppression_points_modifier`, `tariff_efficiency_modifier`, `tax_eff`,
`tax_efficiency`, `unciv_economic_modifier`, `unciv_military_modifier`, `unemployment_benefit`,
`unit_recruitment_time`, `unit_start_experience`, `war_exhaustion`.

These same 187 keys are also accepted (as numeric fields) inside technology/invention bodies, unit
schools, and national focus bodies — see
[poptypes-technologies-inventions.md](poptypes-technologies-inventions.md).
