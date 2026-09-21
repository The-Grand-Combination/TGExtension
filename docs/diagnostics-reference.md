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

## File names (`fileValidation.ts`)

Checked on the mod-root-relative path, so it covers the folders as well as the file, and reported
at the file's first character.

| Code | Severity | Meaning |
|---|---|---|
| `non-ascii-file-name` | error | The path carries a character outside printable ASCII. The game loads a file name as plain ASCII, so `history/provinces/3532 - São José.txt` is a file it never reads. The Map Editor folds an accent away when it names a file (`São` becomes `Sao`) and refuses to save a name with no ASCII shape at all — see [map-editor.md](map-editor.md). |

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
| `unknown-effect` | error | Same, in effect position. Building names from `common/buildings.txt` resolve here too, as `<building> = n` changes its level in province scope. |
| `expected-value` | error | A key that must hold a scalar has a block instead. |
| `invalid-value` | error | A scalar's raw text doesn't match any accepted kind for that field (or a `<`/`>`/`<=`/`>=` comparison is used on a non-number). |
| `unknown-<category>` | error | A scalar argument doesn't match any accepted identifier category (see the category list above); message names the category and suggests a close match. |
| `unknown-event-id` | error | An `event`-typed scalar argument (not the block form) doesn't match any indexed event id. |
| `broken-effect` | error | An effect the engine parses and accepts but does not run correctly (`BROKEN_EFFECTS` in `data/effects.ts`). Today that is `set_province_flag`. Reported in effect blocks and in province history, and the argument is not checked further. |
| `null-country-tag` | warning, off by default | A country value is a null tag — one matching `victorianTools.nullTags.pattern`, by default `QQQ`, `---` or `null`. The script means "no country", so it is not the `unknown-country` error. A tag that is merely undefined still is. |
| `null-tag-exploit` | warning, off by default | A null tag in a position where it is a known engine exploit rather than plain "no country". Today that is `war = { target = <null tag> }`, which tricks the AI into joining your war. The position declares the note in `data/effects.ts` (`exploitField`). |
| `uncolonize-province` | warning | `secede_province` given a tag the mod never defines (`QQQ` by convention), `null`, or `---`: the province goes to no one and is uncolonized (NCE `annex_to_null_province`). A deliberate modding trick that can crash the game, so it is not the `unknown-country` error. Off by default for a tag the null pattern matches; a merely undefined tag still warns. |

The three rows marked *off by default* are the null-tag family, silenced by
`victorianTools.nullTags.suppressWarnings` (on out of the box): a script that writes a null tag wrote
it on purpose, and a mod that uncolonizes by hand would otherwise read the same warning hundreds of
times. Untick **Suppress Null tag warnings** in the **Regex Patterns** tab to audit those spots. The
suppression only covers what `victorianTools.nullTags.pattern` matches — nothing else goes quiet, and
with an empty pattern it does nothing at all.
| `expected-block` | error | A key that must hold `{ ... }` has a scalar instead (also reused by many per-file validators for the same purpose). |
| `unknown-field` | error | A block field isn't in that block's known field table (generic; many validators reuse this exact code with a context-specific message). |
| `missing-field` | error | A required block field is absent. |
| `invalid-color` | error | A `color = { ... }` isn't exactly three plain numeric scalars (wrong count, a non-number entry, or comma-separated values). |
| `unknown-reform-option` | error | A reform-class value isn't any position of that class's option pool in `issues.txt` (issue options for party/political/social classes, reform options for economic/military ones), matching NCE's lookup. |
| `flag-never-set` | warning | A checked `has_country_flag`/`has_global_flag` value is never set anywhere in the mod (or the current buffer); also fires when the flag exists only in the *other* namespace. `victorianTools.flags.namePattern` narrows which flag names the check applies to; empty (the default) checks every flag. |
| `missing-localisation` | warning | A loc-key field's value has no matching key in `localisation/*.csv` (skipped when the mod has no localisation at all, and when the value does not match `victorianTools.localisation.keyPattern` — default `^EVT` — which marks it as literal display text). |
| `missing-picture` | warning | An event/decision `picture` value has no matching file under `gfx/pictures/{events,decisions}/` (skipped when that folder is absent). The value may name a subfolder — `picture = "Brasil/Dom Pedro"` is `gfx/pictures/events/Brasil/Dom Pedro.tga`. |

