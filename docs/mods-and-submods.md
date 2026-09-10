# Mods, submods and the game files

Victoria 2 does not load a mod in isolation. The launcher stacks the game folder, the selected mods
and their submods, and reads every file through that stack. The extension reproduces the stack, so a
submod is validated against the identifiers of the mod it extends, and a mod that keeps part of the
game files is validated against those too.

## What the engine does (NCE `simple_fs` / `mod_file::add_to_file_system`)

- Roots are ordered: the game root first, then each selected mod's `path` (relative to the game
  root), in load order. A lookup walks the roots from the **last** to the first and takes the first
  hit, so a later mod overrides an earlier one file by file.
- A folder listing merges every root by **file name**: a mod's `events/Foo.txt` replaces the game's
  `events/Foo.txt`, and the game's other event files still load.
- `replace_path = "X"` hides `<game root>/X/` from the lookup. It is resolved against the game root
  only, so a submod's `replace_path = "mod/GFM/history/provinces"` hides that folder of its parent
  mod, and a plain `replace_path = "events"` hides only the game's events, never another mod's.
- `dependencies = { "Name" ... }` names the mods (by their `name`) that must load before this one.
  The launcher sorts selected mods so every dependency comes first.
- Only `mod/*.mod` at the top of the mod folder is read; descriptors in subfolders (TGC's
  `mod/TGC Niche Submods/`) are invisible until moved, exactly as in the launcher.

## What the extension does

**Descriptors** ([src/parser/modDescriptor.ts](../src/parser/modDescriptor.ts)) — `name`, `path`,
`user_dir`, every `replace_path`, `dependencies`. `path` is required; the name falls back to the file
name. Unknown keys (`github`, `current_release`) are ignored. The mod folder is `path` without its
leading `mod/`, next to the descriptor, so a git checkout laid out like the `mod/` folder (GFM's
repository: `GFM.mod` beside `GFM/`, `GFM Newspapers.mod` beside `GFM Newspapers/`) resolves like the
install does. The server reads `<game>/mod/*.mod` and, for every workspace folder, the nearest
folder above it holding `.mod` files; a checkout shadows the installed copy of the same name, since
the checkout is what is being edited.

**Game root** ([src/services/modLayout.ts](../src/services/modLayout.ts) `detectGameRoot`) — the
first folder above a workspace folder that holds `mod/`, `common/` and `map/`; `victorianTools.gamePath`
overrides the detection when the workspace is elsewhere. Without a game root the extension behaves
as before: a mod is the nearest folder with `common/` and is read alone.

**Layers** ([src/services/modLayers.ts](../src/services/modLayers.ts)) — `layersOf(gameRoot, mods)`
builds the ordered roots and the hidden folders; `resolveLayeredFile`, `listLayeredFiles` and
`listLayeredFilesRecursive` implement the three engine rules above; `layeredIndexProvider` feeds the
[mod index](mod-index.md) so `countries.txt`, `events/*.txt`, localisation and every other indexed
file come from the stack. Path comparison is case-insensitive on Windows.

**Which stack a file gets** (`locateFile`):

| File | Stack (lowest first) |
|---|---|
| in a selected mod | game → every selected mod and its dependencies, in load order |
| in any other known mod (installed or checked out) | game → that mod's dependencies → that mod |
| in a `<game>/mod/<folder>` with no descriptor | game → that folder |
| in the game folder itself | game alone |
| anywhere else, under a folder with `common/` | game → that folder |
| any of the above without an install | the same, minus the game |

The default therefore needs no configuration: editing a mod reads the game files underneath (TGC
replaces every folder the index reads, so nothing changes for it), and editing a submod reads its
base mod underneath. Ticking mods in the settings tab is only for working on several together.

The mod's own folder is the file's **root**: the path relative to it is what
[file classification](file-classification.md) sees, so a submod that ships only `decisions/` is
classified correctly instead of being mistaken for a file of the game (the old `common/` walk landed
on the game root for such a submod).

**Settings tab** — the last row of the Victorian Tools side bar, **Settings**
(`victorian-tools.openSettings`, `providers/settingsPanel.ts`), opens the **Victorian Tools
Settings** editor tab. It has two parts. *Game folder*: the detected install, or a text field and a
**Browse…** button to pick it when detection fails (a folder without `mod/` is reported and the
detected install is kept); stored in the user settings as `victorianTools.gamePath`, never in a
shared workspace. *Mods and submods*: every installed mod with a checkbox, base mods (no
`dependencies`) each followed by the submods that depend on them, directly or through another submod,
then the mods whose dependency is not installed. Any combination can be ticked, two base mods
included, exactly as the launcher allows; the page shows the resulting load order and warns about a
missing dependency. The names are written to `victorianTools.activeMods` in the workspace settings.
The server watches both settings, re-reads the descriptors, sorts the stack (dependencies first, then
by name), logs the load order and any missing dependency, revalidates, and sends
`victorianTools/layoutChanged` so the tab redraws with what the server actually uses. A selected
submod pulls its dependencies into the stack even when they are not ticked.

**Launch Game** — the fourth side bar row, after **Map Report** and **Enforce Colormaps**
([map-images.md](map-images.md)) (`victorian-tools.launchGame`,
`commands/launchGameCommand.ts`) opens a multi-select dialog over the same mods
(`commands/pickMods.ts`, rows from `services/modSelectionItems.ts`), pre-filled with the working
selection, and
starts `v2game.exe` (or `victoria2.exe`) from the game root with one `-mod=mod/X.mod` per picked mod
in load order (`services/gameLaunch.ts`), detached from the editor. The pick is for that launch
only; the working selection is not changed. The old extension did the same through a PowerShell
terminal with `'-mod=…'` quoting that broke under other shells; spawning the process avoids that.

**Full report** — **Generate Full Report** opens the same dialog as Launch Game (checkouts
included) and reports on the ticked mods, one section each, every file validated against one stack
made of the ticked mods and their dependencies over the game. With nothing ticked: the mods set in
Settings, one section per mod of that stack; without those, the mod each workspace folder belongs to.

**Remembered pick** — the four dialogs (full report, map report, Enforce Colormaps, launch) open pre-filled with the
mods set in Settings or, when none are set, with the last pick made in any of them (kept in the
workspace state), so a modder who always reports on and launches the same submod ticks it once.

**Refresh** — a change under any root of an indexed stack rebuilds that stack's index; a changed
`.mod` file re-reads the whole layout. Changes outside the workspace folders (the game folder, a mod
that is not open) are not watched; use **Restart Language Server** after editing those.

## Caveats

- Same-named files in two selected mods: the higher layer wins for the index, but the report still
  validates the shadowed file (it is the lower mod's own file); its index-time duplicate diagnostics
  are attributed by relative path, so they name the winning file's identifiers.
- Case: on Windows two files that differ only in case are one file, as for the game; on Linux they
  are two.
- The game folder is read but never reported on; a vanilla file that is opened gets the game-only
  stack.
