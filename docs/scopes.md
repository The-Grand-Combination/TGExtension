# Scopes

The walker ([src/services/validationWalker.ts](../src/services/validationWalker.ts)) tracks a
single `(mode, scope)` pair while descending through a trigger or effect body:

- `mode` is `'trigger'` or `'effect'` (a `UsageContext`) — which dataset (`TRIGGERS` or `EFFECTS`)
  is consulted, and whether a scope-changer restricted to one context is even legal here.
- `scope` is a `ScopeType`: `'country' | 'province' | 'state' | 'pop'`.

Every trigger, effect, and scope-changer definition carries its own **exact** scope set copied from
the NCE engine parser's main-slot checks (`trigger_parsing.cpp` / `effect_parsing.cpp`) — including
scopes the wiki doesn't document. There is **no blanket fallback**: if `infrastructure` is not
listed for `pop` scope, using it there is an error, full stop. This was a deliberate design
decision after an earlier version's blanket "province effects also work from country" fallback
produced ~4,400 false positives in one calibration run; every widening now has to be an explicit,
individually-verified scope entry (`src/data/scopes.ts`, `triggers.ts`, `effects.ts` document a few
with a "corpus Nx" comment recording the calibration evidence).

## Where a walk starts

| Context | Starting scope |
|---|---|
| `country_event` body | `country` |
| `province_event` body | `province` |
| decision body | `country` |
| `crime.txt` entry `trigger` | `province` |
| `triggered_modifiers.txt` entry `trigger` | `country` |
| CB `can_use` / `is_valid` / `prerequisites` / `allowed_countries` | `country` |
| CB `allowed_states` / `allowed_substate_regions` / `allowed_states_in_crisis` | `state` |
| CB `on_add` / `on_po_accepted` | `country` |
| `national_focus.txt` focus `limit` | `province` |
| `rebel_types.txt` `will_rise` | `country`; `spawn_chance` | `pop`; `movement_evaluation` | `province` |
| `rebel_types.txt` `demands_enforced_trigger`/`_effect` | `country`; `siege_won_trigger`/`_effect` | `province` |
| `issues.txt` option `allow` / `on_execute` | `country` |
| `on_actions.txt` hook bodies | not walked (only the fired-event scalar is checked) |
| `pop_types.txt` chance blocks | `pop` |
| `production_types.txt` `bonus`/`input_bonus` trigger | `state` |
| `news/*.txt` `trigger` blocks | `country` |
| `poptypes/<name>.txt` `migration_target` | `province`; `country_migration_target` | `country` |
| `common/countries/<name>.txt` party `trigger` | `country` |

## Passthrough constructs (keep the current scope)

- `and` / `or` / `not` (trigger context) — recurse at the same scope.
- `limit` (effect context) — its body is walked as a **trigger** at the current scope.
- `random = { chance = n ... }` (effect) — strips `chance`, walks the rest as effects at the same
  scope.
- `random_list = { 50 = { ... } 50 = { ... } }` (effect) — each weighted block is walked as effects
  at the same scope.
- `hidden_tooltip = { ... }` (the only entry in `EFFECT_PASSTHROUGH_KEYS`) — walked as effects at
  the same scope; it only suppresses the tooltip.
- `modifier = { factor = n <conditions> }` inside a weight block (`mean_time_to_happen`,
  `ai_chance`, `ai_will_do`, pop chances, ideology reform desires, ...) — the duration/factor
  keys (`months`, `days`, `years`, `factor`, `base`) are skipped; the rest is walked as a trigger at
  the same scope.
- `group = { modifier = {...} modifier = {...} }` inside a weight block — bundles several
  `modifier` entries; recurses into `walkWeightBlock` at the same scope.
- `this` / `from` (`IMPLICIT_SCOPES`) — back-references; both always resolve to `country` scope in
  events/decisions.

## Dynamic scope keys (resolved against the mod index, not hard-coded)

These are not in `SCOPE_CHANGERS` — `enterDynamicScope` (trigger/effect) resolves them at
validation time:

- A country TAG (`ENG = { ... }`) → `country` scope.
- A pure-numeric key that is a known province id (`619 = { ... }`) → `province` scope (works in
  both trigger and effect position — the wiki calls province-as-scope-key "effect-only", but the
  engine and TGC both use it in `potential`/triggers too, so it is treated as valid in both).
- A `map/region.txt` state/region name (`USA_1 = { ... }`) → iterates that region's provinces,
  scope `province` (NCE `tr_scope_variable` / `ef_scope_variable`).

