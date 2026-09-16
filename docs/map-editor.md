# Map Editor

The side bar action **Map Editor** (`victorian-tools.openMapEditor`,
`commands/openMapEditorCommand.ts`) opens a tab with `map/provinces.bmp` drawn on a canvas. Clicking
a province shows and edits five things about it:

1. **Localisation** — the `PROV<id>` key: the ENGLISH column of the CSV row that defines it.
2. **History** — the province history file, `history/provinces/<folder>/<id> - <name>.txt`, as a
   form: owner, controller, cores, trade goods, life rating, terrain, colonial,
   buildings (`fort`, `naval_base`, `railroad`, and any other `key = number`),
   `party_loyalty` blocks, `state_building` blocks, and dated blocks (`1861.1.1 = { ... }`) with the
   same fields inside. Its last field is **Climate**, which is not in the history file at all: it is
   the `map/climate.txt` block the province is listed in, and this Save writes it.
3. **State** — the `map/region.txt` blocks the province is listed in, as a list: a province needs at
   least one, and may be in several.
4. **Pops** — the `<id> = { ... }` block of `history/pops/<start date>/<file>.txt`: one row per pop
   with type, culture, religion and size. A pop's `militancy` / `rebel_type`, when the file has
   them, are kept as they are.
5. **Positions** — the `<id> = { ... }` block of `map/positions.txt`: where the game draws the
   province's `unit`, `city` and `factory`, and the `fort`, `railroad` and `naval_base` inside
   `building_position`. `y` counts from the bottom of the map. The other entries of the block
   (`text_position`, `text_rotation`, `text_scale`, construction points, `building_rotation`, ...)
   are kept as they are.

The first three are one tab with **one Save** at the bottom of it: the name, the climate, the states
and the history file are what a province *is*, and they are written together. Pops and Positions are
their own tabs with their own Saves, and so are Buildings and Extra Dates, which write the same
history file as the Definition tab.

Positions are drawn over the map as one-pixel dots in the colour of their row in the **Positions**
tab (the round swatch is the legend), once the view is zoomed to at least four screen pixels per map
pixel. The selected province's dots are the exception: they are what the form holds, so they show at
any zoom and whatever the Positions layer switch says, with a white rim around them. Typing a
coordinate moves the dot, dragging a dot fills in the coordinates, and the target button on a row
drops the point on the province's centre of mass (moved to the nearest pixel the province owns, so a
crescent-shaped one does not send it to a neighbour). Nothing is written until **Save**; **Cancel**,
next to every Save, puts the whole form back as the file has it.

A **Save** reads back from disk only what it wrote: what the other tabs are holding — the history
form, the pops table, the climate, the states, the points that were dragged — is kept exactly as it
was typed. Only **Cancel** puts a tab back to the file. What each Save writes is what its own tab
shows, which for the Definition tab is four files (the localisation CSV, `map/climate.txt`,
`map/region.txt` and the history file) and for the Buildings and Extra Dates tabs is one: they show
neither the name nor the climate nor the states, so they touch none of them.

**Every land province has a climate and a state.** Without the first it carries no climate modifier;
without the second the engine leaves it out of every state, so nothing can own, develop or trade with
it. So no Save of a land province goes through while either is missing — the reason says which one
and where to fill it in — and a province cannot be created without both. A **sea province** is in
neither file and is saved without them, and never gets a history file created for it either; for one
being created that is what the **Sea province** tick decides, so the reason says so. A mod stack with
no `climate.txt` or no `region.txt` at all is not held to the rule: there would be nothing to pick.

Moved points are kept when the next province is clicked, so a run of provinces can be fixed in one
go: they stay drawn on the map, the province keeps them when it is clicked again, and a **Save N
provinces** button appears under the map's own box to write them all. A **Cancel** drops the ones of
the province it is in. A province that is only paint so far is the exception: its points live with
its panel and go when it is left or when the paint is reset — there is no id in `definition.csv` to
hold them against — unless the Save that creates it has run, after which they are kept like any
other's. Closing the tab with points still held cannot be stopped — a webview has no
say in being closed — so the extension asks afterwards whether to write them, and writes them if the
answer is yes.

## Layers

