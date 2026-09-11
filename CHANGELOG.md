# Change Log

All notable changes to the "victorian-tools" extension will be documented in
this file. This project adheres to [Keep a Changelog](https://keepachangelog.com/).

## [4.1.0]

### Added

- **Map Editor** side bar row (`victorian-tools.openMapEditor`): the mod
  dialog, then a tab with `map/provinces.bmp` drawn on a canvas (pan, zoom,
  hover for id and name, go-to-id). Clicking a province edits, each with its
  own Save: the `PROV<id>` localisation (ENGLISH column, other columns kept;
  optional rename of the history file to match), the province history file as
  a full form (fields, cores, buildings, `party_loyalty`,
  `state_building`, dated blocks) and the province's pops block of a start
  date (type, culture, religion, size, militancy, rebel type). Files are read
  through the picked mods' stack and written only into the top mod of the
  stack, copying a file from a lower layer when needed; edits are patches, so
  comments and file order survive, and an unchanged save writes nothing.
  The map is drawn in the file's row order, as the game reads it (flipped
  vertically compared with an image editor); loading progress and page errors
  show in the map area and in the language server output channel.
  Requests `victorianTools/mapEditor/{map,province,save}`; services
  `textPatch.ts`, `provinceTable.ts`, `provinceLocEdit.ts`,
  `provinceHistoryEdit.ts`, `provincePopsEdit.ts`. Details in
  `docs/map-editor.md`.

- `victorianTools.localisation.keyPattern`: a regular expression deciding which
  `title` / `desc` / `name` values are localisation keys. A value that does not
  match is literal display text and is never reported as missing, so
  `desc = "Death of Dom Pedro II"` stays silent while `desc = "EVTDESC48300"` is
  still checked. Default `^EVT`; empty checks every value.

### Changed

- `<folder>_research_bonus` modifier keys now come from the mod's own tech
  folders in `common/technology.txt`, not from a fixed list. Declare
  `population_tech` and `population_tech_research_bonus` becomes a valid
  modifier everywhere modifiers are accepted.

### Fixed

- `set_province_flag` is now an error (`broken-effect`): the engine accepts it
  but does not run it. Reported in effect blocks and in province history.
  `BROKEN_EFFECTS` in `data/effects.ts` is the table to extend if other effects
  turn out to be broken.
- Event and decision pictures may live in subfolders: `picture = "Brasil/Dom Pedro"`
  now resolves `gfx/pictures/events/Brasil/Dom Pedro.tga` in both the validator
  and the hover preview. The index lists the picture folders recursively and
  keys each file by its path under the folder.
- `enable_crime` is accepted in a technology body. The engine enables a crime
  from a technology as it does from an invention effect; NCE's parser only
  declares it on `inv_effect`, so the field table was missing it.
- `common/technology.txt` missing `army_tech` or `navy_tech` is now an error
  (`missing-tech-folder`). The engine hardcodes both and will not load without
  them, so the full report flags it.
- The integration suite looked for the extension under its pre-4.0 publisher
  id and never ran; it uses `TGCModdingTeam.victorian-tools` now.

## [4.0.1]

### Changed

- Marketplace README rewritten as a feature overview; the developer guide moved
  to `project_README.md`.
- Placeholder Marketplace icon (`images/icon.png`).

## [4.0.0]

Complete rewrite. The extension moved from a syntax-highlighting and snippet
pack (1.x-3.x) to a Language Server Protocol extension that parses Paradox
script and validates mod files inline. The `[0.x]` entries below are the
development history of this rewrite; 4.0.0 is its first release under the
`victorian-tools` marketplace id.

### Changed

- **Breaking**: every command, setting and view from 3.x is gone. Syntax
  highlighting and snippets are kept, now alongside a language server, the
  Actions side bar, the mod index, the full report and the map report.
- Publisher stays `TGCModdingTeam`; the repository is
  `The-Grand-Combination/TGExtension`.

## [0.15.0]

### Added

