# Diagnostics reference

Every diagnostic code the extension emits, grouped by the layer that produces it (see
[architecture.md](architecture.md) for the pipeline). Severity is `error` unless noted otherwise.
Codes with a `<category>` placeholder are generated dynamically — one per `IdentifierCategory`
(see [mod-index.md](mod-index.md)), e.g. `unknown-country`, `unknown-culture`, `unknown-ideology`,
`unknown-good`, `unknown-government`, `unknown-modifier`, `unknown-nationalvalue`,
`unknown-cbtype`, `unknown-crime`, `unknown-poptype`, `unknown-rebeltype`,
`unknown-graphicalculture`, `unknown-province`, `unknown-stateregion`, `unknown-continent`,
`unknown-terrain`, `unknown-technology`, `unknown-invention`, `unknown-reformclass`,
`unknown-reformoption`, `unknown-issue`, `unknown-unit`, `unknown-trait`, `unknown-event-id`.

## Syntax (`parser/lexer.ts`, `parser/parser.ts`)

Always active, even with no mod root found.

| Code | Meaning |
|---|---|
| `unterminated-string` | A quoted string never closes before end of file. |
| `unexpected-brace` | A `}` appears with no matching `{`. |
| `unexpected-token` | A token doesn't fit anywhere the parser expects one (recovers and continues). |
| `unbalanced-brace` | A `{` is never closed by end of file. |

## Structure (`structureValidation.ts`)

`events`/`decisions` only; runs without a mod index.

| Code | Severity | Meaning |
|---|---|---|
| `unexpected-top-level` | error | A bare value/block sits at the file's top level instead of a `country_event`/`province_event`/`political_decisions` block. |
| `unknown-top-level-key` | error | A top-level key isn't one of the file type's allowed keys. |
| `expected-block` | error | A key that must hold `{ ... }` has a scalar value instead. |
| `event-missing-id` | error | An event block has no `id`. |
| `event-missing-title` | warning | An event block has no `title`. |
| `event-missing-desc` | warning | An event block has no `desc`. |
| `event-no-option` | warning | An event has zero `option` blocks — the player can never dismiss it. |
| `duplicate-decision-name` | error | Two decisions in the **same parse** share a name (see also the semantic, cross-file version below). |
| `decision-missing-potential` | warning | A decision has no `potential`. |
| `decision-missing-effect` | warning | A decision has no `effect`. |

## Semantic — shared walker (`validationWalker.ts`)

Used across every file type that walks triggers/effects/weight-blocks/field tables.

| Code | Severity | Meaning |
|---|---|---|
| `stray-value` | error | A bare scalar sits where only `key = value` is allowed. |
| `stray-block` | error | A bare `{ ... }` sits where only `key = value` is allowed. |
| `wrong-context` | error | A scope-changer restricted to trigger-only or effect-only is used in the other context. |
| `wrong-scope` | error | A trigger/effect/scope-changer is used from a scope not in its allowed set (message lists the valid scopes). |
| `unknown-trigger` | error | A key in trigger position isn't a known trigger, scope-changer, or resolvable dynamic key. Includes a "did you mean" suggestion. |
| `unknown-effect` | error | Same, in effect position. |
| `expected-value` | error | A key that must hold a scalar has a block instead. |
| `invalid-value` | error | A scalar's raw text doesn't match any accepted kind for that field (or a `<`/`>`/`<=`/`>=` comparison is used on a non-number). |
| `unknown-<category>` | error | A scalar argument doesn't match any accepted identifier category (see the category list above); message names the category and suggests a close match. |
| `unknown-event-id` | error | An `event`-typed scalar argument (not the block form) doesn't match any indexed event id. |
| `uncolonize-province` | warning | `secede_province` given a tag the mod never defines (`QQQ` by convention), `null`, or `---`: the province goes to no one and is uncolonized (NCE `annex_to_null_province`). A deliberate modding trick that can crash the game, so it is not the `unknown-country` error. |
| `expected-block` | error | A key that must hold `{ ... }` has a scalar instead (also reused by many per-file validators for the same purpose). |
| `unknown-field` | error | A block field isn't in that block's known field table (generic; many validators reuse this exact code with a context-specific message). |
| `missing-field` | error | A required block field is absent. |
| `invalid-color` | error | A `color = { ... }` isn't exactly three plain numeric scalars (wrong count, a non-number entry, or comma-separated values). |
| `unknown-reform-option` | error | A reform-class value isn't any position of that class's option pool in `issues.txt` (issue options for party/political/social classes, reform options for economic/military ones), matching NCE's lookup. |
| `flag-never-set` | warning | A checked `has_country_flag`/`has_global_flag` value is never set anywhere in the mod (or the current buffer); also fires when the flag exists only in the *other* namespace. |
| `missing-localisation` | warning | A loc-key field's value has no matching key in `localisation/*.csv` (skipped when the mod has no localisation at all). |
| `missing-picture` | warning | An event/decision `picture` value has no matching file in `gfx/pictures/{events,decisions}/` (skipped when that folder is absent). |

