# Text encoding

Victoria 2 does not read UTF-8. Script and localisation are stored **one byte per character**, in a
single-byte code page chosen by the language the game was built for. The same byte is a different
letter in each — `0xCF` is `Ï` in windows-1252 and `П` in windows-1251 — so a mod has exactly one
code page, and no file can mix them.

`victorianTools.encoding` is that choice:

| value | the builds that use it |
|---|---|
| `windows-1252` (default) | English, French, German, Spanish, Italian |
| `windows-1251` | Russian |

Changing it re-reads every file: the mod index holds text that is already decoded, so the setting is
treated as a layout change (`layoutConfigEquals` in `server/serverConfig.ts`) and goes through the
same `applyLayout` path as picking a different mod.

## Where it applies

`src/io/textCodec.ts` is the only place bytes become text or text becomes bytes, and
`src/io/modFiles.ts` is its only production caller. Every text read and write takes the code page
explicitly; `server.ts` binds it late (`readText`, `readTextAsync`, `writeText`) so a change takes
effect without a restart.

**Why the code page cannot corrupt a file.** The WHATWG decoders for both pages map all 256 bytes to
256 *distinct* code points — windows-1252 included, because the WHATWG table fills the five slots
(`0x81`, `0x8D`, `0x8F`, `0x90`, `0x9D`) the original code page leaves undefined. They are therefore
bijections, so `encodeText(decodeText(bytes))` returns the original bytes and editing one line of a
`.csv` cannot disturb any other. The whole TGC corpus (5445 `.txt`/`.csv` files, 60977 bytes above
`0x7F`) round-trips byte for byte.

**A character the code page cannot hold is refused, never mangled.** `writeModFileText` encodes
first and returns `false` without writing when a character has no byte, so a refused save leaves the
file exactly as it was. The Map Editor asks `unrepresentableIn` before writing a province name, so
the page shows *which* character is the problem instead of "could not be written".

## The editor tab is a separate decode

The extension reads mod files off disk itself. A file you open in an **editor tab** is decoded by VS
Code, with its own `files.encoding` — which defaults to UTF-8 and knows nothing about
`victorianTools.encoding`. When the two disagree, index-time findings (cross-file duplicates) land on
the wrong character in any file with bytes above `0x7F`, and Ctrl+S writes bytes the game cannot
read.

The extension therefore ships a default for its own two languages:

```jsonc
"[victoria2]":     { "files.encoding": "windows1252" },
"[victoria2-csv]": { "files.encoding": "windows1252" }
```

It is a *default*, so for a Cyrillic mod put the matching override in the workspace settings
alongside `victorianTools.encoding`:

```jsonc
"victorianTools.encoding": "windows-1251",
"[victoria2]":     { "files.encoding": "windows1251" },
"[victoria2-csv]": { "files.encoding": "windows1251" }
```

Note the spelling: VS Code writes these ids without the hyphen.

## A Cyrillic name as a file name

The Map Editor's **rename history file** checkbox turns the province name into a file name
(`history/provinces/<id> - <Name>.txt`). Windows stores that name as UTF-16, but the Victoria 2
engine lists the directory through ANSI APIs, so a Cyrillic file name only resolves when the system
locale is Russian. That is the game's limitation, not the extension's, but it is worth knowing before
ticking the box.
