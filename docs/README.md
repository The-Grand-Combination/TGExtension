# Victorian Tools — Documentation

Reference documentation for the Victorian Tools language server: what it validates, what data it
validates against, and how the pieces fit together. This complements `CLAUDE.md` (the
architecture/build guide) — `CLAUDE.md` says how the code must be structured; these pages say what
the shipped behavior actually is.

All rules here are extracted from the NCE engine parser (`d:\GitHub\NCE`, a Project Alice fork with
a full Victoria 2 engine reimplementation), used as the ground truth for what the game engine
accepts — not from the wiki, and not from any single mod. Anything a mod does that NCE would reject
is treated as a genuine mod bug, not as a reason to widen a rule.

## Pages

- [architecture.md](architecture.md) — the LSP pipeline (client → server → services → parser),
  the AST, how a file goes from text to diagnostics, and the side bar's whole-mod **full report**
  and **map report**.
- [file-classification.md](file-classification.md) — how a file path is mapped to a `FileType`,
  and the full file-type table.
- [scopes.md](scopes.md) — the scope model (`country` / `province` / `state` / `pop`), the
  scope-changer graph, and dynamic scope keys (TAGs, province ids, regions, pop types).
- [triggers.md](triggers.md) — every recognized condition: valid scopes, argument shape, meaning.
- [effects.md](effects.md) — every recognized effect: valid scopes, argument shape, meaning.
- [events-and-decisions.md](events-and-decisions.md) — event and decision file structure and rules.
- [common-folder.md](common-folder.md) — validators for every typed file under `common/`.
- [poptypes-technologies-inventions.md](poptypes-technologies-inventions.md) — `poptypes/`,
  `technologies/`, `inventions/`.
- [news-and-history.md](news-and-history.md) — `news/` and every `history/` subfolder.
- [map-folder.md](map-folder.md) — `map/`: `default.map`, `definition.csv`, `adjacencies.csv`,
  region files, `continent.txt`, `climate.txt`, `terrain.txt`, `positions.txt`.
- [map-images.md](map-images.md) — the map bitmaps (`provinces.bmp`, `terrain.bmp`, `rivers.bmp`):
  what the engine does with them, the cross-checks and river rules of the **Map Report** action,
  and the **Enforce Colormaps** action.
- [map-editor.md](map-editor.md) — the **Map Editor** action: the province map tab, how a click
  resolves to a province, and how the localisation, history file and pops of a province are read
  through the mod stack and patched into the target mod.
- [mod-index.md](mod-index.md) — the identifier index built from the mod (what counts as a valid
  TAG, culture, event id, flag, localisation key, picture, ...), and cross-file checks (duplicates,
  event ids, flags-never-set).
- [mods-and-submods.md](mods-and-submods.md) — how the game stacks the game folder, a mod and its
  submods (`.mod` descriptors, `replace_path`, `dependencies`), how the extension reads files
  through that stack, and the side bar mod selection.
- [encoding.md](encoding.md) — the single-byte code page mod files are stored in
  (`victorianTools.encoding`), why UTF-8 is not an option, and the `files.encoding` override an
  editor tab needs to agree with it.
- [diagnostics-reference.md](diagnostics-reference.md) — every diagnostic code, its severity, and
  what triggers it.
- [hover-and-highlighting.md](hover-and-highlighting.md) — hover tooltips, go-to-definition, syntax
  highlighting, and the CSV language.
- [snippets.md](snippets.md) — every snippet prefix the extension contributes, for script files
  and for localisation CSVs.

## Scope of validation (what's covered, what isn't)

Covered: `events/`, `decisions/`, every typed file directly under `common/` (see
[common-folder.md](common-folder.md) for the full list), `common/countries/*.txt`, `poptypes/`,
`technologies/`, `inventions/`, `news/`, every `history/` subfolder (`countries`, `provinces`,
`pops`, `diplomacy`, `units`, `wars`), and the `map/` definition files (`default.map`,
`definition.csv`, `adjacencies.csv`, `region.txt`/`region_sea.txt`/`super_region.txt`,
`continent.txt`, `climate.txt`, `terrain.txt`, `positions.txt` — see [map-folder.md](map-folder.md)),
and, through the side bar's **Map Report**, the map bitmaps (see [map-images.md](map-images.md)).

Not covered (by design, for now): `.gui`/`.gfx`/`.sfx` interface files (highlighted only, not
validated), `units/*.txt` unit type definitions (referenced as an identifier category, but their own
internal fields are not validated), `map/province_flag_sprites/*.txt` and `map/trees.txt` (syntax
only), `localisation/*.csv` content beyond key lookup, `common/countries.txt` body
(TAG → file path list; only duplicates and stray entries are checked — see
[common-folder.md](common-folder.md)), `.mod` descriptors' own syntax (they are read for the mod
stack, see [mods-and-submods.md](mods-and-submods.md), not validated) and `settings.txt`, and Lua
files under `common/`.

## Calibration methodology

Every dataset or walker change is re-run against the full TGC mod corpus
(`f:\SteamLibrary\steamapps\common\Victoria 2\mod\TGC`) with the goal of **zero false positives**.
A new diagnostic on a file that previously validated clean is triaged as either a dataset gap (fix
it) or a genuine mod bug (keep the diagnostic, report the bug). This is why the datasets carry
comments like "corpus 96x country, 4x state" — they record the calibration evidence for scope
widenings that go beyond the wiki's documented scope, all cross-checked against what NCE's parser
actually accepts.
