# The mod index

[src/services/modIndex.ts](../src/services/modIndex.ts) builds a `ModIndex`
([src/model/modIndex.ts](../src/model/modIndex.ts)) once per mod root (cached, refreshed in the
background on a 500ms-debounced `onDidChangeWatchedFiles`) by reading and parsing the mod's own
files. The build is a list of short steps; `buildModIndex` runs them back to back (tests, scripts)
and `buildModIndexAsync` yields to the event loop between them (the language server). This is what makes reference validation possible ("is this TAG/culture/event id real?")
without hard-coding any mod's content. Missing files simply yield empty categories — no crash, and
categories that are empty **skip their own check** everywhere (`isEmptyCategory`), so a mod that
doesn't define, say, `common/traits.txt` doesn't get flooded with "unknown trait" errors from every
file that references one by name.

## Identifier categories and where each comes from

| Category | Source | Notes |
|---|---|---|
| `country` | `common/countries.txt` (scalar-valued assignments, `dynamic_tags` excluded) | specials: `this`, `from`, `owner`, `this_union`; duplicate TAGs checked |
| `culture` | `common/cultures.txt` items (group → item) | specials: `this`, `from`, `union`; duplicates checked |
| `cultureGroup` | `common/cultures.txt` groups | duplicates checked |
| `religion` | `common/religion.txt` items | specials: `this`, `from`; duplicates checked |
| `good` | `common/goods.txt` items | duplicates checked |
| `ideology` | `common/ideologies.txt` items | duplicates checked |
| `trait` | `common/traits.txt` items (personality/background → name) | |
| `government` | `common/governments.txt` top-level keys | duplicates checked |
| `building` | `common/buildings.txt` top-level keys | special: `factory` (means "any factory"); duplicates checked |
| `nationalValue` | `common/nationalvalues.txt` top-level keys | duplicates checked |
| `cbType` | `common/cb_types.txt` top-level keys, excluding `peace_order` | duplicates checked |
| `crime` | `common/crime.txt` top-level keys | duplicates checked |
| `rebelType` | `common/rebel_types.txt` top-level keys | duplicates checked |
| `graphicalCulture` | `common/graphicalculturetype.txt` bare scalar list | |
| `modifier` | union of `common/event_modifiers.txt`, `common/triggered_modifiers.txt`, `common/static_modifiers.txt` top-level keys, and `common/technology.txt`'s `schools` keys | duplicates checked (cross-file modifier name reuse is a warning, not an error — see below) |
| `reformClass` | `common/issues.txt` category → class names | duplicates checked |
| `reformOption` | `common/issues.txt` reform-category class → option names (not `party_issues`) | per-class option sets also kept separately, see below |
| `issue` | `common/issues.txt` `party_issues` positions **and** reform options together | pop support / `dominant_issue` / `move_issue_percentage` all reference this combined set |
| `popType` | file names under `poptypes/` (extension stripped) | |
| `province` | `map/definition.csv` first column (numeric rows only) | duplicates checked |
| `stateRegion` | `map/region.txt`, `map/region_sea.txt`, `map/super_region.txt` top-level keys | duplicates checked within each file only: NCE resolves `region = X` and `X = { ... }` scope keys against states and meta-regions alike, and a name mirrored in `region.txt` and `super_region.txt` is legal (the engine keeps the last) |
| `continent` | `map/continent.txt` top-level keys | |
| `terrain` | `map/terrain.txt` → `categories` block keys | |
| `technology` | every top-level key across every `technologies/*.txt` file | duplicates checked |
| `invention` | every top-level key across every `inventions/*.txt` file | duplicates checked |
| `unit` | every top-level key across every `units/*.txt` file | duplicates checked |
| `locKey` | every localisation key across `localisation/*.csv` | first definition wins |
| `eventPicture` | `.tga`/`.dds` paths under `gfx/pictures/events/`, extension stripped, subfolders included | listed recursively, so `events/Brasil/Dom Pedro.tga` is indexed as `brasil/dom pedro` |
| `decisionPicture` | same, under `gfx/pictures/decisions/` | |
| `event` | every `id` under `country_event`/`province_event` across `events/*.txt` | |

Country, culture, religion, good, ideology, government, building, national value, CB type, crime,
rebel type, reform class, province, state/region, technology, invention, and unit all run through
`collectDuplicates`: a name defined more than once across the mod's files for that category is
recorded, and surfaced per-file (see below).

## Map data beyond identifiers

Three more fields come from `map/` and back the [map validators](map-folder.md):

- `maxProvinces` — `max_provinces` from `map/default.map` (`undefined` when absent). Valid province
  ids are `1 .. max_provinces - 1`, exactly as NCE sizes its province table.
- `seaProvinces` — the ids listed in `default.map` `sea_starts`. Used to flag sea zones inside
  states and land provinces used as strait sea zones.