## Silencing a line

Any finding can be suppressed at the source: put `victorianTools.ignoreMarker` (default
`#VT - Skip Validation`) on the line and every finding that starts there is dropped. The marker is
a Paradox comment, so the game ignores it, and it is applied to the finished diagnostic list — the
codes below, the map CSVs and the cross-file duplicates alike. Being a comment, it belongs at the
**end** of a line: anything after it, a closing brace included, is commented out. Matched literally
(spacing included) but case-insensitively; an empty setting turns the escape hatch off.

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
| `reserved-country-tag` | A `common/countries.txt` tag is one the engine reads as a keyword elsewhere (`RESERVED_COUNTRY_TAGS` in `data/commonStructure.ts`), so a country cannot claim it. |
| `unknown-modifier-key` | A modifier-body field isn't `icon`, one of the 187 known modifier keys, a `<folder>_research_bonus` key granted by a tech folder of `common/technology.txt`, or a `min_build_<building>` key granted by `common/buildings.txt`. |
| `broken-modifier-key` | warning | A modifier key the engine documents, localises and parses but never applies (`BROKEN_MODIFIER_KEYS` in `data/modifierKeys.ts`): `rich_income_modifier`, `middle_income_modifier`, `poor_income_modifier`. Valid script that does nothing, so it is a warning and the value is still checked. |
| `missing-tech-folder` | `common/technology.txt` does not declare `army_tech` or `navy_tech`; the engine hardcodes both and will not load without them. |
| `unknown-culture-field` | An unrecognized field in a `cultures.txt` group or culture body. |
| `unknown-religion-field` / `unknown-good-field` | An unrecognized field in a `religion.txt`/`goods.txt` item body. |
| `unknown-ideology-field` | An unrecognized field in an `ideologies.txt` item body. |
| `unknown-government-field` | A `governments.txt` body key is neither a known field nor a known ideology toggle. |
| `multiple-building-modifiers` | A building body has more than one modifier value. The engine keeps one per building, so every modifier but the last is dead code. Building fields that share a modifier name (`infrastructure`, `fort_level`, `naval_capacity`, `colonial_points`) are fields, not modifiers, and are not counted. |
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
| `unknown-diplomacy-key` | A `history/diplomacy/` top-level key isn't `alliance`/`vassal`/`union`/`substate`/`reparations`. |
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
| `province-already-assigned` | warning | A province appears in two continents or two climates; the engine keeps the last. |
| `unknown-terrain` | error | A terrain palette `type` names no category defined in `terrain.txt`. |
| `duplicate-palette-index` | warning | A `terrain.bmp` palette index is mapped by two palette entries. |
| `csv-too-few-fields` | error | A CSV data row has fewer fields than the engine reads (4 for `definition.csv`, 5 for `adjacencies.csv`). |
| `duplicate-color` | error | Two `definition.csv` provinces share an RGB color. |
| `province-without-climate` | error | A land province is in no `map/climate.txt` block. |
| `province-without-state` | error | A land province is in no `map/region.txt` block, so the engine puts it in no state. |
| `unknown-adjacency-type` | error | An `adjacencies.csv` `Type` is not `sea`, `land`, `impassable`, or `canal`. |
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
| `province-too-big` | error | A province covers more than 200,000 pixels in `provinces.bmp`; the engine logs it as `Too big`. Reported at the province's first pixel. For scale: the largest province in the base game covers 69,522, and in TGC 171,927. |
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

## Flags (`flagValidation.ts`) — Full Report only

Cross-file, so it needs the whole stack rather than one file's text: a government block in
`common/governments.txt` carrying `flagType = x` makes the engine look for
`gfx/flags/<TAG>_x.tga` for every tag in `common/countries.txt`, and a government with no
`flagType` uses the default `gfx/flags/<TAG>.tga`. Flags are resolved over the stack, so one the
game files already provide counts as present. Dynamic tags (below `dynamic_tags = yes`) are left
out: a released dominion flies the flag of the country that released it.

