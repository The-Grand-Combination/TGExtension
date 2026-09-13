# Architecture

See `CLAUDE.md` for the authoritative rules (the `vscode` boundary, folder structure, layer
responsibilities). This page describes how a document actually flows through the shipped pipeline.

## Pipeline

```
extension.ts (client)                    server.ts (server)
  starts the language server      ──►      TextDocuments + onDidChangeContent
  declares documentSelector                       │
  syncs configuration                              ▼
  registers the side bar actions    debounced validate(document)
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    ▼                               ▼                               ▼
          parseDocument(text)            modCache.contextFor(path)          validateStructure(...)
        (lexer + parser → AST                 finds the mod root                (events/decisions
         + syntax diagnostics)                (walks up to a folder              structural checks)
                                                containing common/),
                                                classifies the file
                                                by its mod-relative
                                                path, and builds/reuses
                                                the mod's ModIndex
                                                        │
                                                        ▼
                                             validateSemantics(...)
                                          (scope- and mode-aware walker,
                                           dispatches to a per-FileType
                                           validator, then a generic
                                           top-level stray-entry check)
                                                        │
                                                        ▼
                                     toLspDiagnostics(...) → connection.sendDiagnostics
```

All four diagnostic sources (syntax, structure, semantic, index-time duplicates) are concatenated
in `validate()` ([server.ts](../src/server/server.ts)) and published together for one document.

The two CSV file types (`map/definition.csv`, `map/adjacencies.csv`, see `CSV_FILE_TYPES`) take a
shorter path: the script parser and structure checks are skipped, and the raw text goes to
`validateMapCsv` ([mapCsvValidation.ts](../src/services/mapCsvValidation.ts)), which reports
offset-ranged diagnostics like every other service. Index-time duplicates are merged in the same
way.

## Layers

- **Client** (`src/extension.ts`, `src/commands/`, `src/providers/`) — composition root plus thin
  adapters. Declares the `documentSelector` (which file globs activate the `victoria2` /
  `victoria2-csv` language), starts the `LanguageClient`, wires file-system watchers so the server
  rebuilds its index on external changes, registers `victorian-tools.restartServer` and
  `victorian-tools.generateFullReport`, and the "Victorian Tools" activity bar container
  (`images/vicIItools.png`, the "V" icon of the previous extension) with its `Actions` tree view
  (`providers/actionsTreeProvider.ts`: Generate Full Report, Map Report, Enforce Colormaps, Launch
  Game, Map Editor, Settings), the
  **Victorian Tools Settings** tab (`providers/settingsPanel.ts`, a webview panel in two tabs:
  *Extension* over `gamePath`, the ignore marker, the Country Colors tint and `activeMods`, and
  *Regex Patterns* over the four regular-expression settings) and the **Map Editor** tab (`providers/mapEditorPanel.ts`, see
  [map-editor.md](map-editor.md)). No analysis logic.
- **Server** (`src/server/`) — the LSP adapter. `server.ts` owns the `TextDocuments` manager and
  the request handlers; `modCache.ts` caches mod roots and their indexes; `boundedCache.ts` is the
  LRU used for rendered picture hovers; `serverConfig.ts` holds the typed settings accessors;
  `toLspDiagnostic.ts` maps offset ranges to line/character ranges. Imports
  `vscode-languageserver`, never `vscode`. See **Caching and scheduling** below.