- **Map Report** side bar row (`victorian-tools.generateMapReport`, request
  `victorianTools/mapReport`): the mod dialog, then a plain-text report over
  `map/provinces.bmp`, `terrain.bmp` and `rivers.bmp` of each picked mod that
  ships map files of its own, read through the mod stack with a new BMP reader
  (`services/bmpDecoder.ts`: 8/24/32-bit, every common header, bottom-up or
  top-down). The engine repairs or ignores all of these silently, so this is
  the only place they show: colors with no `definition.csv` row (lake rows with
  an empty id excepted) and provinces with no pixel; terrain indices ≥ 64 or
  unmapped in `terrain.txt`, land painted ocean, sea painted land, terrain
  without a province; detached merge pixels, lone river pixels, 2×2 thick
  rivers, rivers without a source, rivers that never touch the sea, rivers on
  sea provinces and sea/land disagreements between `rivers.bmp` and
  `provinces.bmp`; missing files, unsupported formats, size mismatches, sides
  a height that is not a multiple of 144 (the game refuses the map otherwise) and
  non-standard palettes. Positions are x, y from the top-left corner as image
  editors show them; counts are aggregated per color, province or index. River
  neighbours are the 8 surrounding pixels and every index below 254 is river:
  mappers place sources and merges diagonally on purpose (698 of TGC's 1208
  sources) and TGC paints a wide river with index 16 that the game draws, so
  there is no corner rule and no index rule. Kept apart from the full report so
  that pixel findings do not crowd out the file findings. Codes and rules in
  `docs/map-images.md`. The audit over TGC's 20-megapixel bitmaps takes about
  0.3 s.
- **Enforce Colormaps** side bar row (`victorian-tools.enforceColormaps`): the
  mod dialog, then the palettes of each picked mod's own `map/terrain.bmp` and
  `map/rivers.bmp` are compared with the standard ones (identical in the game
  files, TGC and GFM; `data/mapPalettes.ts`), and after a confirmation the
  palette bytes are rewritten in place, pixels and headers untouched
  (`victorianTools/enforceColormaps`, `services/colormapEnforcement.ts`).

### Fixed

- Calibration: TGC's text files still report 635 findings; its bitmaps report
  1 unknown color, 1 province without pixels, 1 lone river pixel, 18 thick
  blocks and 26 rivers that never touch the sea. Both TGC palettes are already
  standard.

## [0.14.0]

### Added

- **Mods and submods are read the way the game stacks them.** The server finds
  the Victoria 2 install above the workspace (or at `victorianTools.gamePath`),
  reads every `mod/*.mod` descriptor (`name`, `path`, `replace_path`,
  `dependencies`), and reads each mod on top of the game files and of the mods
  it depends on: a relative path resolves to the highest layer that has it, a
  folder listing merges every layer by file name, and a `replace_path` hides
  that game-root-relative folder from every layer below (so
  `replace_path = "mod/GFM/history/provinces"` hides a parent mod's folder too,
  exactly as the engine does). A submod without `common/` is no longer mistaken
  for a file of the game itself. A git checkout laid out like the `mod/` folder
  (`GFM.mod` beside `GFM/`) is read the same way, over the install found above
  the workspace or at `victorianTools.gamePath`, and shadows the installed copy
  of the same name; a lone mod folder outside the install is read over the game
  files too.
- **Settings tab.** The last row of the Victorian Tools side bar, **Settings**
  (`victorian-tools.openSettings`), opens a *Victorian Tools Settings* editor
  tab: the game folder (detected, or typed / browsed when detection fails;
  stored in the user settings as `victorianTools.gamePath`) and the mods and
  submods being worked on, every installed mod with a checkbox, base mods each
  followed by their submods, then the mods whose dependency is not installed.
  Any combination can be ticked, several base mods included, as the launcher
  allows; the page shows the load order (dependencies first) and warns about
  missing dependencies. The names are stored in `victorianTools.activeMods`
  (workspace settings); the server re-reads the layout when either setting
  changes and notifies the tab (`victorianTools/layoutChanged`). Files of the
  selected mods are validated against the whole stack in load order; the full
  report then covers each mod of the stack, one section per mod. Without a
  selection every mod is read with its dependencies, and a mod outside any
  install is read on its own as before.
- **Launch Game** side bar row (`victorian-tools.launchGame`): a mod dialog,
  then `v2game.exe` (or `victoria2.exe`) starts from the game root with
  `-mod=mod/X.mod` per picked mod in load order, detached from the editor.
- **Generate Full Report** opens the same dialog and reports on the ticked
  mods, each validated over the game files and its dependencies; with nothing
  ticked it falls back to the mods set in Settings, then to the workspace
  folders (`FullReportParams.mods`).
- Both dialogs open pre-filled with the mods set in Settings or, when none are
  set, with the last pick made in either of them (workspace state), so the
  choice is made once.
- `victorianTools.gamePath` to point at the install when the workspace is not
  inside it.
- Custom request `victorianTools/mods` (the installed descriptors), the `.mod`
  descriptor parser (`parser/modDescriptor.ts`), `services/modLayout.ts`
  (load order, submods, game-root detection, file location) and
  `services/modLayers.ts` (layered file resolution), with unit tests for each.
  `ModCache` now keys indexes by the layers they were built from.

