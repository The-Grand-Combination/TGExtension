# `map/`

Validators for the map definition files, following the NCE parser
(`parser_defs.txt`: `default_map_file`, `region_file`, `continent_file`, `climate_file`,
`terrain_file`, `positions_file`; `provinces_parsing.cpp`: `read_map_colors`,
`read_map_adjacency`, `make_state_definition`). Script files go through the normal parser and
[mapValidation.ts](../src/services/mapValidation.ts); the two CSVs bypass the parser and are checked
line by line in [mapCsvValidation.ts](../src/services/mapCsvValidation.ts).

## Province ids

Every province id reference in `map/` goes through the same three checks, in this order:

1. It must be a whole number (`invalid-value`).
2. It must be below `max_provinces` from `default.map` (`province-id-too-large`, error). NCE sizes
   the province table from `max_provinces`, so valid ids are `1 .. max_provinces - 1`. Skipped when
   `default.map` is missing or has no `max_provinces`.
3. It must appear in `map/definition.csv` (`unknown-province`, error). Skipped when the mod has no
   `definition.csv`.

The `province` identifier category itself comes from `definition.csv`, and `default.map` supplies
`max_provinces` and the `sea_starts` set (see [mod-index.md](mod-index.md)).

## `map/default.map` → `mapDefault`

- `max_provinces` (number) is required (`missing-field`).
- `sea_starts` — a list of province ids (checked against the file's own `max_provinces`); a repeated
  id is `duplicate-province` (warning).
- `border_heights`, `terrain_sheet_heights` — lists of numbers.
- File-name fields (`definitions`, `provinces`, `positions`, `terrain`, `rivers`,
  `terrain_definition`, `tree_definition`, `continent`, `adjacencies`, `region`, `region_sea`,
  `province_flag_sprite`) — accepted unchecked (NCE discards them and uses fixed names).
- `tree`, `border_cutoff` — numbers.
- Anything else → `unknown-field`.

## `map/definition.csv` → `mapDefinition` (CSV)

`id;red;green;blue;name;x`. The first line is always the header. Blank lines and lines starting with
`#` are skipped.

- Fewer than four fields → `csv-too-few-fields`.
- An empty id is a dead row (the vanilla way to name lakes) and is skipped; id `0` is skipped too.
- A non-numeric id → `invalid-value`; an id at or above `max_provinces` → `province-id-too-large`.
- Each color component must be a whole number 0-255 (`invalid-color`).
- Two provinces with the same color → `duplicate-color` (error): `provinces.bmp` pixels of that
  color can only map to one of them. NCE silently keeps the last.
- Duplicate ids are reported by the mod index as `duplicate-identifier`.

## `map/adjacencies.csv` → `mapAdjacencies` (CSV)

`From;To;Type;Through;Data;Comment`. Header, blank, and `#` lines are skipped.

- Fewer than five fields → `csv-too-few-fields`.
- An empty `From` is skipped; `From`/`To` must be integers (`invalid-value`); `From <= 0` is a
  dead row.
- `To <= 0`: only `impassable` means anything (it marks `From` impassable); any other type →
  `ignored-adjacency` (warning).
- `From` and `To` are checked as province ids.
- `Type` must be `sea`, `land`, `impassable`, or `canal` (`unknown-adjacency-type`); NCE accepts and
  ignores `land`.
- `sea`: when `Through` is a non-zero id, it is checked as a province. Whether it is in
  `sea_starts` is **not** checked: mods route straits through land deliberately.
- `canal`: `Through` must be the canal's province id and `Data` a canal id above zero
  (`invalid-canal`).

## `map/region.txt`, `map/region_sea.txt`, `map/super_region.txt` → `mapRegion`

`NAME = { id id id ... }`. A block holds province ids only: an assignment inside is `unknown-field`,
a nested block is `stray-block`. Empty blocks are legal (tooltip-only meta-regions).

- Each id gets the province checks above; a repeated id → `duplicate-province` (warning).
- A sea zone inside a state, and a block that mixes already-assigned with unassigned provinces,
  are **not** reported. Both are deliberate: mods carve states that exist only to carry a
  localisation key, and those routinely hold sea ids or overlap existing states. The index still
  replays the engine's state assignment over `region.txt` (`stateOfProvince`, see
  [mod-index.md](mod-index.md)). A land province that replay leaves unassigned is
  `province-without-state`, reported on its row in `definition.csv` — the file that declares the
  province, not the one that forgot it. `map/continent.txt` gets the same treatment through
  `province-without-continent`.