- `stateOfProvince` — province id → the state that first claimed it, replaying NCE's
  `make_state_definition` over `region.txt`, then `region_sea.txt`, then `super_region.txt`: a block
  whose provinces are all already assigned is a meta-region and claims nothing; otherwise its
  unassigned provinces join it. On TGC this assigns exactly the 2985 land provinces. No diagnostic
  reads this today: the rule that did (`state-mixes-provinces`) was dropped because mods split
  states deliberately.

## Tech folders and their modifier keys

Two fields come from `common/technology.txt`'s `folders` section:

- `techFolders` — the folder names in declaration order. `army_tech` and `navy_tech` are required;
  `validateTechFoldersFile` reports `missing-tech-folder` when either is absent.
- `researchBonusKeys` — `<folder>_research_bonus` for each of them. The engine grants one modifier
  key per folder, so a mod that declares `population_tech` can write
  `population_tech_research_bonus` anywhere a modifier value is accepted. `isModifierKey` in
  `validationWalker.ts` checks this set on top of the static `MODIFIER_KEYS` table.

## Reform classes and options

`common/issues.txt` is indexed at three levels: `reformClass` (category → class name, e.g.
`slavery`), the positions defined under each class (`reformOptionsByClass`), and the **option pool**
each class draws from (`optionPoolByClass`). The pool mirrors NCE's two lookup maps: party, political,
and social issues share one pool (`map_of_ioptions`); economic and military reforms share the other
(`map_of_roptions`). `checkReformOption` ([validationWalker.ts](../src/services/validationWalker.ts))
enforces that a value assigned to a known reform-class key (in triggers, effects, country history,
and party bodies) exists in that class's pool — e.g. `slavery = yes_slavery` is valid,
`economic_policy = no_position_set` is valid as long as `no_position_set` is defined under any
issue (TGC's Wasteland parties rely on this), and `slavery = maybe_slavery` is
`unknown-reform-option`. The "did you mean" suggestion prefers the class's own positions.

## Duplicate diagnostics (`duplicateDiagnostics.ts`)

Duplicates are detected once at index time, then converted into per-file diagnostics on demand by
[src/services/duplicateDiagnostics.ts](../src/services/duplicateDiagnostics.ts):
`duplicateDiagnosticsByFile` when publishing index-time diagnostics for files that aren't open, and
the memoized `duplicateDiagnosticsFor` inside `validateFileText` for the file being validated — see
[architecture.md](architecture.md).

- Same-category, same-name duplicates within **the same file** are always `duplicate-identifier`
  (error).
- Duplicates across **different files** are `duplicate-identifier` (error) — **except** for the
  `modifier` category: a modifier name reused across `event_modifiers.txt`, `triggered_modifiers.txt`,
  and `static_modifiers.txt` files is legal in the engine (each modifier "kind" is looked up
  independently), so a cross-file-only modifier duplicate is downgraded to `duplicate-modifier-name`
  (warning), with the note that localisation may be confused by the shared name.

Event ids and decision names are tracked separately (`eventOccurrences` / `decisionOccurrences`,
keyed by id/name, each entry recording every file it appears in) because their duplicate check has
different semantics — see [events-and-decisions.md](events-and-decisions.md) (`duplicate-event-id`,
`duplicate-decision-name`).

## Flags (`countryFlagsSet` / `globalFlagsSet`)

Two engine-wide sets of every flag name ever assigned via `set_country_flag` / `set_global_flag`,
collected recursively across `events/*.txt`, `decisions/*.txt`, `common/cb_types.txt`,
`common/rebel_types.txt`, `common/issues.txt`, and every file under `history/countries/`. A
document being validated also gets its **own local flag set** re-collected on every validation
pass (so a flag set earlier in the very same file is recognized even before the index catches up).

`checkFlagIsSet` (used wherever `has_country_flag` / `has_global_flag` is checked — see
[triggers.md](triggers.md)) reports `flag-never-set` (warning) when a checked flag is neither in
the index nor the local set — unless the flag is only ever set in the *other* namespace (country
vs. global), in which case the message calls that out specifically, since country flags and global
flags are separate namespaces in the engine. `project_alice` is hard-coded as an
engine-set global flag (`ENGINE_SET_GLOBAL_FLAGS`) and never flagged, since it's set by the engine
itself, not by any mod file. Both flag checks are skipped entirely when both the indexed and local
sets are empty (a mod with zero flags anywhere shouldn't get flagged for its first one).

## Localisation and pictures

`locKeyDefinitions` maps every lowercase localisation key to its first definition (`filePath`,
`line`, `length`, and the English `text` — used for hover, see
[hover-and-highlighting.md](hover-and-highlighting.md)). Every loc/picture check
(`checkLocKey`, `checkPicture` in `validationWalker.ts`) is a **warning**, and is skipped entirely
when the relevant folder wasn't found at all (`isEmptyCategory`) — so a mod that ships no
`localisation/` folder (or no `gfx/pictures/events/`) doesn't get flooded with missing-key/picture
warnings on every single event.