### Changed

- The full report lists every finding again, one line each; the collapsing of
  repeated findings introduced in 0.13.0 is gone.

### Fixed

- TGC calibration is unchanged (635 findings): TGC replaces every folder the
  index reads. Its submods now validate against TGC's identifiers instead of
  against nothing (the Apocalypse 1836 submod alone surfaces 13 errors).

## [0.13.0]

### Changed

- **Nothing blocks the language server any more.** The mod index is built in the
  background in short steps (`buildModIndexAsync`), and a refresh after a file
  change keeps serving the previous index until the new one is ready, so open
  documents never lose their semantic diagnostics in between; a change that
  lands while a build is running makes the build run once more. The full report
  reads files in parallel batches and yields between batches. On TGC: index
  0.23 s with stalls under ~100 ms (was one 0.23 s block on every save), report
  0.65 s with stalls under ~60 ms (was one 0.85 s block).
- **Spelling suggestions are 3x cheaper.** The Levenshtein distance behind
  "Did you mean" now runs in a band around the diagonal over two reused rows,
  and candidates whose length rules them out are skipped before the call. The
  results are identical (locked by a randomized test against the textbook
  algorithm). TGC's largest event file validates in 11 ms instead of 30.
- **One validator per grammar.** `semanticValidation.ts` is a 150-line
  dispatcher; the eight grammars it carried inline and the seventeen in
  `commonDataValidation.ts` each live in their own `*Validation.ts` service.
  `documentStructure.ts` is split into one field-table module per domain
  (`eventStructure.ts`, `cbTypeStructure.ts`, `rebelTypeStructure.ts`,
  `popTypeStructure.ts`, `technologyStructure.ts`, `historyStructure.ts`,
  `commonStructure.ts`, `mapStructure.ts`), and the `ModIndex` types moved to
  `src/model/modIndex.ts`.
- **Shared helpers replace copies**: `eachAssignment` (the "assignment or
  stray entry" loop that was written out ~60 times), `reportUnknownKey` (the
  "Unknown X 'key'. Did you mean ...?" report), `checkModifierValueField`, a
  named `FieldTable` type, and one CSV parser (`src/parser/csv.ts`) for the map
  CSVs, `definition.csv` indexing, and localisation.
- `validateFileText` now appends the index-time duplicates for the file, so the
  editor and the full report no longer merge them separately.