Additionally, in trigger context only: an ideology/issue/technology/invention/good name used as a
bare key (`liberal = 10`, `moralism = 10`, `flintlock_rifles = 1`, `machine_parts = 25`) requires a
numeric value and does not change scope; a reform class name (`slavery = yes_slavery`) is checked
as a reform-option value (see [mod-index.md](mod-index.md#reform-classes-and-options)); a pop type
name as a key scopes into that pop type's pops (`farmers = { ... }` → `pop` scope) or, with a
numeric value, tests the pop share (`farmers = 0.5`).

In effect context: a trade good name (`machine_parts = 25`) requires a numeric value (adds to the
stockpile); a pop type name scopes into `pop` (`farmers = { ... }`); a reform class name is checked
as a reform-option value the same way as in trigger context.

## Scope-changer reference

Every entry below is exact per the NCE parser: the `From` column is the complete list of scopes it
may be used from (not a subset), `Produces` is the resulting scope (a `from → to` pair when it
depends on the origin scope, e.g. `all_core`/`any_core` swap country ↔ province), and `Context` is
`trigger`, `effect`, or `both`.

| Name | From | Produces | Context | Notes |
|---|---|---|---|---|
| `all_core` | country, province | province (from country) / country (from province) | both | Every core: provinces of a country, or core nations of a province. |
| `any_core` | country, province | province (from country) / country (from province) | both | Any core: provinces of a country, or core nations of a province. |
| `any_country` | any | country | effect | Every country (effects only; self excluded in decisions). |
| `any_empty_neighbor_province` | province | province | effect | Every uncolonised neighbor province. |
| `any_greater_power` | any | country | both | Any/every Great Power. |
| `any_neighbor_country` | country, pop | country | both | Any/every bordering country. |
| `any_neighbor_province` | province, state | province | both | Any/every land neighbor province. |
| `any_owned` | country, state, province | province | effect | Every owned province (use limit to filter). |
| `any_owned_province` | country, state, province | province | trigger | Any owned province. |
| `any_pop` | country, province, state | pop | both | Any/every pop in scope. |
| `any_sphere_member` | country | country | trigger | Any/every country in our sphere. |
| `any_state` | country | state | both | Any/every owned state. |
| `any_substate` | country | country | trigger | Any/every substate of ours. |
| `capital_scope` | country, province, pop | province | both | The capital province. |
| `controller` | province | country | both | The controlling country (occupier in war). |
| `country` | country, province, state, pop | country | both | The owning country (prefer owner). |
| `crisis_attacker_scope` | any | state | trigger | The crisis attacker side. |
| `crisis_defender_scope` | any | state | trigger | The crisis defender side. |
| `crisis_state_scope` | any | state | both | The state the crisis is about. |
| `cultural_union` | country, pop | country | both | The cultural union country. |
| `flashpoint_tag_scope` | state | country | both | The nation the flashpoint would liberate. |
| `independence` | any | country | both | The nation the scoped rebels fight to establish. |
| `location` | pop, province | province | both | The pop's province. |
| `middle_strata` | country, province, state | pop | effect | Every middle-strata pop in scope. |
| `overlord` | country | country | both | Our overlord (if we are a vassal). |
| `owner` | province, state, country | country | both | The owning country. |
| `poor_strata` | country, province, state | pop | effect | Every poor-strata pop in scope. |
| `random_country` | any | country | effect | One random matching country. |
| `random_empty_neighbor_province` | province | province | effect | One random uncolonised neighbor. |
| `random_neighbor_country` | country | country | effect | One random bordering country. |
| `random_neighbor_province` | province | province | effect | One random land neighbor. |
| `random_owned` | country, state, province | province | effect | One random owned province. |
| `random_pop` | country, province, state | pop | effect | One random matching pop. |
| `random_province` | country, state, province | province | effect | One random owned province. |
| `random_state` | country | state | effect | One random owned state. |
| `rich_strata` | country, province, state | pop | effect | Every rich-strata pop in scope. |
| `sea_zone` | province | province | both | Each adjacent sea tile. |
| `sphere_owner` | country | country | both | The sphere leader we belong to. |
| `state_scope` | province, state, pop | state | both | The state this province belongs to. |
| `war_countries` | country, pop | country | trigger | Every country at war with the scoped one. |

Using a scope-changer in the wrong context (e.g. `random_country` inside a `trigger` block) reports
`wrong-context`; using it from a scope not in its `From` list reports `wrong-scope`
(see [diagnostics-reference.md](diagnostics-reference.md)).
