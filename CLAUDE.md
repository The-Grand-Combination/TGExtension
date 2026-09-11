# AGENTS.md — Architecture and build guide

Guide for building and maintaining this VS Code extension. It applies to humans and AI agents alike.

In communication, documentation, and comments: be concise and direct. No redundancy, analogies, or jargon. Short sentences, one instruction per sentence, active voice.

Code in this repo must be clean, direct, and readable, with as few comments as possible. Prefer self-documenting code: good names over narration. Reserve TSDoc for exported/public API and for logic whose intent is not obvious from the code. Never comment on what obvious code does. Keep functions small and cyclomatic complexity low; do not reach for clever code or hacks that hurt readability.

> Target domain: a Visual Studio Code extension written in **strict TypeScript**. It is the editor-side companion to `vic2-mcp` (an MCP server that serves Victoria 2 modding reference docs). The extension provides tooling for Victoria 2 mod files (Paradox script and localization). The concrete feature scope is still being defined — treat the commands/providers below as the shape features take, not a fixed list.

---

## 1. Stack

TypeScript 6.x (strict) · VS Code Extension API (`@types/vscode` `^1.96`) · esbuild (bundle) · ESLint 10 with `typescript-eslint` (`strict-type-checked` + `stylistic-type-checked`) · `@vscode/test-cli` + `@vscode/test-electron` + Mocha (integration tests) · Node 22 · `npm-run-all` for parallel watchers.

Module system: `Node16` / target `ES2022`. Bundle entry `src/extension.ts` → `dist/extension.js`, `format: cjs`, `platform: node`, with `vscode` marked `external`.

---

## 2. Architecture — the `vscode` boundary is the core rule

The single most important architectural constraint: **isolate the platform API in a thin adapter layer and keep domain logic `vscode`-free AND `vscode-languageserver`-free.** Domain code that imports neither is unit-testable without any host; adapter code is not.

This project is a **Language Server Protocol (LSP) extension**: a thin VS Code **client** (`src/extension.ts`) launches a separate Node **server** process (`src/server/server.ts`) that does all the analysis. The pure core (parser, model, services) is shared by the server and imports no platform API.

```
extension.ts (client)  ──JSON-RPC──►  server.ts (server)   ──►  Services (domain)  ──►  Parser / Model
vscode-languageclient                  vscode-languageserver     (pure logic,            (tokenize/parse
starts server,                         onDidChangeContent →       no platform import)      → typed AST,
routes documents,                      parse → validate →                                  typed diagnostics)
syncs config                           publishDiagnostics
```

- **Client** (`src/extension.ts`): the composition root. Starts the `LanguageClient`, declares the `documentSelector`, syncs configuration, registers commands, and pushes every disposable into `context.subscriptions`. Imports `vscode`. **No analysis logic here.**
- **Server** (`src/server/`): the LSP adapter. `server.ts` owns the connection and `TextDocuments`, reacts to document/config events, and calls the services. `toLspDiagnostic.ts` maps domain diagnostics (offset ranges) to LSP diagnostics (line/character ranges). Imports `vscode-languageserver`, **never `vscode`**. Keep it thin.
- **Services** (`src/services/`): the business logic (syntax + structure validation). Pure functions over typed inputs. **Import neither `vscode` nor `vscode-languageserver`.**
- **Parser / Model** (`src/parser/`, `src/model/`): tokenize/parse Paradox script into a typed AST (`model/ast.ts`), with error recovery; typed diagnostics (`model/diagnostic.ts`) and source ranges (`model/range.ts`). Platform-free. IO (`src/io/`) wraps file access when needed, and stays platform-free where possible (take/return strings).

The client is interchangeable: because the core is platform-free, the same server can back another editor. The `vscode`-free rule is what makes that — and unit testing — possible.

### Flow rules

- Data flows down (adapter → service → parser); results flow back up. Lower layers never import from higher ones.
- A command handler never reaches into another command handler. To combine behavior, both delegate to services; the handler orchestrates the services.
- Providers and command handlers never talk to each other directly. Shared behavior lives in a service.
- Between layers, pass **typed models** (`interface` / `type` / class), **never untyped objects** (`Record<string, unknown>` / `any` as a data carrier).
- **A new feature = its own command/provider (adapter) + its own service.** Do not overload one service across unrelated features.

---

## 3. Folder structure