- `duplicate-decision-name` is reported by the decision validator only, for
  same-file and cross-file duplicates alike ("also defined in this file,
  other.txt"); `structureValidation.ts` no longer reports it.
- Picture hover resolution (which folder, `.dds` before `.tga`) moved from the
  server into `pictureHover.ts`; the server only reads bytes and caches.
- The client's file-system watchers are pushed to `context.subscriptions`.

- The full report collapses findings that pile up in one file, from three
  occurrences on: errors with the same code and message (the same `QQQ`
  transfer in every option), and warnings with the same code whatever the
  message (every missing localisation key of a file). Only the first is
  listed, at its position, followed by the count and a note to open the file
  for the rest. The per-mod totals still count every occurrence.

### Fixed

- `military_reform = <option>` (and `political_reform`, `social_reform`,
  `economic_reform`) in a country history file was reported as
  `unknown-country-history-key`. The game accepts the effect-form keys there,
  starting the country with that reform; the value is now checked as a reform
  option.
- `clr_country_flag` / `clr_global_flag` in a country history file were
  `unknown-country-history-key`; the game clears flags from history too, so
  both are accepted like their `set_` counterparts.
- `owner = ---` / `controller = ---` (or `null`) in a province history file
  was an `unknown-country` error; it means the province starts uncolonized and
  is accepted without a diagnostic.
- `secede_province = QQQ` (a tag the mod never defines), `= null`, or `= ---`
  was an `unknown-country` error. The engine hands the province to no one,
  which uncolonizes it (NCE `annex_to_null_province`); modders use this on
  purpose and it can crash the game, so it is now the `uncolonize-province`
  warning with that explanation.

### Added

- Unit tests per service (`validationWalker`, `eventValidation`,
  `decisionValidation`, `commonFileValidation`, `historyValidation`,
  `popTypeValidation`, `technologyValidation`, `newsValidation`), plus new
  suites for `suggestions`, the CSV parser, `fileValidation`, and the
  background `ModCache` (shared builds, refresh, stale-build rerun, forget,
  failure). 247 unit tests.

## [0.12.0]

### Added

- **Snippets**, carried over from the previous Victorian Tools extension: 49
  for Paradox script (`snippets/victoria2.code-snippets`, language `victoria2`)
  and 20 for localisation CSVs (`snippets/victoria2-csv.code-snippets`,
  language `victoria2-csv`). The old extension pointed them at its `paradox`
  and `csv` language ids, which do not exist here, so both contributions were
  re-pointed. Full prefix list in [docs/snippets.md](docs/snippets.md).
- An integration test that both snippet files ship, parse, and declare a
  prefix and body for every entry.

### Fixed

Errors carried over with the snippets, all in
`snippets/victoria2.code-snippets`:

- **`ai_will_do` could not be reached by typing it**: the snippet's prefix was
  `ai_chance`, the same as the event snippet next to it. It is now
  `ai_will_do`.
- **Two snippets were the same snippet.** "Casus Belli - Effect" had the prefix
  and body of "Add Casus Belli - Effect", while its description described the
  opposite direction. It now inserts the `casus_belli` effect under the prefix
  `casus_belli_effect`, so the pair matches the two effects NCE defines:
  `add_casus_belli` gives the target a CB against the scoped country,
  `casus_belli` gives the scoped country a CB against the target.
- **`option_event` inserted broken script**: `modifier = {}` was closed
  immediately and the `factor` that belonged inside it dangled after it. It
  also used `$0` twice, which is undefined for a snippet.
- **`ai_chance`, `ai_will_do` and `option_event` had their tab stops out of
  order**, using `$0` (the final cursor position) before `$1`.
- **`casus_belli_defining` inserted text the validator rejects**:
  `sprite_index = Number` and `war_name = INSERT_NAME_HERE` were plain words,
  so they were neither selected nor tab-navigable. They are placeholders now,
  along with the CB name itself.
- **Both casus belli snippets inserted `state_province_id`**, which is not a
  field of either effect (NCE's `ef_casus_belli` and `ef_add_casus_belli` take
  `type`, `target` and `months`; in TGC the field only ever appears inside
  `war_goal`/`attacker_goal`/`defender_goal`). Removed, along with the
  sentence about it in both descriptions.
- Added the three missing descriptions (`limit`, `trigger`, `option_event`).
- **Three snippets inserted unbalanced braces**: `influence` never closed its
  block at all, and both country event templates left the second option's
  `modifier` block open, so the event ended one brace short.
- **Four placeholders were not placeholders**: `${alliance-puppet_type}` and
  `${1-2}` are not syntax VS Code can parse (a hyphen cannot appear in a
  placeholder name), and the two choice lists in the localisation file were
  missing their closing `|`. All four were inserted as literal text. The
  relationship snippet now offers the four relation kinds as a real choice.
- **The country template used a comma-separated color** (`color = { r, g, b }`),
  which the engine does not accept; its party name hint had spaces, so it was
  literal text too; and its start and end dates shared placeholder names, so
  filling one rewrote the other.
- Tab stops that started at `$2` or jumped over numbers now run from `$1`.

### Changed

- The two snippet files each carried one trailing comma, which VS Code
  tolerates but strict JSON does not. Removed, so any tool can read them.
- One description in each file held a windows-1252 em dash (byte `0x97`), which
  is not valid UTF-8 and rendered as a replacement character. Both are proper
  UTF-8 em dashes now.
- Unit tests now hold the snippet files to their invariants (unique prefixes,
  a description everywhere, one `$0` at most) and expand the structural
  snippets through the validator to prove they insert accepted script.

## [0.11.0]

### Added

- Three settings for the language server's scheduling:
  `victorianTools.validation.delay` (idle milliseconds before a changed file is
  revalidated, default 300, `0` validates inline),
  `victorianTools.index.rebuildDelay` (idle milliseconds before rebuilding the
  index of mods whose files changed on disk, default 500), and
  `victorianTools.index.onStartup` (index every workspace mod at startup so
  mod-wide errors appear without opening a file, default on).
- The server declares multi-root workspace support and tracks workspace folder
  changes, dropping the index of a mod whose folder is removed.

### Changed

- **Validation is debounced per document** instead of running on every
  keystroke. A full pass over TGC's largest event file (410 KB) takes about
  30 ms, which used to be paid per character.
- **Index rebuilds are scoped to the mods that changed.** A watched-file change
  used to discard and rebuild the index of *every* known mod (about half a
  second each on a mod the size of TGC); now only the roots the changed paths
  belong to are rebuilt, and a change outside every indexed mod rebuilds
  nothing.
- Mod root lookup is cached per **directory** rather than per document, so
  files in the same folder share one filesystem walk, and misses are cached too.
- Server state moved into focused modules: `server/modCache.ts` (roots and
  indexes), `server/serverConfig.ts` (typed, clamped settings accessors),
  `server/boundedCache.ts` (LRU). Settings are no longer read with an ad-hoc
  narrowing helper inside `server.ts`.
- A configuration change that does not touch these settings no longer forces a
  revalidation of every open document.
- `map/default.map` is now watched, so editing `max_provinces` or `sea_starts`
  rebuilds the index.

### Fixed

- **Picture hovers went stale.** The decoded `.dds`/`.tga` cache was never
  invalidated, so replacing an image kept showing the old one until the server
  restarted; it also wiped all 200 entries at once when full. It is now an LRU
  that drops exactly the files the watcher reports as changed.
- **Indexing one mod cleared another mod's diagnostics.** The set of URIs that
  index-time duplicates had been published to was global; it is now tracked per
  mod root.
- Index-time duplicates no longer flicker over an open document's own
  diagnostics during a rebuild, and a file's duplicates now survive closing it
  (they were found across the whole mod, not by having the file open).
- Pending validation and rebuild timers are cleared on shutdown.
- A picture hover in a mod installed under `steamapps/common/` could look in
  `gfx/pictures/events/` for a decision picture; the folder is now chosen from
  the mod-relative path.

## [0.10.0]

### Added

- **Victorian Tools side bar**: an activity bar container with the "V" icon
  from the previous extension and an `Actions` view. Its first action,
  **Generate Full Report**, validates every classified file of the mod from
  disk (the same pipeline the editor uses, including index-time duplicates)
  and opens a plain-text report listing every error and warning, grouped by
  mod root and file (`line:column  severity  code: message`). Also available
  as the `Victorian Tools: Generate Full Report` command.
- Custom LSP request `victorianTools/fullReport`; `validateFileText` now
  holds the per-file pipeline shared by the editor and the report.

### Fixed

- File classification now ignores anything that is not `.txt`, `.map`, or one
  of the two `map/` CSVs, so helper scripts and notes inside mod folders
  (e.g. `history/pops/pops-updator.vbs`) no longer appear in the full report.
- `<reform class> = <option>` no longer requires the option to be defined
  under that same class. NCE resolves the value against a global pool (issue
  options for party/political/social classes, reform options for
  economic/military ones), so `economic_policy = no_position_set` is valid
  whenever `no_position_set` exists under any issue. This removes the eight
  false `unknown-reform-option` errors on TGC's Wasteland party definitions.

## [0.9.0]

### Added

- **Validation of the `map/` definition files**, following the NCE parser
  (`default_map_file`, `region_file`, `continent_file`, `climate_file`,
  `terrain_file`, `positions_file`, `read_map_colors`, `read_map_adjacency`):
  `default.map` (fields, `max_provinces`, `sea_starts`), `definition.csv`
  (row shape, id range, color components, duplicate colors),
  `adjacencies.csv` (row shape, province ids, adjacency types, strait sea
  zones, canal ids), `region.txt` / `region_sea.txt` / `super_region.txt`
  (province lists, duplicates, sea zones inside states, NCE's mixed-state
  split), `continent.txt` and `climate.txt` (province lists, modifier values,
  double assignment), `terrain.txt` (category bodies, palette entries against
  the file's own categories, duplicate palette indices), and `positions.txt`
  (province keys, text position fields).
- Every province id in `map/` is checked against `max_provinces` and
  `definition.csv` (`province-id-too-large`, `unknown-province`).
- The mod index now reads `max_provinces` and `sea_starts` from `default.map`
  and replays the engine's state assignment over the region files.
- `map/*.csv` and `map/default.map` are routed to the language server; CSV
  files bypass the script parser.

### Changed

- `stateRegion` identifiers now include `super_region.txt` and
  `region_sea.txt` names: NCE resolves `region = X` and `X = { ... }` scope
  keys against states and meta-regions alike. Duplicate region names are only
  reported within one file, since mirroring a meta-region into `region.txt` for
  the vanilla engine is legal.

### Found in TGC

- Four provinces listed twice in one region block (`THE_AMAZON_FOREST` in
  `region.txt`: 2279, 2282, 2283; `any_land_province` in `super_region.txt`:
  3508). Everything else under `map/` validates clean.

## [0.8.0]

### Added

- **Full validation of every `common/` data file**, with grammars taken from
  the NCE parser (`parser_defs.txt`): `cultures.txt` (groups, cultures,
  colors, name lists, `union`/`primary` TAGs), `religion.txt`, `goods.txt`,
  `ideologies.txt` (reform desires as country-scope value modifiers),
  `governments.txt` (fixed fields + ideology toggles), `buildings.txt`
  (typed fields, modifier keys, `goods_cost`, `colonial_points`),
  `nationalvalues.txt` / `event_modifiers.txt` / `static_modifiers.txt`
  (modifier bodies; the engine's fixed static-modifier names), `traits.txt`
  (leader stats), `production_types.txt` (employee lists, goods maps,
  state-scope bonus triggers), `bookmarks.txt`, `pop_types.txt` (the seven
  pop-scope promotion/migration weights), `technology.txt` (folders and
  schools), and `common/countries/*.txt` (color, `graphical_culture` against
  `graphicalculturetype.txt`, parties with issue positions and dates,
  `unit_names` against unit types).
- `crime.txt` and `triggered_modifiers.txt` bodies now validate their modifier
  keys too; national focus and issue option bodies validate their listed
  fields, modifier keys, `rules` toggles, and `vote_modifiers`.
- `graphicalCulture` identifier category (indexed from
  `common/graphicalculturetype.txt`).

## [0.7.0]

### Added

- **Stray-entry errors**: a bare value or block where only `key = value` is
  allowed (event/decision/CB/rebel/focus/issue bodies, trigger/effect/weight
  blocks, history files, technologies, pop types) is now an error
  (`stray-value` / `stray-block`). The file root is checked too, for every
  validated type (a bare `asd` or a TAG with no `=` in `common/countries.txt`
  is an error). Legitimate bare-word lists (`peace_order`, `color`, news
  comparison lists, `graphicalculturetype.txt`) are unaffected. Found 3 real
  TGC bugs.
- **Color validation** (`invalid-color`): `color = { ... }` must hold exactly
  three plain numbers — suffixed values (`170n`), commas (`136, 170, 0`), and
  wrong component counts are errors. Checked in pop types and, recursively, in
  untyped `common/` files (cultures, religions, ideologies, country
  definitions).
- **`common/country_colors.txt` validation**: entries must be known country
  TAGs, fields must be `color1`/`color2`/`color3`, and each is a full color
  check.

### Fixed

- Index-time duplicate diagnostics (`duplicate-identifier`,
  `duplicate-modifier-name`) disappeared when the affected file was opened:
  the open-document publish replaced them. They are now merged into every
  validation of that file.

## [0.6.1]

### Fixed

- **Semantic validation was silently skipped for mods installed under Steam**
  (`steamapps/common/<game>/mod/<mod>`): the unrelated `common/` path segment
  made every non-event file classify as `commonOther`. The server now
  classifies by the mod-root-relative path, and `classifyFile` checks the
  specific folders before the `common/` fallback. Covered by a regression
  integration test and `classifyFile` unit tests.

## [0.6.0]

### Added

- **Highlighting for every mod file**: the `victoria2` language now also covers
  `units/`, `map/`, `interface/`, `localisation/`, `battleplans/`, `tutorial/`,
  and `script/` `.txt` files, plus the `.gui`, `.gfx`, `.sfx`, and `.mod`
  extensions. Syntax diagnostics run on the new folders and extensions too
  (semantic validation stays limited to the typed file families).
- **`victoria2-csv` language** with its own grammar for `localisation/**/*.csv`
  and `map/**/*.csv`: key column, `;` separators, numbers, the `x` end marker,
  `$variables$`, `§`-color codes, and `\n` escapes; `#` line comments.

## [0.5.0]

### Added

- **Validation and highlighting for `poptypes/`, `technologies/`, `inventions/`,
  `news/`, and `history/`** (countries, provinces, pops, diplomacy, units/OOBs,
  wars), with rules taken from the NCE engine parser grammars:
  - Pop types: typed scalar fields, needs maps (goods), `rebel` composition
    (units), `promote_to`/`ideologies`/`issues` weight maps, and migration
    weight blocks in their engine scopes (country/province).
  - Technologies/inventions: modifier keys (dataset generated from NCE's
    `modifier_base`, 187 keys), unit stat blocks (incl. `army_base`/`navy_base`),
    goods maps, `max_<building>` caps, `ai_chance`, invention `limit`/`chance`/
    `effect` bodies.
  - News scripts: `trigger` cases validate with the news comparison triggers
    (`tags_eq`, `date_greater`, `news_printing_count`, ...), now in the dataset.
  - History: country files (typed fields, reform/issue positions, tech/invention
    keys, `upper_house`/`foreign_investment` maps, dated blocks), province files
    (cores, RGO, buildings, dated blocks), pops (province id → pop type →
    culture/religion/size/`rebel_type`), diplomacy relations, orders of battle
    (leaders, armies, regiments, relation values), and wars (date blocks,
    `war_goal`).
- `rebelType` identifier category (indexed from `common/rebel_types.txt`) and
  game-date argument checking (`yyyy.m.d`).
- Value-modifier `group = { modifier ... }` bundles are recognized.

### Changed

- The semantic walker core moved to `services/validationWalker.ts`; per-family
  validators live in their own services (`popTypeValidation`,
  `technologyValidation`, `newsValidation`, `historyValidation`).

## [0.4.0]

### Added

- **Validation and highlighting for `common/` files**: `crime.txt`,
  `triggered_modifiers.txt`, `cb_types.txt` (body fields, `peace_order`,
  trigger/effect blocks), `national_focus.txt`, `rebel_types.txt` (weight,
  trigger, effect blocks, `government` map), `on_actions.txt` (fixed engine
  hooks, event references), and `issues.txt` (`allow`, `on_execute`). The
  language and the document selector now cover `**/common/**/*.txt`.
- New triggers, effects, and scope keywords previously missing from the
  datasets (e.g. `is_releasable_vassal`, `can_build_railway_in_capital`,
  `pop_unemployment`, `trigger_revolt`, `add_war_goal`, `modify_relation`,
  `hidden_tooltip`, `independence`, crisis scopes), including `this_union` as
  a country value.

### Changed

- **Rule source: the NCE engine parser.** Trigger/effect scope sets, argument
  shapes, and scope-changer origins/products/contexts are now extracted from
  NCE's `trigger_parsing.cpp` / `effect_parsing.cpp` (engine reimplementation),
  excluding its modding extensions. The blanket scope fallbacks
  (state⊇province, province→country) were removed: each symbol carries the
  engine's exact scope set. Region keys iterate provinces (not a state scope);
  `any_core`/`all_core` produce a scope that depends on the origin.
- Triggers the engine parser does not know were removed from the dataset
  (`ideology`, reform-family keys as triggers, strata consciousness,
  `total_defensives`-family, `release`); rebel `movement_evaluation` is
  evaluated in province scope, national focus `limit` per province of the
  state; `war_name` no longer warns about vanilla localisation keys.
- Flags set in `common/rebel_types.txt` and `common/issues.txt` effects now
  count for the never-set-flag warnings.

## [0.3.0]

### Added

- **Localisation validation** (warnings): `title`, `desc`, option `name`, and
  `news_*` keys must exist in `localisation/*.csv`; decision loc keys derived
  from the decision name (`<name>_title` / `<name>_desc`) are checked too.
- **Picture validation** (warnings): event pictures must exist in
  `gfx/pictures/events/`, decision pictures in `gfx/pictures/decisions/`
  (`.tga`/`.dds`), with "did you mean" suggestions.
- **Go to definition for localisation keys**: Ctrl+Click a loc key in an event
  or decision jumps to its line in the localisation CSV.
- **Hover documentation for every trigger, effect, scope, and structural
  keyword**: a one-line usage note (curated from the reference docs, required
  by the type system for every dataset entry), an auto-generated syntax line
  derived from the argument specification, and the valid scopes. Names that
  are both trigger and effect show both sections.
- **Hover on localisation keys** shows the English text and the CSV source
  line.
- **Never-set flag warnings**: `has_country_flag` / `has_global_flag` checks
  for flags that no event, decision, CB, or history file ever sets are
  warnings, with suggestions — including a dedicated message when the flag is
  only set in the other namespace (country vs global). Engine-set flags
  (`project_alice`) are allowlisted.
- Pop effects realigned to the documented scopes (`reduce_pop`, `militancy`,
  `literacy`, `move_pop`, `ideology`, `assimilate` are pop-scope only);
  corpus-proven country/state widenings kept for `consciousness`, `scaled_*`,
  `dominant_issue`, and `move_issue_percentage`.
- **Hover on event/decision pictures** shows an inline preview. DDS
  (DXT1/DXT3/DXT5, uncompressed masked 16/24/32-bit, palettized P8) and TGA
  (uncompressed and RLE truecolor) are decoded to PNG in-process with no
  external dependencies; previews are cached. Validated against all 1,929 TGC
  pictures.
- **Duplicate detection** (errors): decision names duplicated across files;
  duplicate identifiers in mod data files (country tags, cultures, religions,
  goods, ideologies, governments, buildings, modifiers, national values, CBs,
  crimes, reform classes, provinces, states, technologies, inventions, units) —
  published even for files that are not open. Same-file duplicate decision
  names upgraded from warning to error. Exception: a modifier name shared
  across event/triggered/static modifier files is legal and reported as a
  warning ("localization may be confused"); same-file modifier duplicates stay
  errors.
- Both checks skip silently when the mod has no `localisation/` or
  `gfx/pictures/` content, avoiding noise in minimal setups.

### Notes

- Calibrated against the TGC corpus: the duplicate scan found one genuine bug
  (country tag `d01` defined twice) and one localisation-risk warning
  (`line_of_advantage` defined in both `event_modifiers.txt` and
  `triggered_modifiers.txt`); the loc / picture warnings surfaced only
  genuinely missing entries.

## [0.2.0]

### Fixed

- Unknown top-level keys in event/decision files (e.g. `countrya_event`) are
  now errors with a suggestion; only `country_event` / `province_event` /
  `political_decisions` blocks are valid at the top of a file. Non-block
  values and stray tokens at the top level are errors too.

### Added

- **Syntax highlighting** for Victoria 2 script via a TextMate grammar
  (`syntaxes/victoria2.tmLanguage.json`). Tokens map to standard TextMate
  scopes, so every VS Code theme colors them without a bundled custom theme:
  comments, strings, numbers/dates, `yes`/`no`, comparison operators,
  `AND`/`OR`/`NOT`/`limit`, structural fields (`id`, `trigger`, `option`, ...),
  scope changers (`any_owned`, `capital_scope`, ...), `THIS`/`FROM`, country
  TAGs, and generic `key =` identifiers.

## [0.1.0]

### Added

- **Semantic validation** for events and decisions, scope-aware:
  - Unknown trigger/effect names are errors, with "did you mean" suggestions.
  - Triggers/effects used in the wrong scope (country/province/state/pop) are
    errors, honoring engine fallbacks (state→province, province→owner).
  - Dynamic keys resolve against the mod: ideologies, issues, reform classes
    and their positions, technologies, inventions, goods, pop types, TAG /
    province-id / state scope switches.
- **Mod identifier index** built from the mod folder (found by walking up to
  `common/`): country TAGs, cultures and groups, religions, goods, ideologies,
  governments, buildings, event/triggered/static modifiers and tech schools,
  national values, CB types, crimes, reforms and issues, pop types, provinces
  (`map/definition.csv`), states/regions, continents, terrain, technologies,
  inventions, units, and leader traits. References that don't exist in the mod
  are errors with suggestions.
- **Event id validation**: firing an undefined `country_event`/`province_event`
  id is an error; duplicate event ids across files are errors.
- Index auto-rebuilds when `common/`, `map/`, `poptypes/`, `technologies/`,
  `inventions/`, `units/`, or `events/` files change.
- Number literals accept Paradox forms (`.25`, `+50000`).

### Notes

- Dataset calibrated against the full TGC corpus (168 event + 105 decision
  files) to zero false positives; the remaining 9 findings are genuine TGC
  bugs (nonexistent TAG `QQQ`, two undefined event ids, a
  `uling_party_ideology` typo, two nonexistent buildings, and a boolean where
  a number is expected).

## [0.0.1]

### Added

- Language Server Protocol extension: a thin VS Code client (`src/extension.ts`)
  that launches a Node language server (`src/server/server.ts`).
- Lexer and error-recovering parser for Paradox script (`src/parser/`) producing
  a typed AST (`src/model/ast.ts`) with source ranges.
- Inline **syntax validation**: unbalanced/stray braces, unterminated strings,
  unexpected tokens and missing values — reported as diagnostics with precise
  ranges.
- Inline **structural validation** for `events/` and `decisions/` files: events
  must have an `id` and should have `title`, `desc`, and at least one `option`;
  decisions should have `potential` and `effect`, with duplicate decision names
  flagged.
- `victoria2` language contribution (comments, brackets) scoped to `events/` and
  `decisions/` files — it does not claim all `.txt` files.
- Settings: `victorianTools.validation.enable`, `victorianTools.trace.server`.
- Command: `Victorian Tools: Restart Language Server`.
- Unit test suites (plain Mocha) for the lexer, parser, and validators, plus an
  integration suite that asserts the server publishes diagnostics.

### Notes

- Validated against the TGC mod (168 event files, 105 decision files): clean on
  valid content, and it surfaced 3 genuine syntax errors in the mod.
- Semantic validation (effect/trigger/scope names, cross-file references) is
  planned for later milestones.