- **Services** (`src/services/`) — all validation logic, `vscode`-free:
  - `fileValidation.ts` — the per-file pipeline (`validateFileText`): syntax, structure,
    semantics, then the index-time duplicates for that file. The editor and the full report both
    call this one function.
  - `syntaxValidation.ts` — thin seam over the parser (`parseDocument`).
  - `structureValidation.ts` — file-shape checks that don't need the mod index (event/decision
    required fields, top-level key checks).
  - `semanticValidation.ts` — a dispatcher: builds the `Walk` and routes each `FileType` to its
    validator. `validationWalker.ts` is the scope- and mode-aware trigger/effect walker plus the
    shared checks (`checkArg`, `checkTableField`, `eachAssignment`, `reportUnknownKey`, ...).
  - One validator per grammar: `eventValidation.ts`, `decisionValidation.ts`,
    `cbTypeValidation.ts`, `rebelTypeValidation.ts`, `issuesValidation.ts`,
    `nationalFocusValidation.ts`, `onActionsValidation.ts`, `countryColorsValidation.ts`,
    `modifierFileValidation.ts`, `cultureValidation.ts`, `groupedItemValidation.ts`,
    `governmentValidation.ts`, `buildingValidation.ts`, `traitValidation.ts`,
    `productionTypeValidation.ts`, `bookmarkValidation.ts`, `popChanceValidation.ts`,
    `techFolderValidation.ts`, `countryDefinitionValidation.ts`, `commonOtherValidation.ts`,
    `historyValidation.ts`, `popTypeValidation.ts`, `technologyValidation.ts`,
    `newsValidation.ts`, `mapValidation.ts`, `mapCsvValidation.ts`.
  - `mapImageAudit.ts` + `riverAnalysis.ts` — the map bitmap checks behind **Map Report**, over
    `bmpDecoder.ts` (BMP reader), `bmpPalette.ts` and `data/mapPalettes.ts`;
    `colormapEnforcement.ts` plans the palette rewrite behind **Enforce Colormaps**
    ([map-images.md](map-images.md)).
  - `modIndex.ts` — builds the `ModIndex` (every identifier category, event/decision occurrences,
    localisation keys, set flags, duplicates) by reading and parsing the mod's own files, in short
    steps (`buildModIndexAsync` yields between them). `duplicateDiagnostics.ts` turns the index's
    duplicates into per-file diagnostics.
  - `fullReport.ts` + `reportText.ts` — the whole-mod scan and its plain-text rendering.
  - `symbolHover.ts`, `locDefinition.ts`, `pictureHover.ts`, `pictureDecoder.ts` — hover markdown
    and go-to-definition support (see [hover-and-highlighting.md](hover-and-highlighting.md)).
  - `suggestions.ts` — banded Levenshtein "did you mean" suggestions used throughout diagnostics.
  - `scheduling.ts` — `yieldToEventLoop`, the pause between steps of the long-running services.
- **Parser** (`src/parser/lexer.ts`, `parser.ts`, `csv.ts`) — tokenize then parse Paradox script
  into the typed AST below, with error recovery (an unbalanced brace or stray token doesn't stop
  parsing the rest of the file); `csv.ts` splits the `;`-separated files (map CSVs, localisation)
  into rows and fields with document offsets.
- **Model** (`src/model/`) — shared types: `ast.ts`, `diagnostic.ts`, `range.ts`, `fileType.ts`,
  `symbols.ts` (incl. `FieldTable`), `modIndex.ts` (the `ModIndex` shape), `fullReport.ts`.
- **Data** (`src/data/`) — the curated, hand-maintained dataset: `triggers.ts`, `effects.ts`,
  `scopes.ts`, `modifierKeys.ts`, and one field-table module per domain (`eventStructure.ts`,
  `cbTypeStructure.ts`, `rebelTypeStructure.ts`, `popTypeStructure.ts`, `technologyStructure.ts`,
  `historyStructure.ts`, `commonStructure.ts`, `mapStructure.ts`). This is the layer re-calibrated
  against the TGC corpus on every change (see the root [README.md](README.md)).
- **IO** (`src/io/modFiles.ts`, `src/io/textCodec.ts`) — the only place that touches `node:fs`, and
  the only place bytes become text. `modFiles.ts` finds a lone mod root (walks up from a document
  until a folder containing `common/` is found), checks that files and folders exist, reads and
  writes files, and lists files in a folder by extension. Every text read and write takes a
  `Codepage` from `textCodec.ts`; see [encoding.md](encoding.md) for why it is a setting and not a
  constant. Returns strings; parsing happens elsewhere. Which folders a file is read through is
  decided one layer up, by `services/modLayout.ts` and `services/modLayers.ts` (see
  [mods-and-submods.md](mods-and-submods.md)).

## The AST (`src/model/ast.ts`)

A Victoria 2 script file parses into four node kinds:

- `Scalar` — a leaf value with a `ScalarType` (`string | number | date | boolean | identifier`),
  its raw text, and a range. Both keys and bare list items are scalars.
- `Assignment` — `key = value` (or `<`, `>`, `<=`, `>=` for comparison operators), where `value` is
  a `Scalar` or a `Block`.
- `Block` — a `{ ... }` containing further `Entry` items.
- `Document` — the parsed root of a whole file; also a list of `Entry` items.

