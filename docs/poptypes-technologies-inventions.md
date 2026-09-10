# `poptypes/`, `technologies/`, `inventions/`

## `poptypes/<name>.txt` → `validatePopTypeFile`

One pop type per file; every field is top-level (no grouping block). File name = pop type's
identifier for the mod index.

- Scalar fields (`POPTYPE_SCALAR_FIELDS`): `sprite` (number), `is_artisan` (`yesno`), `max_size`
  (number), `merge_max_size` (number), `strata` (`poor`/`middle`/`rich`), `state_capital_only`
  (`yesno`), `unemployment` (`yesno`), `equivalent` (a pop type reference), `allowed_to_vote`
  (`yesno`), `is_slave` (`yesno`), `can_be_recruited` (`yesno`), `leadership` (number),
  `research_optimum` (number), `demote_migrant` (`yesno`), `administrative_efficiency` (`yesno`),
  `tax_eff` (number), `can_build` (`yesno`), `research_points` (number),
  `can_reduce_consciousness` (`yesno`), `factory` (`yesno`), `workplace_input` (number),
  `workplace_output` (number), `starter_share` (number), `can_work_factory` (`yesno`).
- `color` — color block.
- `life_needs_income` / `everyday_needs_income` / `luxury_needs_income` — accepted, not further
  validated (`POPTYPE_INCOME_FIELDS`).
- `rebel` — a `unit type → number` map.
- `life_needs` / `everyday_needs` / `luxury_needs` (`POPTYPE_GOODS_FIELDS`) — `good → number` maps.
- `country_migration_target` (weight block at **`country`** scope), `migration_target` (weight
  block at **`province`** scope) — NCE `read_*migration_target`.
- `promote_to` — a `pop type → weight block` map (`pop` scope).
- `ideologies` — an `ideology → weight block` map (`pop` scope).
- `issues` — an `issue → (number | weight block)` map; the issue key is checked against
  `common/issues.txt`'s indexed positions (`unknown-issue`).
- Anything else → `unknown-poptype-field`.

## `technologies/<folder>.txt` → `validateTechnologyFile`

One block per technology (NCE `technology_contents`):

- Scalar fields (`TECH_SCALAR_FIELDS`): `area` (identifier), `year` (number), `cost` (number),
  `unciv_military` (`yesno`), `unit` (number), `activate_unit` (a unit reference),
  `activate_building` (a building reference), `colonial_points` (number), `plurality` (number),
  `shared_prestige` (number).
- `ai_chance` — weight block at `country` scope.
- Goods maps (`TECH_GOODS_MAP_FIELDS`: `rgo_goods_output`, `rgo_goods_throughput`, `rgo_size`,
  `factory_goods_output`, `factory_goods_throughput`, `factory_goods_input`) — `good → number`
  maps.
- Any recognized modifier key (the same 187-key set, see
  [common-folder.md](common-folder.md#modifier-keys)) — numeric.
- `max_<building>` where `<building>` is a known building — numeric (raises that building's level
  cap; NCE "any_value" rule).
- A unit-modifier target (`army_base`, `navy_base`, or any known unit type name) — a block of
  `UNIT_MODIFIER_FIELDS` (`default_organisation`, `maximum_speed`, `build_time`,
  `supply_consumption`, `attack`, `defence`/`defense`, `support`, `siege`, `hull`, `gun_power`,
  `torpedo_attack`, `reconnaissance`, `fire_range`, `maneuver`, `evasion`, `discipline`), each
  numeric.
- Anything else → `unknown-tech-field`.

## `inventions/<folder>.txt` → `validateInventionFile`

One block per invention (NCE `invention_contents`). Same base handling as technologies
(`handleTechnologyField` is reused), plus:

- `limit` — walked as a **trigger at `country` scope**.
- `chance` — walked as a weight block at `country` scope.
- `news` — accepted, not further validated.
- `effect` — its own body (`validateInventionEffect`):
  - `INVENTION_EFFECT_SCALAR_FIELDS`: `activate_unit` (unit), `activate_building` (building),
    `enable_crime` (crime), `gas_attack`/`gas_defence`/`gas_defense` (`yesno`), `shared_prestige`
    (number), `plurality` (number), `colonial_points` (number).
  - `rebel_org_gain` — a block with `value` (number) and `faction` (accepted, unchecked); anything
    else inside it → `unknown-field`.
  - Goods maps (same `TECH_GOODS_MAP_FIELDS` as above).
  - Modifier keys, `max_<building>`, and unit-modifier targets — same rules as technology bodies.
  - Anything else → `unknown-invention-effect`.
- Any other top-level field falls through to the technology field handler above; still unmatched →
  `unknown-invention-field`.

See [mod-index.md](mod-index.md) for how technology/invention names themselves are indexed (folder
scan across `technologies/` and `inventions/`, with duplicate-name detection).
