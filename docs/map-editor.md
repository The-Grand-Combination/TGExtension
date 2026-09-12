# Map Editor

The side bar action **Map Editor** (`victorian-tools.openMapEditor`,
`commands/openMapEditorCommand.ts`) opens a tab with `map/provinces.bmp` drawn on a canvas. Clicking
a province shows and edits four things about it, each with its own **Save**:

1. **Localisation** — the `PROV<id>` key: the ENGLISH column of the CSV row that defines it.
2. **History** — the province history file, `history/provinces/<folder>/<id> - <name>.txt`, as a
   form: owner, controller, cores, trade goods, life rating, terrain, colonial/colony, slave state,
   buildings (`fort`, `naval_base`, `railroad`, and any other `key = number`),
   `party_loyalty` blocks, `state_building` blocks, and dated blocks (`1861.1.1 = { ... }`) with the
   same fields inside.
3. **Pops** — the `<id> = { ... }` block of `history/pops/<start date>/<file>.txt`: one row per pop
   with type, culture, religion and size. A pop's `militancy` / `rebel_type`, when the file has
   them, are kept as they are.
4. **Positions** — the `<id> = { ... }` block of `map/positions.txt`: where the game draws the
   province's `unit`, `city` and `factory`, and the `fort`, `railroad` and `naval_base` inside
   `building_position`. `y` counts from the bottom of the map. The other entries of the block
   (`text_position`, `text_rotation`, `text_scale`, construction points, `building_rotation`, ...)
   are kept as they are.

Positions are drawn over the map as one-pixel dots in the colour of their row in the **Positions**
tab (the round swatch is the legend), once the view is zoomed to at least four screen pixels per map
pixel. The selected province's dots are the exception: they are what the form holds, so they show at
any zoom and whatever the Positions layer switch says, with a white rim around them. Typing a
coordinate moves the dot, dragging a dot fills in the coordinates, and the target button on a row
drops the point on the province's centre of mass (moved to the nearest pixel the province owns, so a
crescent-shaped one does not send it to a neighbour). Nothing is written until **Save**; **Cancel**,
next to every Save, puts the whole form back as the file has it.

Moved points are kept when the next province is clicked, so a run of provinces can be fixed in one
go: they stay drawn on the map, the province keeps them when it is clicked again, and a **Save N
provinces** button appears under the map's own box to write them all. A **Cancel** drops the ones of
the province it is in. Closing the tab with points still held cannot be stopped — a webview has no
say in being closed — so the extension asks afterwards whether to write them, and writes them if the
answer is yes.

A translucent box in the map's bottom-left corner holds the **map layers** and, under them, the
**Fit** (whole map in view) and **Reload** (re-read the map and the mod files) buttons:

- **Positions** (on by default) shows or hides the dots at any zoom; hidden dots cannot be dragged.
- **Show Rivers** (off by default) draws `map/rivers.bmp` over the map: every palette index below
  254 (source, merge point and the river widths) becomes a blue pixel, sea and land stay clear. The
  bitmap is fetched from wherever the stack resolves it, so a mod without its own `rivers.bmp` shows
  the vanilla rivers. It is decoded once per map and kept until **Reload**.
- **Country Colors** (off by default) repaints every province towards the `color` of the country
  that owns it at the start date (the top-level `owner` of its history file; dated blocks are
  ignored). Each pixel becomes a mix of the owner's colour and the province's own `definition.csv`
  colour, so neighbours of one country stay told apart; the owner's share is the
  `victorianTools.mapEditor.countryColorsTint` setting (default 82%, a slider in the **Victorian
  Tools Settings** tab), and the map repaints when it changes. Sea provinces get a light
  blue, and provinces with no owner, `owner = ---`, or an owner without a definition file get grey.
  The layer is only paint: clicks, the tooltip, selection and drags keep reading the original pixels.

The panel header shows the province view's terrain picture behind the name: the sprite
`GFX_terrainimg_<terrain>` of `interface/*.gfx` (the `.dds` twin of a declared `.tga` is accepted,
as the game does), where the terrain is the history file's `terrain = x` or, failing that, the
category most of the province's `terrain.bmp` pixels carry through `map/terrain.txt`. Both bitmaps
are read once per mod stack, when the map opens. Only that terrain's own sprite is shown: a province
with neither terrain, or one whose terrain has no sprite, keeps a plain header instead of borrowing
another terrain's picture. A sea province shows the ocean instead: the stack's own
`gfx/interface/terrain/terrain_ocean` (`.tga` or `.dds`), else the copy shipped in the extension's
`assets/`. Its `GFX_terrainimg_ocean` sprite is not used, because vanilla declares that one against
the mountains texture.