```
package.json                     # extension manifest (contributes, activationEvents, engines, scripts)
tsconfig.json                    # strict TypeScript config (see §11)
esbuild.js                       # bundler config (entry, external vscode, minify/sourcemap)
eslint.config.mjs                # strict-type-checked + stylistic-type-checked ruleset
.vscode-test.mjs                 # test runner config (@vscode/test-cli)
.vscodeignore                    # what to exclude from the packaged .vsix
.vscode/                         # launch.json (F5 debug), tasks.json (watch), settings, extensions
language-configuration.json      # comments/brackets for the `victoria2` language
src/
├── extension.ts                 # LSP client — composition root, starts the server, no logic
├── server/                      # LSP server (adapter): server.ts + toLspDiagnostic.ts (import vscode-languageserver, never vscode)
├── services/                    # domain logic — platform-free (syntax/structure/semantic validation, modIndex, modLayout/modLayers, suggestions)
├── parser/                      # Paradox script parsing (lexer.ts, parser.ts) → typed AST, with error recovery; csv.ts; modDescriptor.ts (.mod files)
├── data/                        # curated language dataset: triggers.ts, effects.ts, scopes.ts, modifierKeys.ts, *Structure.ts field tables per domain, mapPalettes.ts (standard terrain/rivers BMP palettes)
├── model/                       # domain types: ast.ts, astQuery.ts, diagnostic.ts, range.ts, fileType.ts, symbols.ts
├── io/                          # file access wrappers (modFiles.ts — node:fs only, no vscode)
├── config.ts                    # typed accessors over workspace configuration (mod selection; see §8)
├── log.ts                       # OutputChannel logger (see §9; add when needed)
└── test/
    ├── *.test.ts                # integration suites (run in the Extension Development Host)
    └── unit/*.test.ts           # unit suites (plain Mocha, no host) — the bulk of coverage
```

Two esbuild entry points bundle to `dist/extension.js` (client) and `dist/server.js` (server). Create folders as features arrive — do not scaffold empty layers. Grow from there following §2.

The `src/data/` dataset encodes engine behavior the wiki does not document (scope fallbacks, dynamic keys, special values). Any change to `data/` or the semantic walker must be re-calibrated against the full TGC corpus (parse + validate every `events/` and `decisions/` file) with a goal of zero false positives; new findings are either dataset gaps to fix or genuine mod bugs to report.

---

## 4. Rules per layer

### Entry point (`extension.ts`)

- `activate(context: vscode.ExtensionContext): void` builds dependencies and registers contributions. Every returned `vscode.Disposable` (commands, providers, listeners, `DiagnosticCollection`, `OutputChannel`) goes into `context.subscriptions` so VS Code disposes it on deactivation.
- `deactivate` only handles resources **not** owned by `context.subscriptions`. If everything is a subscription, it is a no-op.
- Do not do heavy work at activation time. Register lazily; let activation events drive loading. Keep `activate` fast.

### Commands (`src/commands/`)

- A command has two halves that must stay in sync: the **declaration** in `package.json` (`contributes.commands`, with `command`, `title`, `category`) and the **registration** in code (`vscode.commands.registerCommand(id, handler)`). Register a command that is not declared, or declare one you never register, and the extension is broken.
- The handler is an adapter: read arguments / active editor / selection, call a service, present the result (message, edit, view refresh). No business logic in the handler.
- Command IDs are namespaced by the extension: `victorian-tools.<verb><Noun>` (for example `victorian-tools.validateMod`).

### Providers (`src/providers/`)

- Providers are adapters too. A `CompletionItemProvider` / `HoverProvider` / `DefinitionProvider` extracts the needed text from the `TextDocument`, calls a service, and maps the typed result back to `CompletionItem[]` / `Hover` / `Location`.
- Register with the correct `DocumentSelector` (language id or file glob). Prefer a declared language id over raw path globs.
- Respect the `CancellationToken`: on long work, check `token.isCancellationRequested` and bail.
- Diagnostics: own a single `DiagnosticCollection`, recompute on document change/open, and clear entries on close. Push the collection into `context.subscriptions`.

### Services (`src/services/`)

- All decisions, calculations, validations, and transformations live here. Private helpers are `private` (class) or module-local (not exported).
- Stay `vscode`-free. A service takes plain inputs (strings, typed models) and returns typed models. This is what makes it unit-testable without the Extension Host.

### Parser / Model / IO

- **Parser**: turn file text into a typed model. Never return untyped objects. Parse errors are typed results (a diagnostics list), not thrown strings, when the caller reports them per-location.
- **Model** (`src/model/`): the shared domain types. One source of truth; adapters and services both depend on it.
- **IO**: wrap `vscode.workspace.fs` / URI resolution here so services can stay pure. IO returns strings/buffers; parsing and logic happen elsewhere.

---

## 5. Disposables and lifecycle

The disposable lifecycle is this project's unit of resource safety — the analog of a transaction boundary.