## Events / decisions (`semanticValidation.ts`)

| Code | Severity | Meaning |
|---|---|---|
| `unknown-event-field` | error | An event body key isn't a recognized structural/trigger/effect field. |
| `duplicate-event-id` | error | An event `id` is also defined elsewhere in the mod (or twice in the same file). |
| `unknown-decision-field` | error | A decision body key isn't recognized. |
| `duplicate-decision-name` | error | A decision name is also defined in another file (cross-file; see also the same-parse structural check above). |

## `common/` file validators (one `*Validation.ts` service per grammar)

| Code | Meaning |
|---|---|
| `unknown-cbtype` | A `peace_order` entry isn't a known CB type name. |
| `unknown-cb-field` | An unrecognized field in a `cb_types.txt` body. |
| `unknown-rebel-field` | An unrecognized field in a `rebel_types.txt` body. |
| `unknown-government` | A rebel-type `government` map key/value isn't a known government. |
| `unknown-on-action` | An `on_actions.txt` top-level key isn't one of the engine's fixed hooks (it would never fire). |
| `unknown-issue-option-field` | An unrecognized field inside an `issues.txt` option body. |
| `unknown-rule` | An `issues.txt` option's `rules` block has a key outside the fixed 33 game-rule toggles. |
| `unknown-country` | A `country_colors.txt` top-level key isn't a known TAG. |
| `unknown-modifier-key` | A modifier-body field isn't `icon` or one of the 187 known modifier keys. |
| `unknown-culture-field` | An unrecognized field in a `cultures.txt` group or culture body. |
| `unknown-religion-field` / `unknown-good-field` | An unrecognized field in a `religion.txt`/`goods.txt` item body. |
| `unknown-ideology-field` | An unrecognized field in an `ideologies.txt` item body. |
| `unknown-government-field` | A `governments.txt` body key is neither a known field nor a known ideology toggle. |
| `unknown-building-field` | An unrecognized field in a `buildings.txt` body. |
| `unknown-static-modifier` | A `static_modifiers.txt` top-level name isn't one of the engine's 39 fixed names. |
| `unknown-trait-stat` | A `traits.txt` leader stat isn't one of the fixed stat names. |
| `unknown-production-field` | An unrecognized field in a `production_types.txt` body. |
| `unknown-pop-chance` | A `pop_types.txt` top-level key isn't one of the seven fixed chance names. |
| `unknown-party-field` | An unrecognized field in a country definition's `party` body. |
| `unknown-unit` | A `unit_names` key isn't a known unit type. |
| `unknown-country-def-field` | An unrecognized top-level field in `common/countries/<name>.txt`. |

## `poptypes/`, `technologies/`, `inventions/` (`popTypeValidation.ts`, `technologyValidation.ts`)

| Code | Meaning |
|---|---|
| `unknown-poptype-field` | An unrecognized field in a `poptypes/<name>.txt` file. |
| `unknown-issue` | A pop type's `issues` map key isn't a known issue/reform-position. |
| `unknown-tech-field` | An unrecognized field in a technology body. |
| `unknown-invention-field` | An unrecognized field in an invention body. |
| `unknown-invention-effect` | An unrecognized field inside an invention's `effect` block. |
| `unknown-unit-modifier` | An unrecognized stat inside a unit-modifier block (`army_base`/`navy_base`/unit name). |

## `history/*` (`historyValidation.ts`)

| Code | Meaning |
|---|---|
| `unknown-country-history-key` | An unrecognized key in a `history/countries/` entry. |
| `unknown-decision` | A `decision` reference in country history doesn't match any indexed decision. |
| `unknown-province-history-key` | An unrecognized key in a `history/provinces/` entry. |
| `unknown-poptype` | A `history/pops/` province entry's key isn't a known pop type. |
| `unknown-diplomacy-key` | A `history/diplomacy/` top-level key isn't `alliance`/`vassal`/`union`/`substate`. |
| `unknown-oob-key` | An unrecognized top-level key in a `history/units/` (order of battle) file. |
| `unknown-war-key` | A `history/wars/` top-level key is neither a date block nor `name`. |

## `map/` (`mapValidation.ts`, `mapCsvValidation.ts`)

Shared codes reused here with map-specific messages: `unknown-field`, `unknown-modifier-key`,
`invalid-value`, `invalid-color`, `missing-field`, `expected-block`, `expected-value`,
`stray-value`, `stray-block`, `unknown-province`. See [map-folder.md](map-folder.md).

