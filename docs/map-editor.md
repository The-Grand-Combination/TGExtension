# Map Editor

The side bar action **Map Editor** (`victorian-tools.openMapEditor`,
`commands/openMapEditorCommand.ts`) opens a tab with `map/provinces.bmp` drawn on a canvas. Clicking
a province shows and edits three things about it, each with its own **Save**:

1. **Localisation** — the `PROV<id>` key: the ENGLISH column of the CSV row that defines it.
2. **History** — the province history file, `history/provinces/<folder>/<id> - <name>.txt`, as a
   form: owner, controller, cores, trade goods, life rating, terrain, colonial/colony, slave state,
   buildings (`fort`, `naval_base`, `railroad`, and any other `key = number`),
   `party_loyalty` blocks, `state_building` blocks, and dated blocks (`1861.1.1 = { ... }`) with the
   same fields inside.
3. **Pops** — the `<id> = { ... }` block of `history/pops/<start date>/<file>.txt`: one row per pop
   with type, culture, religion and size. A pop's `militancy` / `rebel_type`, when the file has
   them, are kept as they are.

The side panel has two tabs: **Definition** (localisation and history) and **Pops**. Owner,
controller, cores, trade goods, terrain, pop type, culture and religion are pick lists over the
mod's identifiers, labelled with their localised names (`USA - United States of America`, `Grain`,
`Urban (urban_fez)`); a value the mod does not define stays selectable so a save never drops it.

The rows are drawn in the order the file stores them, which is how the game reads them: the map
appears flipped vertically compared with an image editor. Hovering shows the id and the `definition.csv` name; the **Go** box centers the map on an id;
**Fit** shows the whole map; **Reload** re-reads the map and the mod files. Sea provinces (from
`sea_starts`) are marked as such but edit like any other.

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

## What a save changes

Files are patched, not regenerated, so comments, blank lines and the file's own order survive
(`services/textPatch.ts`). Line endings and indentation follow the file. Files are written in the
game's windows-1252 encoding.

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
  `clr_province_flag` lines and top-level entries the form does not know (a non-numeric unknown
  key, a stray token) are left untouched. Without a history file, the
  panel offers the `history/provinces` subfolders and creates `<folder>/<id> - <name>.txt` (name from
  the localisation, else `definition.csv`).
- **Pops** (`services/provincePopsEdit.ts`): the province's block is rewritten whole, from the
  first `<type> = {` to the closing brace; comments inside it are lost, the rest of the file is
  untouched. Every pop keeps `culture`, `religion`, `size`, and `militancy` / `rebel_type` when set.
  With more than one start date under `history/pops` a selector picks the date. Without a block for
  the province, the panel asks for the file name (an existing file of that date, or a new one) and
  appends the block.

Saving with nothing changed writes nothing. Over the TGC corpus, parsing every province history
file and every pops block and saving it back unchanged produces zero patches.

## How it is built

- Model and requests: [model/mapEditor.ts](../src/model/mapEditor.ts) —
  `victorianTools/mapEditor/map` (the target, `provinces.bmp` path, `definition.csv` rows, sea ids,
  pops dates and files, history folders), `victorianTools/mapEditor/province` (one province's three
  sections plus the identifier lists the form suggests), `victorianTools/mapEditor/save` (one
  section; the answer carries the province re-read from disk).
- Server: [server/mapEditorHandlers.ts](../src/server/mapEditorHandlers.ts) resolves the target
  with the same rule as the reports, reads through `resolveLayeredFile`, and remembers which pops
  file holds which province per stack and date (dropped when watched files change).
- Loading progress and page errors are shown in the map area and logged to the **Victorian Tools
  Language Server** output channel (`Map editor page: ...` lines).
- Client: [providers/mapEditorPanel.ts](../src/providers/mapEditorPanel.ts) owns the webview and
  forwards messages ([providers/mapEditorMessages.ts](../src/providers/mapEditorMessages.ts) checks
  every field); [providers/mapEditorHtml.ts](../src/providers/mapEditorHtml.ts) is the page. The
  page fetches `provinces.bmp` itself (the map folder is allowed as a local resource), decodes the
  24/32-bit BMP in the browser, and maps a clicked pixel's color to a province through the
  `definition.csv` rows it received. Nothing pixel-sized crosses the language server connection.
- Services are `vscode`-free and unit-tested: `textPatch`, `provinceTable`, `provinceLocEdit`,
  `provinceHistoryEdit`, `provincePopsEdit` (`src/test/unit/`).