The side panel has five tabs: **Definition** (localisation, the history fields, party loyalty and
cores), **Positions**, **Buildings**, **Extra Dates** and **Pops**. The three history tabs save the
same history file, so a Save posts the whole form and the tabs never drift. Owner,
controller, cores, trade goods, terrain, pop type, culture and religion are pick lists over the
mod's identifiers, labelled with their localised names (`USA - United States of America`, `Grain`,
`Urban (urban_fez)`); a value the mod does not define stays selectable so a save never drops it.

The rows are drawn in the order the file stores them, which is how the game reads them: the map
appears flipped vertically compared with an image editor. Hovering shows the id and the `definition.csv` name. The box in the bottom-left corner of the map
holds the layer switches, **Fit** (the whole map), **Reload** (re-read the map and the mod files) and
the search: type a province id or a name and press **Go** or Enter. A name is matched against
`definition.csv`, ignoring case — the whole name first, then one starting with what was typed, then
one holding it.

A sea province (from `sea_starts`) opens like any other, marked **sea**, but it can only have the two
things the game gives it: its name and the `unit` point fleets are drawn at. The history sections,
the other position kinds and the Buildings, Extra Dates and Pops tabs are greyed out and take no
input, so a save never invents a history or a pops block for open water.

Ctrl+click on a Map Report finding that names a pixel opens the editor there and selects the province
under it, reading the map with the mods that report was made for. The report gives pixels as an image
editor shows them, so the reveal flips y against the drawn rows (`height - 1 - y`). A finding about
`terrain.bmp` or `rivers.bmp` goes to the same place on the province map, and the status line says
which file it was about.

## Which mod is edited

The action opens the same mod dialog as the reports. The map and every file are **read through the
stack** of the picked mods (game files, then each mod in load order, `replace_path` honoured, see
[mods-and-submods.md](mods-and-submods.md)). Every edit is **written into the top mod** of that
stack, the last one in load order; its name is in the tab title and the side panel.

When the file a province is read from belongs to a layer below the target (the game, or a base mod
a submod depends on), the panel says so, and saving writes the edited copy into the target mod at
the same relative path. The lower layer is never modified. Localisation is the exception: a key
defined below the target is not copied file by file; the new text is **added as a row** to the
target's own province names file (the `localisation/*.csv` of the target holding the most `PROV`
keys, else a new `00_map-provinces.csv` with the standard 14-language header), which the game reads
first.

## Which province history files it reads

A province id is answered by the first file under `history/provinces` whose name starts with that id,
searched through the mod stack. That is the whole rule while each id appears once — but a total
conversion sometimes declares the **entire vanilla province set as empty placeholder files**, to keep
the engine from misbehaving, and keeps its real provinces in a folder of its own. Then the same id
exists twice, and the id is answered by whichever folder the directory walk reaches first, which is
alphabetical: a mod whose real folder is `middle earth` gets the empty placeholder from `africa`.

`victorianTools.mapEditor.provinceFolderPattern` narrows the search when that happens. It is a
regular expression matched against the **subfolder alone** — `middle earth`, `usa`, or empty for
files sitting directly in `history/provinces` — case-insensitively, so `^middle` keeps `middle earth`
and drops the other 25 folders. Leave it empty (the default) to use every folder; an invalid
expression is ignored, which is also every folder.

It narrows four things at once, so they stay consistent: which file a province opens, which file a
save patches, the **Folder** list offered when a province has no history file yet, and the owners the
**Country Colors** layer paints. A pattern matching no folder at all therefore leaves the editor
believing no province has a history file, and every save offers to create one.

Editable from the **Regex Patterns** tab of the **Victorian Tools Settings** page, which compiles
what is typed and says what it will do before it is saved. Changing it re-reads the mod stack, so an
open Map Editor redraws on its own.

## What a save changes

Files are patched, not regenerated, so comments, blank lines and the file's own order survive
(`services/textPatch.ts`). Line endings and indentation follow the file. Files are written in the
mod's own code page — see [encoding.md](encoding.md).