| Code | Severity | Meaning |
|---|---|---|
| `province-id-too-large` | error | A province id is at or above `default.map` `max_provinces`. |
| `unknown-province` | error | A province id is not defined in `map/definition.csv`. |
| `duplicate-province` | warning | The same id is listed twice in one state/continent/climate/`sea_starts`, or has two `positions.txt` blocks. |
| `sea-province-in-state` | warning | A `sea_starts` id sits inside a state in `region.txt`/`super_region.txt`. |
| `state-mixes-provinces` | warning | A region block mixes provinces already in a state with unassigned ones; NCE splits it. |
| `province-already-assigned` | warning | A province appears in two continents or two climates; the engine keeps the last. |
| `unknown-terrain` | error | A terrain palette `type` names no category defined in `terrain.txt`. |
| `duplicate-palette-index` | warning | A `terrain.bmp` palette index is mapped by two palette entries. |
| `csv-too-few-fields` | error | A CSV data row has fewer fields than the engine reads (4 for `definition.csv`, 5 for `adjacencies.csv`). |
| `duplicate-color` | error | Two `definition.csv` provinces share an RGB color. |
| `unknown-adjacency-type` | error | An `adjacencies.csv` `Type` is not `sea`, `land`, `impassable`, or `canal`. |
| `expected-sea-province` | warning | A `sea` adjacency passes `Through` a province not in `sea_starts`. |
| `ignored-adjacency` | warning | A row with `To <= 0` and a type other than `impassable`; the engine skips it. |
| `invalid-canal` | error | A `canal` row lacks the canal province in `Through` or a canal id above zero in `Data`. |

## Map bitmaps (`mapImageAudit.ts`, `riverAnalysis.ts`) — Map Report only

Reported by the side bar action **Map Report**, one section per mod, with pixel positions (x, y from
the top-left corner). See [map-images.md](map-images.md).

| Code | Severity | Meaning |
|---|---|---|
| `map-file-missing` | error | `provinces.bmp`, `terrain.bmp` or `rivers.bmp` is not in the mod stack. |
| `bmp-unsupported` | error | Not a BMP, compressed, or the wrong bit depth (24/32-bit provinces, 8-bit terrain and rivers). |
| `map-size-mismatch` | error | `terrain.bmp` or `rivers.bmp` is not the size of `provinces.bmp`. |
| `map-size-not-multiple` | error | The map height is not a multiple of 144, which the game requires (the width is free). |
| `nonstandard-palette` | error | `terrain.bmp` or `rivers.bmp` does not carry the standard palette; Enforce Colormaps rewrites it. |
| `unknown-color` | error | A `provinces.bmp` color has no `definition.csv` row (lake rows with an empty id excepted); the engine makes it province 0. |
| `province-without-pixels` | warning | A `definition.csv` province has no pixel. |
| `terrain-index-unmapped` | error | A land pixel's terrain index is ≥ 64 (painted as plains) or has no `color = { N }` entry in `terrain.txt`. |
| `land-over-ocean-terrain` | warning | Land province pixels painted ocean (254) in `terrain.bmp`. |
| `terrain-over-sea` | warning | Sea province pixels painted with a land terrain index. |
| `terrain-without-province` | warning | Land terrain where `provinces.bmp` has no province. |
| `river-isolated-pixel` | warning | A river pixel with no river neighbour (8-neighbourhood); nothing is drawn for it. |
| `river-merge-detached` | error | A merge pixel (1) touching fewer than two river pixels. |
| `river-thick` | warning | A 2×2 block of river pixels; rivers are one pixel wide. |
| `river-without-source` | warning | A connected river with no source pixel; the engine never draws it. |
| `river-not-reaching-sea` | warning | A connected river that touches no sea pixel anywhere (closed basin). |
| `river-over-sea` | warning | River pixels on sea provinces (river mouths drawn into the sea); one line. |
| `river-sea-over-land` / `river-land-over-sea` | warning | `rivers.bmp` sea (254) on a land province / land (255) on a sea province; one line each. |

## Index-time duplicates (`modIndex.ts`)

| Code | Severity | Meaning |
|---|---|---|
| `duplicate-identifier` | error | Same category + name defined more than once (same file, or across files) — see [mod-index.md](mod-index.md). |
| `duplicate-modifier-name` | warning | A modifier name is reused across different modifier files only (legal in the engine, but may confuse localisation). |

## Reading a diagnostic's "did you mean"

Most `unknown-*` diagnostics append a suggestion via Levenshtein distance
(`src/services/suggestions.ts`) against the full candidate list for that context — e.g.
`unknown-trigger` suggests from every trigger name, every scope-changer name, and every indexed
ideology name (since an ideology name is a legal dynamic trigger key).