- Anything you register with the VS Code API returns a `Disposable`. **Push it into `context.subscriptions`** at registration time, in the same statement where possible. If you own a resource whose lifetime is shorter than the extension (a per-document listener), track and dispose it yourself.
- `OutputChannel`, `DiagnosticCollection`, `StatusBarItem`, `FileSystemWatcher`, event subscriptions (`onDidChangeTextDocument`, …) are all disposables. Leaking them leaks memory and duplicates handlers on reload.
- Never register the same command/provider twice. During development the Extension Development Host reloads the module; correct subscription handling makes reloads clean.

---

## 6. Async and background work

- Extension code runs on the extension host event loop. **Never block it.** Use `async`/`await` and return `Thenable` / `Promise`.
- For fire-and-forget calls to a `Thenable` (for example `window.showInformationMessage`) whose result you ignore, prefix with the `void` operator so `no-floating-promises` stays satisfied: `void vscode.window.showInformationMessage(...)`.
- Long operations use `vscode.window.withProgress` and honor cancellation. Do not spin the UI with synchronous loops over large files — chunk or defer.
- No `setTimeout`-based polling for state VS Code already exposes as an event. Subscribe to the event instead.

---

## 7. Contribution points and the manifest (`package.json`)

The manifest is the declarative contract; code implements it. Keep them in lockstep.

- **`contributes`** declares commands, menus, keybindings, `configuration`, `languages`, `grammars`, `views`, `viewsContainers`, `snippets`, `taskDefinitions`, `problemMatchers`, `customEditors`, `walkthroughs`. Each declaration must have a matching implementation (a command registered, a provider attached to the declared language, …).
- **`activationEvents`**: since VS Code 1.74 a contributed command activates the extension automatically — do not add a redundant `onCommand:` entry. Add explicit events (`onLanguage:<id>`, `workspaceContains:<glob>`, `onView:<id>`) only when actually needed. Prefer the narrowest activation that works; broad activation slows every workspace.
- **Menus** place a command in a UI surface; visibility is governed by `when` clauses, command availability by `enablement`. Use context keys, not code, to hide commands that do not apply.
- **`engines.vscode`** (`^1.96.0`) is the minimum API version. Do not call API newer than that without raising it. `@types/vscode` must match.
- `main` points at the bundle (`./dist/extension.js`), never at `src` or `out`.

---

## 8. Configuration / settings (`src/config.ts`)

- User-facing settings are declared under `contributes.configuration` in `package.json` (typed, with defaults and descriptions) and read via `vscode.workspace.getConfiguration('victorianTools')`.
- Wrap reads in typed accessors in `src/config.ts` — never scatter raw `getConfiguration(...).get<...>()` calls through the codebase, and never trust the value's type blindly (validate/narrow). Provide a real default in code that matches the manifest default.
- React to changes with `workspace.onDidChangeConfiguration` (dispose the listener via subscriptions). Do not cache settings without invalidating on change.

---

## 9. Errors and user feedback (`src/log.ts`)

- Surface user-facing failures with `window.showErrorMessage` / `showWarningMessage`; keep the message actionable and free of stack traces or internal paths.
- Log diagnostics to a dedicated `OutputChannel` (created once, in `activate`, pushed to subscriptions). **No `console.log` for shipped behavior** — after bundling/minification it is not a reliable channel; use the OutputChannel.
- In `catch`, the error is `unknown` (`useUnknownInCatchVariables`). Narrow it before use; do not assume `.message`.
- Do not swallow errors silently. Either handle (recover + inform) or rethrow. A validation/parse failure the user should see becomes a diagnostic, not a thrown error.

---

## 10. Testing (`src/test/`, `.vscode-test.mjs`)

- Two tiers:
  - **Integration** — Mocha suites that run inside the Extension Development Host via `@vscode/test-cli` (`npm test`). They have full access to the `vscode` module: assert that commands are registered, that a provider returns expected items, that diagnostics appear. Compiled to `out/` by `compile-tests`, discovered by `.vscode-test.mjs` (`files: 'out/test/**/*.test.js'`).
  - **Unit** — plain Mocha over the `vscode`-free layers (services, parser). These need no Extension Host; they are fast and cover the bulk of logic. This is the payoff of keeping the domain `vscode`-free (§2).
- Write logic so it is testable without the Extension Host. If a test needs the full editor to exercise pure logic, the logic is in the wrong layer.
- Tests use `suite()` / `test()` (Mocha TDD UI) and `assert`. Keep fixtures small and deterministic.

---

## 11. Type-safety policy — non-negotiable

This project runs strict TypeScript with **every** additional check on. Keep it that way.