`Entry = Assignment | Scalar | Block`: inside any block or the document root, an entry can be a
proper `key = value` pair, a bare scalar (a stray value — always an error where a body expects
assignments), or a bare block (a stray block). This is what lets the walker report `stray-value` /
`stray-block` uniformly everywhere, instead of only in explicitly-anticipated positions.

## Diagnostics

A `Diagnostic` (`src/model/diagnostic.ts`) is `{ range, severity, code, message }` — a plain typed
object, independent of any editor API. `toLspDiagnostic.ts` (server layer) maps this to the LSP
`Diagnostic` shape (line/character `Range` instead of offset `Range`). See
[diagnostics-reference.md](diagnostics-reference.md) for the full code list.

## Full report

The side bar action **Generate Full Report** (`victorian-tools.generateFullReport`,
`commands/generateFullReportCommand.ts`) sends the custom request `victorianTools/fullReport`
([model/fullReport.ts](../src/model/fullReport.ts)) with the workspace folder paths. The server
reports on the selected mod and submods when there is a selection (each mod's own files, validated
against the whole stack's index), otherwise on the mod each workspace folder belongs to, and for
each one runs `buildModReport`
([services/fullReport.ts](../src/services/fullReport.ts)): every file under `events/`, `decisions/`,
`common/`, `poptypes/`, `technologies/`, `inventions/`, `news/`, `history/`, and `map/` that
classifies to a known `FileType` is read **from disk** and pushed through the same pipeline the
editor uses (`validateFileText` in `services/fileValidation.ts`, shared with `validate()`, which
also appends the index-time duplicates for that file). Files are read in parallel batches of 64
(`fs.promises`), and the event loop gets a turn between batches, so hovers and diagnostics keep
answering while a mod is scanned: on TGC the whole report takes about 0.65 s and never blocks the
server for more than ~60 ms, and on GFM, which validates 60 MB of script against 6566 files and
produces 42 000 findings, about 1.8 s after a 1.0 s index build.

The per-file work has to stay linear in the file size. Large mods ship single script files of ten
megabytes (GFM's `events/_DL7_Variables.txt` is 10.8 MB over 240 000 lines), so anything that
re-reads the text once per line costs minutes on its own: the skip-validation marker used to be
found with a backward search per line, which made that one file take over four minutes, and it is
now a single forward pass with a binary search per finding (`dropIgnoredLines`). Offsets become 1-based line/column positions, and `renderReportText`
(`services/reportText.ts`) produces a plain-text document: a header with the generation time, then
per mod root its totals and, per file with findings, one line per finding
(`line:column  severity  code: message`). **Errors lead**: the files that contain one come first
(alphabetical within that group, then the rest), and inside a file the errors come before the
warnings, each severity in source order. The client opens it as an untitled plain-text editor and
shows the error/warning totals. Unsaved editor buffers are not part of the report; the index used is
the cached one for that root.

### Ctrl+click

Both reports are plain text, so the clickable spots are read back out of the rendered text by
`reportLinks` ([services/reportLinks.ts](../src/services/reportLinks.ts)): a mod root is the line a
totals line follows, a file path line is the one every finding under it belongs to. `ReportLinkProvider`
([providers/reportLinkProvider.ts](../src/providers/reportLinkProvider.ts)) turns each into a
`DocumentLink` and is registered for `untitled` plain text, returning nothing unless the first line is
a report header. The link covers the locator — `6:15     error   unknown-trigger` — and leaves the
message as text. A file target is `file:…#L<line>,<column>`, the fragment VS Code reads as a
selection; a map pixel target is a `command:` URI (see the map report below).

## Map report

The side bar action **Map Report** (`victorian-tools.generateMapReport`,
`commands/generateMapReportCommand.ts`) uses the same mod dialog and the same targets as the full
report but sends `victorianTools/mapReport` ([model/mapAudit.ts](../src/model/mapAudit.ts)). For
each target mod that ships a map file of its own, the server reads `provinces.bmp`, `terrain.bmp`,
`rivers.bmp`, `definition.csv` and `terrain.txt` through the mod stack and runs `auditMapImages`
([services/mapImageAudit.ts](../src/services/mapImageAudit.ts)); `renderMapReportText` renders one
section per mod with `map/<file> (x, y)  severity  code: message` lines. Rules and calibration in
[map-images.md](map-images.md). It is separate from the full report so that pixel findings do not
crowd out the file findings.

A finding that names a pixel is a link to `victorian-tools.revealMapPixel`
(`commands/revealMapPixelCommand.ts`), which opens the Map Editor there. The rendered text names mod
roots, not mod names, and the Map Editor needs the names, so the command remembers which mods each
report document was made for in `MapReportTargets`
([services/mapReportTargets.ts](../src/services/mapReportTargets.ts)), dropped when the document
closes. A finding with no pixel gets no link.

## Map editor

The side bar action **Map Editor** (`victorian-tools.openMapEditor`,
`commands/openMapEditorCommand.ts`) uses the same mod dialog and target resolution, then opens a
webview tab (`providers/mapEditorPanel.ts` + `mapEditorHtml.ts`). Five requests
([model/mapEditor.ts](../src/model/mapEditor.ts), handled by
[server/mapEditorHandlers.ts](../src/server/mapEditorHandlers.ts)) carry the map description, the
`map/positions.txt` points drawn over it, the start-date owners and country colours behind the
Country Colors layer, one province's localisation/history/pops/positions, and one section's save;
the page fetches and decodes `provinces.bmp` (and, for the Show Rivers layer, `rivers.bmp`) itself
and tints it by owner in the browser. Saves are text patches
computed by `vscode`-free services (`provinceLocEdit.ts`, `provinceHistoryEdit.ts`,
`provincePopsEdit.ts`, `provincePositionsEdit.ts` over `textPatch.ts`) and
written only into the top mod of the stack. Behaviour and rules in [map-editor.md](map-editor.md).

## Mod root discovery and file classification

A file inside a Victoria 2 install belongs to the mod whose `path` folder contains it, and is read
through that mod's stack (game files, dependencies, and the selected submods; `locateFile` in
`services/modLayout.ts`, see [mods-and-submods.md](mods-and-submods.md)). Outside any install,
`findModRoot` walks up from the document's directory until it finds one containing a `common/`
subfolder and the mod is read alone. Either way the mod's own folder is the root used for
relative-path classification (the result is cached per directory, see **Caching and scheduling**).
`classifyFile` ([file-classification.md](file-classification.md)) then classifies the document by
its path **relative to that root**, not by its absolute path — a Steam install path
(`.../steamapps/common/Victoria 2/mod/TGC/...`) contains an unrelated `common/` segment that would
otherwise misclassify every file as `commonOther`.

## Caching and scheduling

Everything the server keeps between requests lives in `src/server/`, and every cache has an
invalidation path.

**File locations and indexes** (`modCache.ts`). Locating a file (which mod, which layers) costs a
few path comparisons or, outside an install, a `statSync` per directory level, so the result is
cached **per directory**, not per document: every file in a folder shares one lookup, and "no mod
here" is cached too; the map is dropped when the layout changes (settings, a `.mod` file). Indexes
are keyed by the **layers** they were built from, so the selected mod and its submods share one
index. They are built **in the background**: the first document of a stack (or `indexOnStartup`,
default on, right after `initialized`) starts a build with
`buildModIndexAsync`, which yields to the event loop between its steps (one folder or file group
each), so the server keeps answering; on TGC the build takes about 0.23 s and never blocks for more
than ~100 ms. Until the first index lands, documents get syntax and structure diagnostics only;
`onIndexBuilt` then publishes that mod's index-time duplicates and revalidates its open documents.
Concurrent requests for the same root share one build; a failed build is logged (`onBuildFailed`)
and leaves no index behind.

**Index refresh.** `onDidChangeWatchedFiles` collects the changed paths and, after
`index.rebuildDelay` of quiet, refreshes **only the stacks with a root those paths belong to**
(`layersContaining`); other mods keep their index. A changed `.mod` descriptor re-reads the layout
instead. A refresh keeps serving the previous index until
the new one is ready, so open documents never lose their semantic diagnostics in between, and a
change that arrives while a build is running makes the build run once more (a generation counter
per root), so no edit is missed. A change that belongs to no indexed mod rebuilds nothing, and only
revalidates the open documents that had no mod root, since one may have just appeared. The
directory→root map is always dropped, because a change under `common/` can create or remove a root
and make a cached lookup (including a cached miss) wrong.

**Document validation.** `onDidChangeContent` schedules a per-document timer instead of validating
inline; the timer is reset on each edit and cancelled on close, so a burst of typing parses the file
once. This matters on the large files a Victoria 2 mod ships: a full validation pass of TGC's
biggest event file (410 KB) takes about 11 ms (4 ms of it parsing), which used to run on every
keystroke. Set `validation.delay` to `0` to validate inline.

**Diagnostics ownership.** Two publishers write to the same URIs: `validate()` for open documents,
and `publishIndexDuplicates` for files that are not open. They do not fight — the index publisher
skips URIs that are open (`validateFileText` already appends those duplicates to the open document's
own publish),
and it tracks what it published **per root**, so indexing one mod never clears another's
diagnostics. Closing a document keeps its index-time duplicates: they were found across the whole
mod, not by having the file open.

**Picture hovers.** Decoded `.dds`/`.tga` previews are cached by absolute path in a bounded LRU
(200 entries), including the "no such picture" result. Entries are dropped when the watcher reports
that file changed, so replacing an image no longer shows the old one until a restart.

**Shutdown** clears every timer and cache, so a restart of the server leaves nothing behind.

## Configuration

Settings are declared under `contributes.configuration` in `package.json` and read in the server
through `serverConfig.ts`, which pulls the whole `victorianTools` section with
`connection.workspace.getConfiguration` and narrows it defensively: the value arrives as `unknown`,
every field falls back to the manifest default, and the two delays are clamped, so a hand-edited
`settings.json` cannot make the server spin or hang. `configChange` sorts what came back into the
work it implies: `none` skips the revalidation pass entirely, `other` revalidates the open documents,
`layout` re-reads the install and the mod selection, and `recoded` — a changed code page — also
rebuilds the indexes, which hold decoded text that no layer key describes. An integration test
asserts the manifest defaults and `DEFAULT_CONFIG` agree.

| Setting | Default | Effect |
|---|---|---|
| `victorianTools.validation.enable` | `true` | Off publishes an empty diagnostic list for every document. |
| `victorianTools.validation.delay` | `300` | Idle milliseconds before a changed document is revalidated; `0` validates inline. |
| `victorianTools.index.rebuildDelay` | `500` | Idle milliseconds before rebuilding the index of mods whose files changed on disk. |
| `victorianTools.index.onStartup` | `true` | Index every workspace mod at startup instead of on first use. |
| `victorianTools.localisation.keyPattern` | `^EVT` | Regex picking which `title`/`desc`/`name` values are localisation keys; a value that does not match is literal display text and is never reported missing. Empty checks every value; an invalid regex is ignored the same way. Editable from the **Victorian Tools Settings** tab, which compiles what is typed and says so before it is saved. |
| `victorianTools.flags.namePattern` | `` (empty) | Regex narrowing the never-set flag check; a flag whose name does not match is never reported. Empty checks every flag. Editable from the **Victorian Tools Settings** tab. |
| `victorianTools.ignoreMarker` | `#VT - Skip Validation` | A marker that silences every finding on the line it appears on. Write it as a comment so the game ignores it. Matched literally, anywhere in the line, case-insensitively. Empty turns it off. Editable from the **Victorian Tools Settings** tab. |
| `victorianTools.nullTags.pattern` | `^(QQQ\|---\|null)$` | Regex matching the tags meaning "no country". A country value that matches warns instead of erroring; matched case-insensitively. Empty allows no exception. Editable from the **Victorian Tools Settings** tab. |
| `victorianTools.nullTags.suppressWarnings` | `true` | Report nothing at all for a tag `nullTags.pattern` matches: `null-country-tag`, `null-tag-exploit` and the `uncolonize-province` of `secede_province = QQQ` all go quiet, because a script that writes a null tag wrote it on purpose. A tag the pattern misses is untouched, and an empty pattern makes this setting a no-op. Editable from the **Regex Patterns** tab (a checkbox). |
| `victorianTools.mapEditor.countryColorsTint` | `82` | Percent of the owner's colour in the Map Editor's **Country Colors** layer; the rest is the province's own colour. Client-side only. Editable from the **Victorian Tools Settings** tab (a slider). |
| `victorianTools.mapEditor.provinceFolderPattern` | `` (empty) | Regex narrowing which subfolders of `history/provinces` the Map Editor reads, matched against the subfolder alone, case-insensitively. Empty uses every folder. It exists for a total conversion that declares the whole vanilla province set as empty placeholders; see [map-editor.md](map-editor.md). A change re-reads the mod stack, so the cached province owners go with it. Editable from the **Regex Patterns** tab of the **Victorian Tools Settings** page. |
| `victorianTools.trace.server` | `off` | `vscode-languageclient` trace verbosity (client-side).