- Same-file duplicate names are `duplicate-identifier`. All three files are validated the same way,
  but only `region.txt` **declares states**: `map/default.map` names `region` and `region_sea`,
  vanilla ships `region_sea.txt` as three empty naval blocks, and no `default.map` names
  `super_region` at all. A name that appears only in one of the other two is therefore not a state
  region, and the index does not take it for one (see [mod-index.md](mod-index.md)).

## `map/continent.txt` → `mapContinent`

`name = { provinces = { ids } <modifier values> }`. Bare ids directly in the body are accepted too
(NCE `continent_definition` free values).

- `provinces` holds ids only (`unknown-field` for an assignment inside).
- Any other assignment is a modifier value: `icon` or one of the 187
  [modifier keys](common-folder.md#modifier-keys), numeric (`unknown-modifier-key` otherwise).
- A province in two continents → `province-already-assigned` (warning; NCE keeps the last); the
  same id twice in one continent → `duplicate-province`.
- The reverse question is asked on `definition.csv`, not here: a land province **no** continent
  lists is `province-without-continent`, reported on its row the same way
  `province-without-state` and `province-without-climate` are. There is nowhere in this file to
  point at a province it never mentions.

## `map/climate.txt` → `mapClimate`

`name = { ... }` blocks holding either modifier values or bare province ids, or both. The same
climate name may appear twice (vanilla defines the values in one block and lists the provinces in
another); NCE merges them by name, so this is not a duplicate.

- Assignments are modifier values (`unknown-modifier-key`); bare numbers are province ids.
- A province in two climates → `province-already-assigned`; twice in one climate →
  `duplicate-province`. A land province in **no** climate is `province-without-climate`, reported on
  its `definition.csv` row. Both checks stay quiet when the stack has no `climate.txt` or no
  `region.txt` at all: that is one missing file, not a broken province per row.

## `map/terrain.txt` → `mapTerrain`

- `terrain = <number>` — the palette size (accepted numeric, otherwise ignored).
- `categories = { <name> = { ... } }` — one terrain type per block. Fields: `color` (a
  [color block](common-folder.md)), `is_water` (`yesno`), `tree` (`yesno`), `tree_density`
  (number), `icon`, and any modifier key; anything else → `unknown-modifier-key`. The block names
  populate the `terrain` identifier category.
- Every other top-level block is a **palette entry** mapping `terrain.bmp` indices to a type:
  `type` must name a category defined in this same file (`unknown-terrain`, checked against the
  buffer, not the index, so an unsaved new category is recognized); `color = { <indices> }` holds
  whole numbers 0-255 (`invalid-value`), and an index mapped by two entries is
  `duplicate-palette-index` (warning); `priority` (number) and `has_texture` (`yesno`) are
  accepted; anything else → `unknown-field`.

## `map/positions.txt` → `mapPositions`

`<province id> = { ... }`, one block per province.

- The key must be a whole number (`unknown-field` otherwise) and a known province; a second block
  for the same id → `duplicate-province` (warning; the engine keeps the last).
- `text_rotation`, `text_scale` — numbers. `text_position = { x y }` — both numbers, no other
  fields.
- `unit`, `city`, `factory`, `town`, `building_construction`, `military_construction`,
  `building_position`, `building_rotation`, `building_nudge`, `spawn_railway_track`,
  `railroad_visibility` — must be blocks; their content is not checked (NCE discards them).
- Anything else → `unknown-field`.

## `mapOther`

Any other `map/**/*.txt` (`province_flag_sprites/*.txt`, `trees.txt`) is syntax-checked only and
exempt from the top-level stray-entry check. `.csv` files other than the two above are `unknown`.
The `.bmp` files are `unknown` to the per-file pipeline too; they are checked by the side bar's
**Map Report** instead, see [map-images.md](map-images.md).

## Calibration

Against the TGC corpus every `map/` file validates clean except four `duplicate-province` warnings
(three ids listed twice in `THE_AMAZON_FOREST` in `region.txt`, one in `any_land_province` in
`super_region.txt`), all genuine. The index replay assigns exactly the mod's 2985 land provinces to
states, with no mixed blocks and no sea zones inside states, and every one of them sits on a
continent. Across vanilla, TGC, GFM, MGQ, SWD and TTA the only `province-without-continent` is
GFM's province 3589 (Las Cruces).
