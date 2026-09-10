# Victorian Tools

**A language server for Victoria 2 modding.** Victorian Tools reads your mod the
way the game does and tells you what is wrong before you launch it: unknown
triggers and effects, wrong scopes, misspelled TAGs and cultures, duplicated
event ids, missing localisation, broken map bitmaps. Syntax highlighting and
snippets are included for every Paradox script file and localisation CSV.

Version 4 is a complete rewrite of the original Victorian Tools extension. The
highlighting and snippets you know are still here; everything else is new.

---

## Inline validation, as you type

Open any file under `events/`, `decisions/`, `common/`, `poptypes/`,
`technologies/`, `inventions/`, `news/`, `history/` or `map/` and problems
appear in the editor and in the Problems panel.

- **Syntax**: unbalanced braces, unterminated strings, stray tokens. Error
  recovery keeps going after the first mistake, so one typo does not hide the
  rest of the file.
- **Structure**: an event without an `id`, a decision without `potential` or
  `effect`, a country history file with a field the game ignores.
- **Triggers and effects**: every recognized trigger and effect is checked for
  its argument shape and for the scope it is used in (country, province, state,
  pop). Unknown names get a "did you mean" suggestion.
- **References**: TAGs, cultures, religions, goods, ideologies, issues and
  reforms, modifiers, pop types, provinces, regions, technologies, inventions,
  buildings, units, flags and event ids are all checked against what your mod
  actually defines. The index is built from the mod itself and rebuilds when
  files change on disk.
- **Cross-file checks**: firing an event id nobody defines, defining the same
  event id twice, duplicated decisions, TAGs, cultures or modifiers. These are
  reported even in files you do not have open.
- **Localisation and pictures**: missing `title`, `desc` and option keys,
  decision keys that are not in any CSV, event or decision pictures that do not
  exist on disk.

Every rule is calibrated against a full mod corpus and against a Victoria 2
engine reimplementation, with a target of zero false positives. If the game
accepts it, the extension does too.

## Hover and navigation

- Hover a trigger, effect or scope changer to see what it does, its usage
  syntax and the scopes it is valid in.
- Hover a `picture = ...` value to see the image itself. DDS and TGA files are
  decoded in place.
- Hover a localisation key to read its English text and where it is defined.
- Ctrl+Click a localisation key to jump to its line in the CSV.

## Mods, submods and the game files

Victoria 2 loads a mod on top of the game files and on top of the mods it
depends on. Victorian Tools reproduces that stack from the `.mod` descriptors
(`path`, `replace_path`, `dependencies`), so a submod is validated against the
identifiers of the mod it extends, and a mod that keeps part of the vanilla
files is validated against those too.

Pick the mods you are working on from the **Settings** tab in the side bar. Any
combination the launcher allows is accepted, and the tab shows the resulting
load order.

## The side bar

The Victorian Tools icon in the Activity Bar opens the **Actions** view:

| Action | What it does |
| --- | --- |
| **Generate Full Report** | Validates every file of the picked mods on disk and opens a plain-text report, one line per finding, grouped by file. |
| **Generate Map Report** | Cross-checks `provinces.bmp`, `terrain.bmp`, `rivers.bmp`, `definition.csv` and `terrain.txt`: colors with no province, provinces with no pixels, unmapped terrain indices, land painted as sea, detached or sourceless rivers, wrong dimensions, non-standard palettes. The game repairs all of these silently; this is the only place they show. |
| **Enforce Colormaps** | Rewrites the palettes of `terrain.bmp` and `rivers.bmp` to the standard ones. Pixels and headers stay byte for byte. |
| **Launch Game** | Starts Victoria 2 with `-mod=` arguments for the picked mods, in load order. |
| **Settings** | Game folder detection or selection, and the mod and submod selection. |

The dialogs remember your last pick, so a modder who always works on the same
submod ticks it once.

## Highlighting and snippets

- **Victoria 2 Script**: a TextMate grammar over standard scopes, so it works
  with any color theme. Covers `.gui`, `.gfx`, `.sfx`, `.mod` and every `.txt`
  under the game's script folders.
- **Victoria 2 CSV**: highlighting for `localisation/*.csv` and `map/*.csv`.
- **Snippets**: 49 script snippets (events, decisions, scopes, effects, common
  idioms) and 20 localisation snippets, carried over from Victorian Tools 3.

## Getting started

1. Install the extension.
2. Open your mod folder in VS Code. The extension activates when it finds a
   `.mod` file or a `common/cultures.txt`.
3. If the game folder is not detected automatically, set it in **Victorian
   Tools > Settings** in the side bar.
4. Tick the mod and submods you are working on. Open a file and start typing.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `victorianTools.validation.enable` | `true` | Enable inline validation. |
| `victorianTools.validation.delay` | `300` | Milliseconds of typing pause before a file is revalidated. |
| `victorianTools.index.onStartup` | `true` | Index every mod in the workspace on startup so mod-wide errors appear without opening a file. |
| `victorianTools.index.rebuildDelay` | `500` | Milliseconds to wait after files change on disk before rebuilding the index. |
| `victorianTools.gamePath` | `""` | The Victoria 2 install folder. Empty means detect it above the workspace. |
| `victorianTools.activeMods` | `[]` | Names of the mods and submods being worked on. |
| `victorianTools.trace.server` | `"off"` | Trace the client-server communication for troubleshooting. |

## Commands

All commands are under the **Victorian Tools** category in the Command Palette:
Generate Full Report, Generate Map Report, Enforce Colormaps, Launch Game,
Open Settings and Restart Language Server. Use Restart Language Server after
editing files outside the workspace, such as the game folder.

## What is not validated

Interface files (`.gui`, `.gfx`, `.sfx`) are highlighted only. Unit definitions
under `units/`, `settings.txt`, `.mod` descriptor syntax and Lua files are read
but not validated. Localisation CSVs are checked for key lookup only.

## Documentation and source

The full reference, including every diagnostic code, every recognized trigger
and effect with its valid scopes, and the map rules, lives in the
[docs](https://github.com/The-Grand-Combination/TGExtension/tree/master/docs)
folder of the repository. Issues and contributions:
[The-Grand-Combination/TGExtension](https://github.com/The-Grand-Combination/TGExtension).

Victorian Tools is built by and for the
[The Grand Combination](https://github.com/The-Grand-Combination) modding team
and released under the MIT license.
