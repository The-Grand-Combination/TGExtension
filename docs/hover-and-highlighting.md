# Hover, go-to-definition, and syntax highlighting

## Hover (`connection.onHover` in server.ts)

For the word under the cursor, the server tries, in order, the first that produces a result:

1. **Symbol hover** (`symbolHover.ts`) — only when the word is in **key position** (immediately
   followed by `=`, `<`, `>`, `<=`, or `>=`). Looks the name up in `TRIGGERS`, then `EFFECTS`, then
   `SCOPE_CHANGERS`, rendering a section for each match (a name can be both a trigger and an effect,
   e.g. `government`, `casus_belli`); if none match, falls back to `KEYWORD_DOCS` (structural
   keywords like `trigger`, `option`, `ai_will_do`, `peace_order`, ...). Each trigger/effect section
   shows its one-line doc, a fenced `victoria2` code block with the rendered usage syntax (e.g.
   `add_core = { country=country | province, ... }` becomes readable placeholder syntax like
   `add_core = TAG | <province id>`), and its valid scopes. A scope-changer section shows what
   scope it produces, from which scopes, and whether it's trigger-only/effect-only/both.
2. **Picture hover** (`pictureHover.ts`, `pictureDecoder.ts`, `pngEncoder.ts`) — only for
   `events`/`decisions` files, on a `picture = <name>` value. Reads the matching `.dds`/`.tga` file
   from `gfx/pictures/{events,decisions}/`, decodes it, downscales/upscales for a readable preview
   (upscaling pixel-doubles images narrower than 280px; downscaling caps at 560px wide), encodes it
   as a PNG data URI, and embeds it in the hover markdown (capped at 96,000 base64 characters — just
   under VS Code's ~100k hover-content truncation limit).
3. **Localisation hover** (`locDefinition.ts`) — for any word or string token whose value matches an
   indexed localisation key, shows the key's English text (or "_(empty text)_") and its source
   `file:line`.

## Go-to-definition (`connection.onDefinition`)

Only localisation keys are currently resolvable: the word/string under the cursor is looked up
against `locKeyDefinitions`, and the editor jumps to that key's line in its `localisation/*.csv`
file.

## Snippets

Both languages also get a set of snippets (`contributes.snippets`); see
[snippets.md](snippets.md). They are expanded by VS Code with no involvement from the language
server, and the result is validated afterwards like any other text.

## Syntax highlighting

Two TextMate grammars, both under `syntaxes/`:

### `victoria2` (`source.victoria2`) — every Paradox script file

Applies to `.gui`, `.gfx`, `.sfx`, `.mod`, and (via `filenamePatterns`, not extension) every
`.txt` under `events/`, `decisions/`, `common/`, `poptypes/`, `technologies/`, `inventions/`,
`news/`, `history/`, `units/`, `map/`, `interface/`, `localisation/`, `battleplans/`, `tutorial/`,
`script/`, plus `map/default.map`. Highlighting is heuristic (regex-based, not AST-driven — a TextMate grammar can't share
the real parser), tokenizing in this priority order: `#` comments, `"quoted strings"`, logical
operators (`and`/`or`/`not`/`limit`), structural fields (`id`, `title`, `trigger`, `option`, ...),
scope-changer names, hard-coded vanilla pop type names, `THIS`/`FROM` implicit scopes, flag values
(lookbehind after `set_country_flag =`, etc.), modifier-name values, ideology/issue values,
culture/religion values, a generic identifier-value class (goods, terrain, buildings, ...),
location-ish values (`owns`, `capital`, `region`, ...), a 3-to-5-digit province-scope key followed
by `= {`, a 3-letter-uppercase country-tag heuristic, `yes`/`no` booleans, numbers, then a generic
`key =` fallback, comparison operators, and braces. `language-configuration.json` gives it `#`
line comments, `{}` bracket matching/auto-closing, and `"` auto-closing/surrounding.

### `victoria2-csv` (`source.victoria2csv`) — localisation and map CSVs

Applies (by `filenamePatterns`) to `localisation/**/*.csv` and `map/**/*.csv`. Tokenizes: `#`
line comments (only at line start), the key column (everything before the first `;`), `§.`
in-game color codes, `$variable$` interpolation, `\n` escapes, a trailing `x`/`X` end-of-row
marker, numeric fields, and `;` separators. `csv-language-configuration.json` gives it `#` line
comments only (CSV has no bracket pairs worth matching).

Both grammars are declarative highlighting only — they do not feed the validator (the validator
always re-tokenizes with the real lexer/parser in `src/parser/`, see
[architecture.md](architecture.md)); a highlighting quirk (e.g. a country-tag-shaped word that
isn't actually a scope key) never causes a false validation diagnostic or vice versa.
