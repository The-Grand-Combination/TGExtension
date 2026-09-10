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

<img width="724" height="172" alt="image" src="https://github.com/user-attachments/assets/9fda800d-e304-4796-98b2-7016cd482ae4" />

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
<img width="1428" height="99" alt="image" src="https://github.com/user-attachments/assets/c4e4134f-5015-4721-9a12-ce57058b75f4" />
<img width="801" height="169" alt="image" src="https://github.com/user-attachments/assets/aeac4a64-8cf7-4767-a016-a807b5f29d78" />

- Hover a trigger, effect or scope changer to see what it does, its usage
  syntax and the scopes it is valid in.
- Hover a `picture = ...` value to see the image itself. DDS and TGA files are
  decoded in place.
- Hover a localisation key to read its English text and where it is defined.
- Ctrl+Click a localisation key to jump to its line in the CSV.


## Documentation and source

The full reference, including every diagnostic code, every recognized trigger
and effect with its valid scopes, and the map rules, lives in the
[docs](https://github.com/The-Grand-Combination/TGExtension/tree/master/docs)
folder of the repository. Issues and contributions:
[The-Grand-Combination/TGExtension](https://github.com/The-Grand-Combination/TGExtension).

Victorian Tools is built by
[The Grand Combination](https://github.com/The-Grand-Combination) modding team
and released under the MIT license.