- **Localisation** (`services/provinceLocEdit.ts`): only the second field of the `PROV<id>` line is
  replaced; the other language columns and the `;x` terminator stay. `;` and line breaks in the new
  text become spaces. With **Rename the history file to match** ticked (the default), a history
  file of the target whose name differs from `<id> - <new name>.txt` is renamed; characters Windows
  forbids in file names are dropped.
- **History** (`services/provinceHistoryEdit.ts`): each top-level entry is compared with the form.
  A changed field is rewritten in its place; a removed one loses its line; a new one is inserted
  after the last entry of the same kind, or after the last plain field (before the first dated
  block) when there is none, dated blocks at the end. A `party_loyalty`, `state_building` or dated
  block is rewritten whole when anything inside it changed. `set_province_flag` /
  `clr_province_flag` lines, the province's own `remove_core` (only a dated block edits that one)
  and top-level entries the form does not know (a non-numeric unknown key, a stray token) are left
  untouched. Without a history file, the
  panel offers the `history/provinces` subfolders and creates `<folder>/<id> - <name>.txt` (name from
  the localisation, else `definition.csv`).
- **Pops** (`services/provincePopsEdit.ts`): the province's block is rewritten whole, from the
  first `<type> = {` to the closing brace; comments inside it are lost, the rest of the file is
  untouched. Every pop keeps `culture`, `religion`, `size`, and `militancy` / `rebel_type` when set.
  With more than one start date under `history/pops` a selector picks the date. Without a block for
  the province, the panel asks for the file name (an existing file of that date, or a new one) and
  appends the block.
- **Positions** (`services/provincePositionsEdit.ts`): a moved point rewrites only the `x` / `y`
  values that differ (compared as numbers, written with the game's six decimals); a cleared point
  loses its lines and the blank line after them; a new point is added before the closing brace of
  the province block, inside `building_position` for the building kinds (created when missing, and
  removed when its last point goes and nothing else is in it). Both the TGC layout
  (`x = 643.710000`, four-space indent) and the game's (`x=711.000000`, braces on their own lines,
  tabs) are patched in place. Without a block for the province, one is appended to the file.

Saving with nothing changed writes nothing. Over the TGC corpus, parsing every province history
file, every pops block and every positions block and saving it back unchanged produces zero patches.

## How it is built

- Model and requests: [model/mapEditor.ts](../src/model/mapEditor.ts) —
  `victorianTools/mapEditor/map` (the target, `provinces.bmp` and `rivers.bmp` paths, `definition.csv`
  rows, sea ids, pops dates and files, history folders), `victorianTools/mapEditor/positions` (every editable
  point of `map/positions.txt`, asked for once the map is shown), `victorianTools/mapEditor/countryColors`
  (the start-date owner of every province with a history file and the `color` of every owning tag,
  asked for after the positions and again after a history save), `victorianTools/mapEditor/province`
  (one province's four sections plus the identifier lists the form suggests),
  `victorianTools/mapEditor/save` (one section; the answer carries the province re-read from disk).
- Server: [server/mapEditorHandlers.ts](../src/server/mapEditorHandlers.ts) resolves the target
  with the same rule as the reports, reads through `resolveLayeredFile`, and remembers which pops
  file holds which province per stack and date, the parsed `positions.txt` per stack, and the owners
  and country colours per stack (all dropped when watched files change; the positions after a
  positions save and the colours after a history save, too).
- Loading progress and page errors are shown in the map area and logged to the **Victorian Tools
  Language Server** output channel (`Map editor page: ...` lines).
- Client: [providers/mapEditorPanel.ts](../src/providers/mapEditorPanel.ts) owns the webview and
  forwards messages ([providers/mapEditorMessages.ts](../src/providers/mapEditorMessages.ts) checks
  every field); [providers/mapEditorHtml.ts](../src/providers/mapEditorHtml.ts) is the page. The
  page fetches `provinces.bmp` itself (the map folder is allowed as a local resource), decodes the
  24/32-bit BMP in the browser, and maps a clicked pixel's color to a province through the
  `definition.csv` rows it received. Nothing pixel-sized crosses the language server connection.
- Services are `vscode`-free and unit-tested: `textPatch`, `provinceTable`, `provinceLocEdit`,
  `provinceHistoryEdit`, `provincePopsEdit`, `provincePositionsEdit`, `countryColors`
  (`src/test/unit/`).