The top box in the map's bottom-left corner is **Layers**: the three map bitmaps, each a row with a
square thumbnail (the whole map squeezed into it, the way an icon is), its name beside it and an
**opacity slider** under the name (the number is on the slider's tooltip), and under them the
reference pictures dropped in.

- **Provinces** (`provinces.bmp`) is what is painted and what the clicks read. It is drawn first, at 100%.
- **Rivers** (`rivers.bmp`) goes over it, at 20%: every palette index below 254 (source, merge point and the
  river widths) is a blue pixel and everything else is clear — only the rivers, never the land and
  sea the file itself paints. Its thumbnail, though, is the file as an image editor shows it, through
  its own palette (the magenta sea and white land), with every cell a river crosses in the river's
  palette colour, since a one-pixel river would otherwise vanish from a sample.
- **Terrain** (`terrain.bmp`) goes over both, at 0%: shown through its own palette, the colours an image editor
  gives it.

A layer at 0% is not even fetched; the first time its slider leaves 0 it is read from wherever the
stack resolves it (a mod without its own `rivers.bmp` shows the vanilla rivers), decoded once and
kept until **Reload**. A layer's thumbnail is the icon shipped with the extension as
`assets/<layer>.png` when there is one; a layer without an icon gets its bitmap sampled small on the
server rather than decoded whole (`services/mapThumbnails.ts`), after the map is up so it never
holds it back.
The fixed layers' opacities last the session; a reference's is written with it.

### Reference pictures

Any picture — a historical map, a sketch — comes in through **Add Reference** under the rows, a file
picker that takes several at once. (Dropping a file on the tab does not work: VS Code takes the drop
itself and opens the file in an editor before the page sees it; the page still accepts a drop that
does reach it.) The picture is copied into the target mod's **`map/references/`** under its own name
(made safe, and numbered when taken), and
`map/references/references.json` records, in order, each picture's file, its four corners in map
pixels, its opacity and, when it is switched off, `"hidden": true`, so the whole set travels with the mod's git. The file is never re-encoded:
it stays at the resolution it came in, and lands one picture pixel per map pixel with its top-left
corner at the middle of the view (or where it was dropped, when a drop gets through), at 60%.

The box shows three reference rows; more scroll inside the same height, so the box never grows. A
row's slider is the picture's opacity, and its **×** removes it — from the list and from the folder.
Pictures are edited with the **reference tool**, second in the tool box (the picture-file glyph): click a
picture to select it — a dashed frame with eight grips appears — and drag inside to move it, drag a
grip to stretch that side or corner, hold **Shift** on a grip to scale keeping the proportions (from
the opposite corner, by the axis pulled further), or hold **Ctrl** on a grip for Photoshop's distort:
a corner grip moves that corner alone and a side grip slides the whole side, so the picture becomes
any quadrilateral. Where pictures overlap, the topmost (last in the list) is the one grabbed. A click
on bare map puts the frame away; so does **Esc**; and under any other tool the frame is simply not
drawn — the selection is kept, and comes back with the tool. Clicking a row's **thumbnail** switches
the picture off: it leaves the map, the thumbnail greys out, and its opacity slider stays where it
was, so another click brings it back exactly as it was; the switch is written to the manifest with
the picture. A picture just added comes up selected, with the
tool, and clicking a row's name selects one later, switching to the tool as well. The hand and the
painting tools never mind a reference: the hand opens the province under it, the brushes paint the
province map straight through it, and the middle and right buttons still pan under the reference
tool as under every other.

A picture that is still a parallelogram is drawn with one transformed `drawImage`; a bent one is
drawn as an 8 × 8 mesh of triangles, each under its own affine map (`services/referenceLayers.ts`
holds the geometry both the page and the extension use). References are the editor's own data, so
the extension reads and writes the folder itself, in UTF-8 and raw bytes, never through the mod's
code page. Ctrl+Z does not reach them — it undoes paint — and they come from the target mod only.

The box under Layers holds the tools ([Painting provinces](#painting-provinces)), and the bottom one
the **map switches** and, under them, the **Fit** (whole map in view) and **Reload** (re-read the map
and the mod files) buttons:

- **Positions** (on by default) shows or hides the dots at any zoom; hidden dots cannot be dragged.
- **Country Colors** (off by default) repaints every province towards the `color` of the country
  that owns it at the start date (the top-level `owner` of its history file; dated blocks are
  ignored). Each pixel becomes a mix of the owner's colour and the province's own `definition.csv`
  colour, so neighbours of one country stay told apart; the owner's share is the
  `victorianTools.mapEditor.countryColorsTint` setting (default 82%, a slider in the **Victorian
  Tools Settings** tab), and the map repaints when it changes. Sea provinces get a light
  blue, and provinces with no owner, `owner = ---`, or an owner without a definition file get grey.
  The layer is only paint: clicks, the tooltip, selection and drags keep reading the original pixels.

## Painting provinces

A second box sits over the layers one, holding the five tools as a pad, the brush-width slider, and
the colour being painted with. What the brush writes is a **colour**, not a province: the bitmap is
pixels, and which province a pixel belongs to is `definition.csv`'s business, read back from the
colour. So a colour can be picked off the map or chosen outright, and painting never waits for a
province to be selected.

The **hand** is what the editor has always done — drag to move the map, click a province to open it
in the side panel (clicking the one already open closes it again), drag a position dot to move it —
and it is the tool the page starts on. Next to it, the **reference tool** edits the pictures of the
Layers box ([Reference pictures](#reference-pictures)). The other three paint with the box's colour:

- the **eye drop** takes the colour of the pixel clicked, whether or not a province owns it, and the
  status line names the province when one does. Picked up from another tool, it gives that tool
  back once the colour is taken — pencil, eye drop, click, pencil again — so matching a colour is
  one click out of the drawing, not two.
- the **pencil** paints the pixels it is dragged over, as a square of the brush slider's map pixels
  (1 by default, up to 16; the slider is greyed under the tools that do not draw a line). A fast drag
  still draws a line, not a dotted one.
- **Draw and paint** grows a province in one gesture: draw a line that leaves a province of the
  chosen colour and comes back into it somewhere else, and everything the line shut in is filled.
  The line and the pixels already holding the colour are one wall; whatever the edge of the map can
  no longer reach around that wall, next to the line, becomes part of the province. A line that never
  comes back closes nothing off and says so, leaving only the line itself painted. Its line is never
  thinner than two pixels, because a one-pixel line drawn at an angle leaks through its own corners.
- the **bucket** gives everything that touches the pixel clicked and shares its colour — four
  neighbours at a time, so a region that only meets another through a corner stays where it is.

The colour swatch is a colour picker: any colour can be painted, including one no province has yet.
Beside it are its red, green and blue as `definition.csv` writes them, and its hex is on the swatch's
own tooltip. **Generate Color**, under the row, takes a colour at random that **nothing on the map is
using** — no `definition.csv` row, no lake row, and no pixel of `provinces.bmp`, because a colour no
row names is still a blob on the map and painting with it would silently merge the two. The bitmap is
walked once, on the first Generate; after that the only colour that can reach the map is the brush's,
and that one is remembered as it is set.

Both boxes are **three tool icons wide** and no wider, padding included: they sit over the map, which
is what is being looked at. Everything in them is sized to that one width — the type is a notch
smaller, the buttons grow from their own labels to share a row, and a layer name stays on one line
even where it runs into the padding: two lines for one switch reads worse than a name reaching the
edge.

The middle mouse button moves the map under every tool — the pointer becomes the hand while it is
held, as it is under the hand tool — and the wheel still zooms, so painting a border never means
putting the brush down to reach the rest of the map. The **right button borrows the hand**: it ends
whatever was being drawn and moves the map while it is held, then gives the tool back the moment it
comes up. No context menu opens over the map, and only the left button opens a province in the side
panel.

Nothing reaches `map/provinces.bmp` while painting: the pixels change on the page, and the two
buttons under the colour decide what becomes of them. **Save** writes them all in one go; **Reset**
puts every one of them back the way the file has it. Both stand there always, greyed while there is
nothing painted, and their tooltip carries the count. `Ctrl+Z` takes back a stroke and
`Ctrl+Shift+Z` (or `Ctrl+Y`) puts it back, as many as
`victorianTools.mapEditor.paintUndoSteps` allows — 20 by default, a number in the **Victorian Tools
Settings** tab. Undoing back to the start greys the buttons again: a pixel that holds its file
colour is no longer an edit.

The write follows the rule every other save follows: the bitmap is read wherever the mod stack
resolves it and written into the **target mod**, so a mod without a `provinces.bmp` of its own gets
one, with only the painted pixels differing from the layer below. Everything else about the file —
its size, its header, its bit depth — is left exactly as it was. A **Reload** with pixels still held
asks first — and so does opening the Map Editor again, from the side bar or from a map report link,
while it is holding painted pixels or points moved and not saved: **Discard and continue** loads the
map, anything else leaves the tab as it is. Closing the tab with pixels still held says so: a webview
cannot refuse to close, and the page is the only place those pixels exist.

## Creating a province

Painting is colours, and `map/definition.csv` is what says which province a colour is — so a colour
the table does not name is a province waiting to be declared. Clicking one opens **the same province
panel**, for a province that does not exist yet: the header says *New province*, the id is the next
free one (past the last in the table, never one another province had), and the Definition tab grows a
**Sea province** tick. The map tooltip says as much over those pixels; a colour that is a *lake* row
of the table says that instead, and opens nothing.

The panel works as it always does, and the **first Save is what creates the province**. Before
anything is written, a modal names every file the save will touch:

> Create province 3531?
> This writes: map/definition.csv, map/default.map, map/climate.txt, map/region.txt,
> history/provinces/3531 - Nova.txt

**Create** writes them; **Cancel** writes nothing at all. What the save does, in order:

1. the row `id;red;green;blue;name;x` goes into `map/definition.csv` after the last row that has an
   id — the lake rows, which have none, close the file and stay there — with the name from the
   localisation field;
2. `map/default.map` gets room for the id — `max_provinces` is a count, so it has to end up *over*
   the new id, and the engine ignores any province at or past it — and, with **Sea province** ticked,
   the id joins `sea_starts`;
3. the id joins its climate in `map/climate.txt` and its states in `map/region.txt` — a land
   province with neither is refused before anything is written at all;
4. the section saves what it would have saved anyway (the history file of a new province is named
   after the name being created).

Everything lands in the **target mod**, copying the file from the layer below when the mod has none
of its own, exactly as the other saves do. Should a later step fail — the history file refused, say —
the status line says what was already written (`already written: definition.csv, default.map`): the
province exists from that point, and the next Save carries on from the row without adding a second.
A sea province created this way reads as sea at once, from `default.map` on disk, without waiting for
the mod index to catch up. From then on the colour is a province like any other:
clicking it opens it, and the per-section Saves take over. The new pixels still have to be written to
`provinces.bmp` with **Save** in the tool box — the two are separate files and separate saves.

The rest of what a new province needs is ordinary editing: its `PROV<id>` name, its history file, its
pops, and its points in `positions.txt`, each with its own Save in the panel.

The panel header shows the province view's terrain picture behind the name: the sprite
`GFX_terrainimg_<terrain>` of `interface/*.gfx` (the `.dds` twin of a declared `.tga` is accepted,
as the game does), where the terrain is the history file's `terrain = x` — and only that. A province
whose file names none has no terrain here, however its `terrain.bmp` pixels read, and shows
`no_terrain` from the extension's `assets/`; a province being created is one such. The heading's
tooltip still names the category most of its `terrain.bmp` pixels carry through `map/terrain.txt`,
so the bitmap is one hover away. Both bitmaps are read once per mod stack, when the map opens. Only
the named terrain's own sprite is shown, never another terrain's: a province whose terrain has no
sprite keeps a plain header. Clearing the **Terrain** field swaps the picture for `no_terrain` at
once, before any Save. A sea province shows the ocean: the stack's own
`gfx/interface/terrain/terrain_ocean` (`.tga` or `.dds`), else the copy shipped in the extension's
`assets/`. Its `GFX_terrainimg_ocean` sprite is not used, because vanilla declares that one against
the mountains texture.

The side panel has five tabs: **Definition** (localisation, the history fields, the State section,
party loyalty and cores, under one Save), **Positions**, **Buildings**, **Extra Dates** and **Pops**.
The three history tabs save the same history file, so a Save posts the whole form and the tabs never
drift. Every identifier field is
the same pick list over the mod's identifiers: owner, controller, cores, trade goods, terrain,
ideology, building, pop type, culture and religion. All but the last three are labelled `identifier -
localised name` (`USA - United States of America`, `grain - Grain`, `urban_fez - Urban`,
`conservative - Conservative`, `steel_factory - Steel Factory`), the identifier first because it is
what the file holds and several of them can share one name; pop type, culture and religion carry the
localised name alone. A value the mod does not define stays selectable so a save never drops it. The
list opens on a click, not on focus, so a row added to a list does not open over the rows under it.

**Climate** is one of the blocks of `map/climate.txt` — a climate names two blocks, its modifiers
and its provinces, and only the second is a membership. Changing it takes the id out of the block it
was in and puts it in the chosen one. **States** is the same list over `map/region.txt`, except that
it takes several: the engine puts the province in the first block that claims it, and the others are
the meta-regions built on top. A name the file does not have yet becomes a block of its own at the
end of it, so a new state can be started from here.

The two building lists are split by what the game lets each hold: **State buildings** offers the
`type = factory` buildings of `common/buildings.txt`, **Buildings** every other one (fort, naval_base,
railroad, and whatever else the mod declares).

A field the province does not need is greyed out rather than removed, so the panel keeps its height
as you click from one province to the next. The scrollbar gutter is reserved the same way: a list
that grows past the window gets its scrollbar without anything under it moving.

A row is a line of the file only once it is filled in: a Save drops an empty core and, the same way,
any row still missing one of its fields. A tick box is never missing — `upgrade` on a state building
is one, and unticked simply writes no `upgrade` line.

**Colonial** is a slider over the three levels the game reads, with a dot for each and the level named
beside it: 0 is **No**, 1 is **Colony**, 2 is **Colonial State**. A province at 0 writes no `colonial`
line at all — that is the game's default — unless the block
already had one, because a dated `colonial = 0` is how a province stops being a colony and dropping it
would change what the file says.

A `party_loyalty` row is an ideology and a slider from 1 to 100. Loyalty is a share of the province's
parties, so the rows together stop at 100: each slider reaches only what the others leave it, and the
running total beside the list's title says where they stand. A file that is already over the cap is not
rewritten — a slider is never capped below the value it came with, so it can only be brought down —
and the total is marked until it is.

The rows are drawn in the order the file stores them, which is how the game reads them: the map
appears flipped vertically compared with an image editor. Hovering shows the id and the `definition.csv` name. The box in the bottom-left corner of the map
holds the layer switches, **Fit** (the whole map), **Reload** (re-read the map and the mod files) and
the search: type a province id or a name and press **Go** or Enter. A name is matched against
`definition.csv`, ignoring case — the whole name first, then one starting with what was typed, then
one holding it.

A sea province (from `sea_starts`) opens like any other, under the ocean picture, but it can only have
the two things the game gives it: its name and the `unit` point fleets are drawn at. The history
form, the State list, the other position kinds and the Buildings, Extra Dates and Pops tabs are
greyed out and take no input — the Definition tab's Save is not, because the name is still its to
write, and the server creates no history file for open water whatever the locked form holds. The History and Pops
headers say as much instead of naming a file that would be created, and the localisation's rename box
is greyed with them.

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
save patches, the **Folder** list the province offers, and the owners the
**Country Colors** layer paints. A pattern matching no folder at all therefore leaves the editor
believing no province has a history file, and every save offers to create one.

A save is the one place that looks past the pattern. Before it creates a file it checks the folders
the pattern hides as well, and refuses when the id already has one there, naming the folder: two
files for the same id is something the game loads twice, and a pattern that is narrower than the mod
is a typo worth hearing about rather than a second file to clean up later.

Editable from the **Regex Patterns** tab of the **Victorian Tools Settings** page, which compiles
what is typed and says what it will do before it is saved. Changing it re-reads the mod stack, so an
open Map Editor redraws on its own.

## What a save changes

Files are patched, not regenerated, so comments, blank lines and the file's own order survive
(`services/textPatch.ts`). Line endings and indentation follow the file. Files are written in the
mod's own code page — see [encoding.md](encoding.md).

- **Localisation** (`services/provinceLocEdit.ts`), written by the Definition tab's Save after the
  history file, so a rename finds the file that same Save may have just created: only the second field of the `PROV<id>` line is
  replaced; the other language columns and the `;x` terminator stay. `;` and line breaks in the new
  text become spaces. With **Rename the history file to match** ticked, a history file of the
  target whose name differs from `<id> - <new name>.txt` is renamed; characters Windows forbids in
  file names are dropped, and the name is folded to ASCII first — the game loads a file name as
  plain ASCII, so `São José do Norte` names `3532 - Sao Jose do Norte.txt`. A name no ASCII letter
  stands for (Cyrillic, CJK) is refused before anything is written, naming the character: the
  localisation itself may hold it, the file name may not. An existing file already named that way is
  reported as `non-ascii-file-name` by the full report. The box starts ticked only above vanilla's `max_provinces` (3249): a
  base-game province keeps the file name vanilla gave it unless you ask for the rename. With no
  history file to rename, the box is greyed out.
- **History** (`services/provinceHistoryEdit.ts`): each top-level entry is compared with the form.
  A changed field is rewritten in its place; a removed one loses its line; a new one is inserted
  after the last entry of the same kind, or after the last plain field (before the first dated
  block) when there is none, dated blocks at the end. A `party_loyalty`, `state_building` or dated
  block is rewritten whole when anything inside it changed. `set_province_flag` /
  `clr_province_flag` lines, `colony` and `is_slave`, the province's own `remove_core` (only a dated
  block edits that one) and top-level entries the form does not know (a non-numeric unknown key, a
  stray token) are left untouched: the form does not show them, so it never rewrites them. The **Folder** row offers the
  `history/provinces` subfolders. Where the province has no file yet it creates
  `<folder>/<id> - <name>.txt` (name from the localisation, else `definition.csv`); where it has one
  the row opens on the folder holding it, and picking another one makes the next save move the file
  there — a file a layer below owns is never moved, so the copy this mod takes over is written in the
  folder picked instead.
- **Climate and State** (`services/provinceGroupEdit.ts`): both files are named blocks of bare
  province ids, and both are edited the same way — the id joins the blocks it should be in, after the
  last id already there, and leaves the ones it should not, taking one separator with it (or its
  whole line, when it was alone on one). A block a modifier assignment appears in is never touched:
  that is a climate's values, not its provinces. A name neither file declares is appended as
  `NAME = { <id> }`.
- **Pops** (`services/provincePopsEdit.ts`): the province's block is rewritten whole, from the
  first `<type> = {` to the closing brace; comments inside it are lost, the rest of the file is
  untouched. Every pop keeps `culture`, `religion`, `size`, and `militancy` / `rebel_type` when set.
  With more than one start date under `history/pops` a selector picks the date. The **File** row says
  where a block would be created — a pick list of that date's files that also takes a name the date
  does not have yet — and the block is appended there. It is greyed out, not taken away, once the
  province has a block of its own.
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
  `victorianTools/mapEditor/thumbnails` (the three bitmaps sampled small for the Layers box),
  `victorianTools/mapEditor/map` (the target, `provinces.bmp`, `rivers.bmp` and `terrain.bmp` paths, `definition.csv`
  rows, sea ids, pops dates and files, history folders), `victorianTools/mapEditor/positions` (every editable
  point of `map/positions.txt`, asked for once the map is shown), `victorianTools/mapEditor/countryColors`
  (the start-date owner of every province with a history file and the `color` of every owning tag,
  asked for after the positions and again after a history save), `victorianTools/mapEditor/province`
  (one province's four sections; the identifier lists the form suggests come once, with the map),
  `victorianTools/mapEditor/save` (one tab's Save, which may stand for several files; the answer
  carries the province re-read from disk).
- Server: [services/mapEditorHandlers.ts](../src/services/mapEditorHandlers.ts) resolves the target
  with the same rule as the reports, reads through `resolveLayeredFile`, and remembers per stack the
  decoded bitmaps, the parsed `definition.csv`, the map script files, which pops file holds which
  province per date, the `history/provinces` walk, the owners and country colours, the terrain
  pictures and the thumbnails — each dropped by the files it was read from when they change on
  disk, and by the save that changes them (the positions after a positions save, the colours after
  a history save, the bitmap after a paint). A read that fails is not remembered.
- Loading progress and page errors are shown in the map area and logged to the **Victorian Tools
  Language Server** output channel (`Map editor page: ...` lines).
- Client: [providers/mapEditorPanel.ts](../src/providers/mapEditorPanel.ts) owns the webview and
  forwards messages ([services/mapEditorMessages.ts](../src/services/mapEditorMessages.ts) checks
  every field; a message that throws is logged and answered with an error, never left hanging);
  [providers/mapEditorHtml.ts](../src/providers/mapEditorHtml.ts) is the page's markup and style,
  and its script is the modules of [src/webview/](../src/webview/), bundled into one file. The
  page fetches `provinces.bmp` itself (the map folder is allowed as a local resource), decodes the
  24/32-bit BMP in the browser, and maps a clicked pixel's color to a province through the
  `definition.csv` rows it received. Nothing pixel-sized crosses the language server connection.
- One builder per kind of control, used by every tab: `selectInput` for every pick list, `textInput`
  for text and numbers, `sliderInput`, `checkInput` (a tick in a table row) and `checkRow` (a tick
  with its own text), `plusButton` and `removeButton`, `listEditor` and `rowsEditor` for the row
  lists, `sectionHeader` with `saveBar` for a section. The page holds no `<select>`: a select insets
  its text further than an input, so a row built with one stands out of line with the rows around
  it. See §4 of `CLAUDE.md` before adding a control.
- Services are `vscode`-free and unit-tested: `textPatch`, `provinceTable`, `provinceLocEdit`,
  `provinceHistoryEdit`, `provincePopsEdit`, `provincePositionsEdit`, `countryColors`
  (`src/test/unit/`).