- `tsconfig.json`: `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables`. `noEmit` for type-checking (esbuild does the emit and strips types **without** checking them — so type-checking is a separate, required gate).
- ESLint: `strict-type-checked` + `stylistic-type-checked`. `@typescript-eslint/no-explicit-any` is an **error**; `explicit-function-return-type` is an **error** (annotate every function's return type); `eqeqeq` error.
- No `any`. No non-null `!` to silence the compiler — narrow properly. `as` casts only where genuinely unavoidable, with a comment saying why.
- Model domain data as `interface`/`type`. `readonly` and `as const` where data is immutable. Discriminated unions for parse results and command outcomes.

---

## 12. Conventions

- Type hints on everything, including every function return type (lint-enforced). Full-word names (`for (const localizationEntry of entries)`), no cryptic abbreviations.
- English throughout — code, comments, docs, and UI strings. Domain terms from Victoria 2 modding keep their canonical spelling (`province`, `decision`, `effect`, `trigger`).
- Prefer `const`; `let` only when reassigned. No `var`. Prefer pure functions and immutable data.
- One command/provider/service per file, named for what it does (`validateModCommand.ts`, `effectCompletionProvider.ts`, `localizationParser.ts`).
- Do not narrate obvious code. TSDoc only on exported API and non-obvious logic (as the scaffold does for `activate`/`deactivate`).

Commands: `npm run watch` (esbuild + tsc watchers, or press F5) · `npm run compile` (check-types + lint + bundle) · `npm run check-types` · `npm run lint` · `npm run package` (production bundle) · `npm test`.

---

## 13. Versioning, packaging, and publishing

- SemVer in `package.json` `version`: breaking contribution/command change → major; compatible feature → minor; fix → patch. **Bump in the same change that ships the behavior**, and note it in `CHANGELOG.md` (Keep a Changelog).
- `vscode:prepublish` runs `npm run package` (production, minified bundle). `.vscodeignore` keeps `src/`, `out/`, `node_modules/`, configs, and source maps out of the `.vsix` — only `dist/` ships.
- Package with `vsce package` (`@vscode/vsce`) to produce a `.vsix`; publisher is `TGCModdingTeam`. Do not commit `.vsix` (it is gitignored). Test-install the `.vsix` locally before distributing.
- For a public listing later: add `icon` (128×128 PNG, no SVG), `README.md`, `LICENSE`, and `repository`. Prefer Entra ID over long-lived PATs (global PATs retire 2026-12-01). Open VSX (`ovsx`) is the registry for non-Marketplace clients if needed.
- `engines.vscode` and `@types/vscode` move together; raising the floor is a compatibility decision, not a silent bump.

---

## 14. Procedure: add a new command or language feature

1. **Model** — add/extend the typed domain model in `src/model/` for the data the feature handles.
2. **Parser** — if it reads Paradox files, parse text → model in `src/parser/` (typed result, no `vscode`).
3. **Service** — put the logic in `src/services/`, `vscode`-free, returning typed models.
4. **Adapter** — a command handler (`src/commands/`) or a provider (`src/providers/`) that gathers VS Code inputs, calls the service, and maps the result back to VS Code types.
5. **Manifest** — declare the contribution in `package.json` (`contributes.commands` / `languages` / `grammars` / `configuration`), plus any needed `activationEvents`.
6. **Wire** — register the disposable in `activate` and push it to `context.subscriptions`.
7. **Tests** — unit tests for the service/parser; an integration test in `src/test/` asserting the command/provider is live.
8. **Version + changelog** — bump `version` and add a `CHANGELOG.md` entry.

---

## 15. Anti-patterns

| Anti-pattern | Problem |
|---|---|
| `vscode` imported into a service/parser | Couples domain logic to the Extension Host; can't unit-test |
| Logic in a command handler or provider | Wrong layer; adapters must stay thin |
| Untyped object / `any` / `Record<string, unknown>` between layers | Removes typing and validation |
| Command declared in `package.json` but never registered (or vice versa) | Broken/invisible command |
| Disposable not pushed to `context.subscriptions` | Memory leak; duplicated handlers after reload |
| Blocking / synchronous loops over large files on the event loop | Freezes the extension host |
| Floating promise (no `await`/`void`) | `no-floating-promises` error; unhandled rejection |
| `console.log` as the logging channel | Unreliable after bundling; use an OutputChannel |
| `any` / non-null `!` / broad `as` to silence the compiler | Defeats the strict-typing policy; narrow instead |
| Raw `getConfiguration().get()` scattered in code | No single typed source; drift from manifest defaults |
| Exception text shown to the user | Leaks internal paths/details; show a category message, log the rest |
| Broad `activationEvents` (`*` / redundant `onCommand`) | Slows every workspace; activate as narrowly as possible |
| Reusing one service across unrelated features | Interfaces diverge; incorrect types |
| `main` pointing at `src`/`out` instead of `dist` | Ships unbundled/broken; only the bundle is published |
| Skipping `check-types` because esbuild "built" | esbuild strips types without checking; type errors ship |
| Committing the `.vsix` | Build artifact; it is gitignored for a reason |
