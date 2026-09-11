# File classification

`classifyFile(pathOrUri)` ([src/model/fileType.ts](../src/model/fileType.ts)) maps a file path (or
`file://` URI) to a `FileType`, which in turn decides which validator runs (see
[architecture.md](architecture.md)). Matching is case-insensitive, works on both `\`- and
`/`-separated paths, and on `file://` URIs whose folder segments are not percent-encoded.

The path passed in is the document's path **relative to the mod root** whenever a mod root was
found (see [architecture.md](architecture.md#mod-root-discovery-and-file-classification)); this
matters because an absolute path may contain an unrelated `common/`-named segment (Steam installs
mods under `steamapps/common/<game>/mod/<name>/`), which would otherwise be classified before the
mod's own `common/` folder is ever considered.

## Order of checks

0. Extension gate: anything that is not `.txt` or `.map` is `unknown`, except a `.csv` which only
   the `map/` table below may classify (`definition.csv`, `adjacencies.csv`). A `.vbs` helper in
   `history/pops/`, a `.lua` in `common/`, or a `.bmp` in `map/` never reaches a file validator
   (the map bitmaps are read by the side bar's Map Report, [map-images.md](map-images.md)).
1. `events/` anywhere in the path → `event`
2. `decisions/` anywhere in the path → `decision`
3. `poptypes/<name>.txt` → `popType`
4. `technologies/<name>.txt` → `technology`
5. `inventions/<name>.txt` → `invention`
6. `news/<name>.txt` → `newsScript`
7. `history/<subfolder>/...` → looked up in the history table below (fallback `historyOther`)
8. `map/<file>.txt|.csv|.map` → looked up in the map table below (fallback: `.txt` → `mapOther`,
   any other extension → `unknown`)
9. any other `map/....txt` → `mapOther`
10. `common/countries/<name>.txt` → `countryDefinition`
11. `common/<file>.txt` → looked up in the common-file table below (fallback `commonOther`)
12. any other `common/....txt` → `commonOther`
13. anything else → `unknown` (no semantic validation; syntax parsing still applies)

Two map file types are CSV (`mapDefinition`, `mapAdjacencies`, listed in `CSV_FILE_TYPES`): the
server skips the script parser for them and hands the raw text to the CSV validator (see
[map-folder.md](map-folder.md)).

## `common/` file table

| Filename | FileType |
|---|---|
| `crime.txt` | `crime` |
| `triggered_modifiers.txt` | `triggeredModifier` |
| `cb_types.txt` | `cbType` |
| `national_focus.txt` | `nationalFocus` |
| `rebel_types.txt` | `rebelType` |
| `on_actions.txt` | `onActions` |
| `issues.txt` | `issues` |
| `graphicalculturetype.txt` | `graphicalCulture` (a bare list of names — the one `common/` file with no `=`) |
| `country_colors.txt` | `countryColors` |
| `countries.txt` | `countryList` |
| `cultures.txt` | `cultures` |
| `religion.txt` | `religions` |
| `goods.txt` | `goods` |
| `ideologies.txt` | `ideologies` |
| `governments.txt` | `governments` |
| `buildings.txt` | `buildings` |
| `nationalvalues.txt` | `nationalValues` |
| `event_modifiers.txt` | `eventModifiers` |
| `static_modifiers.txt` | `staticModifiers` |
| `traits.txt` | `traits` |
| `production_types.txt` | `productionTypes` |
| `bookmarks.txt` | `bookmarks` |
| `pop_types.txt` | `popChances` |
| `technology.txt` | `techFolders` |
| any other `common/*.txt` (including `countries.txt`) | `commonOther` |

## `history/` subfolder table

| Subfolder | FileType |
|---|---|
| `countries` | `historyCountry` |
| `provinces` | `historyProvince` |
| `pops` | `historyPops` |
| `diplomacy` | `historyDiplomacy` |
| `units` | `historyUnits` |
| `wars` | `historyWars` |
| any other `history/<x>/` | `historyOther` (no semantic validator; syntax only) |

## `map/` file table

| Filename | FileType |
|---|---|
| `default.map` | `mapDefault` |
| `definition.csv` | `mapDefinition` (CSV) |
| `adjacencies.csv` | `mapAdjacencies` (CSV) |
| `region.txt`, `region_sea.txt`, `super_region.txt` | `mapRegion` |
| `continent.txt` | `mapContinent` |
| `climate.txt` | `mapClimate` |
| `terrain.txt` | `mapTerrain` |
| `positions.txt` | `mapPositions` |
| any other `map/**/*.txt` (`province_flag_sprites/*.txt`, `trees.txt`) | `mapOther` (syntax only) |
| any other extension (`.bmp`, other `.csv`) | `unknown` (`.bmp`: the Map Report action) |

## `commonOther`

Files that reach `commonOther` (`common/countries.txt`, and any unrecognized `common/*.txt`) still
get: `color = { ... }` block validation recursively at every nesting level, top-level stray-entry
checks are **not** applied here (see below), and index-time duplicate/stray checks where
applicable. `common/countries.txt` itself (the TAG → file-path list) is checked for stray entries
and duplicate TAGs by the mod index, but its individual `TAG = "path"` assignments are not
type-checked beyond that.

## Top-level stray-entry check

After the per-file-type validator runs, `checkTopLevelStrays` reports any document-root entry that
is not a `key = value` assignment (a bare value or a bare block at the top of the file) — this is
what catches things like a random word dropped at the top of `common/ideologies.txt`. It is skipped
for file types whose own validator (or the structural checks) already fully own top-level shape:
`event`, `decision`, `graphicalCulture` (a bare list is the whole point), `popType`, all six
`history*` types, `mapOther`, and `unknown`.