| Code | Severity | Reported on | Meaning |
|---|---|---|---|
| `missing-flag` | error | the tag in `common/countries.txt` | The tag has no flag for one or more flag types (the default `<TAG>.tga` included). One finding per tag, listing every file it lacks. |
| `flag-name-case` | warning | the tag in `common/countries.txt` | The flag is on disk under another spelling (`SUA_Communist.tga` for `SUA_communist.tga`). Windows opens it anyway, but the name no longer matches the tag and the flag type. |
| `flag-type-without-art` | error | the `flagType` value in `common/governments.txt` | Not one tag has a flag for that flag type — a flag type with no art at all, reported once instead of once per tag. |

## Essential tags (`essentialTagsValidation.ts`) — Full Report only

Tags the engine needs by name. `REB` is the one the base game cannot do without: every rebel army
in the game belongs to it, so a mod that drops it has no one to rise up. It has to be declared in
`common/countries.txt` **above** `dynamic_tags = yes` — below that line the engine reads a tag as
one to hand out to a released nation, not as a country of its own — and the country definition it
points at has to be somewhere in the stack.

The path in `common/countries.txt` is relative to `common/`, not to `history/`: `"countries/rebels.txt"`
is `common/countries/rebels.txt`, which carries the colour and the party list. A tag's *history*
file is found another way, by the three characters its file name starts with (see the great-power
check). The definition is resolved over the stack, so a mod that does not replace `common/`
inherits the base game's copy and passes — which is how TTA passes without one of its own.

A history file is **not** required: MGQ ships none for `REB` and runs. The flag is covered by the
flag check, since `REB` is in the country list like any other tag.

| Code | Severity | Reported on | Meaning |
|---|---|---|---|
| `missing-essential-tag` | error | the tag in `common/countries.txt`, or the file's first character when it is absent | An essential tag is not declared, or is declared below `dynamic_tags = yes`. |
| `missing-country-definition` | error | the tag in `common/countries.txt` | An essential tag points at a `common/countries/` file no layer of the stack has. |

## Pops (`popsValidation.ts`) — Full Report only

The engine reads a province's starting pops from `history/pops/<date>/`, and a province left with
pops but no owner crashes the game. A mod that hides the base game's copy with `replace_path`, or
that blanks it file by file, therefore owns the whole set: every file the base game ships for that
date has to be there, under exactly that name. An empty file is enough — that is what a total
conversion ships for the countries it does not use.

Matching is by **file name**, not by id: a pops file holds many provinces and its name carries
nothing the engine reads, so only a file of the same name takes the base game's copy out of play.
The base game's list lives in [`src/data/vanillaPops.ts`](../src/data/vanillaPops.ts): 179 files in
each of `1836.1.1` and `1861.4.14`, generated from a clean Heart of Darkness install.

The check reads the **stack**, which is what makes it right in all three cases with no special
casing: a mod that does not replace `history` still has the base game's files underneath it, a
submod has whatever the mod it depends on provides, and a mod that replaces `history` is on its own.
A date folder the stack does not have at all is not judged — the base game ships pops for a second
bookmark that a mod with one bookmark drops, and those mods run.

| Code | Severity | Reported on | Meaning |
|---|---|---|---|
| `missing-pops-file` | error | the `replace_path` line of the mod's `.mod` file, or its first line | A date folder the stack has is missing some of the base game's pops files. One finding per date folder; the message counts them and names the first few. |

## Great powers (`greatPowerValidation.ts`) — Full Report only

`GREAT_NATIONS_COUNT` in `common/defines.lua` is how many great powers the game seats at start,
and it seats them from the countries that qualify: `civilized = yes` in `history/countries`, and
provinces in at least two state regions of `map/region.txt`. With fewer qualifying countries than
seats, the game crashes on load. The world is read at the `start_date` of `defines.lua`, dated
blocks up to that date included, over the whole stack; a tag is matched to its history file by the
three characters the file name starts with (`ENG - United Kingdom.txt`), the way the engine does
it, not by the path in `common/countries.txt` — that one points at `common/countries/`.

| Code | Severity | Reported on | Meaning |
|---|---|---|---|
| `too-few-great-powers` | error | the count in `common/defines.lua` | Fewer countries qualify than `GREAT_NATIONS_COUNT` seats. The message names the countries closest to qualifying and the count the world would support. |

Silent when `defines.lua` carries no `GREAT_NATIONS_COUNT` (the engine then uses its own default)
or when the stack has no `common/countries.txt` to read a world from.

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
