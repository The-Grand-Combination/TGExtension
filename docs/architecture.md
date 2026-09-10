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
  Game, Settings) and the
  **Victorian Tools Settings** tab (`providers/settingsPanel.ts`, a webview panel over plain
  settings). No analysis logic.
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
- **IO** (`src/io/modFiles.ts`) — the only place that touches `node:fs`. Finds a lone mod root
  (walks up from a document until a folder containing `common/` is found), checks that files and
  folders exist, reads files as `latin1` (Victoria 2 script is windows-1252 but its identifiers are
  ASCII, so latin1 decoding is sufficient), and lists files in a folder by extension. Returns
  strings; parsing happens elsewhere. Which folders a file is read through is decided one layer up,
  by `services/modLayout.ts` and `services/modLayers.ts` (see
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
server for more than ~60 ms. Offsets become 1-based line/column positions, and `renderReportText`
(`services/reportText.ts`) produces a plain-text document: a header with the generation time, then
per mod root its totals and, per file with findings, one line per finding
(`line:column  severity  code: message`). The client opens it as an untitled plain-text editor and
shows the error/warning totals. Unsaved editor buffers are not part of the report; the index used is
the cached one for that root.

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
`settings.json` cannot make the server spin or hang. `configEquals` skips the revalidation pass when
a configuration change did not actually touch these values. An integration test asserts the manifest
defaults and `DEFAULT_CONFIG` agree.

| Setting | Default | Effect |
|---|---|---|
| `victorianTools.validation.enable` | `true` | Off publishes an empty diagnostic list for every document. |
| `victorianTools.validation.delay` | `300` | Idle milliseconds before a changed document is revalidated; `0` validates inline. |
| `victorianTools.index.rebuildDelay` | `500` | Idle milliseconds before rebuilding the index of mods whose files changed on disk. |
| `victorianTools.index.onStartup` | `true` | Index every workspace mod at startup instead of on first use. |
| `victorianTools.trace.server` | `off` | `vscode-languageclient` trace verbosity (client-side).
