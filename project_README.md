# Victorian Tools

A Visual Studio Code extension for modding **Victoria 2**, written in **strict
TypeScript**. It runs a Language Server Protocol (LSP) server that parses the
game's Paradox script and validates it inline as you type.

Companion to [`vic2-mcp`](../vic2-mcp) (an MCP server serving Victoria 2 modding
reference docs).

## What it does today

- **Syntax highlighting** — a TextMate grammar mapped to standard scopes, so it
  works with any color theme (no bundled theme required): TAGs, scope changers,
  `AND`/`OR`/`NOT`, structural fields, numbers/dates, strings, comments.
- **Syntax validation** — unbalanced braces, unterminated strings, and other
  malformed script are flagged with precise ranges, with error recovery so one
  mistake does not hide the rest.
- **Structural validation** for `events/` and `decisions/` files — e.g. an event
  missing its `id`, or a decision missing `potential`/`effect`.
- **Semantic validation** — unknown triggers/effects (with "did you mean"
  suggestions), triggers/effects used in the wrong scope
  (country/province/state/pop), and references that don't exist in the mod:
  TAGs, cultures, religions, goods, ideologies, modifiers, reforms, pop types,
  provinces, technologies, and more — all indexed from the mod's own files.
- **Event id validation** — firing an undefined event id, or defining the same
  event id in two files, is an error.
- **Duplicate detection** — duplicated decision names, country tags, cultures,
  modifiers, and other mod identifiers are errors, reported even in files that
  are not open.
- **Localisation & picture checks** — missing loc keys (`title`, `desc`,
  option `name`, decision-derived keys) and missing event/decision pictures are
  warnings. Ctrl+Click a loc key to jump to its line in the CSV; hover it to
  see the English text. Hovering a `picture` value shows an inline preview of
  the image (DDS and TGA are decoded in-process).

The identifier index builds from the mod root (the folder containing `common/`)
and rebuilds automatically when mod files change. Only files under `events/`
and `decisions/` are analysed for now; the `victoria2` language does not claim
every `.txt` file.

## Requirements

- [Node.js](https://nodejs.org/) (LTS)
- [Visual Studio Code](https://code.visualstudio.com/) `^1.96.0`

## Getting started

```bash
npm install      # install dependencies
npm run watch    # start the esbuild + tsc watchers
```

Press <kbd>F5</kbd> in VS Code to launch the **Extension Development Host** with
the extension loaded. Run the `Victorian Tools: Hello World` command from the
Command Palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) to confirm it
works.

## Scripts

| Script                 | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `npm run compile`      | Type-check, lint, and bundle once.                      |
| `npm run watch`        | Rebuild on change (esbuild) + type-check on change.     |
| `npm run package`      | Production build (minified) for publishing.             |
| `npm run lint`         | Run ESLint over `src`.                                  |
| `npm run check-types`  | Type-check without emitting.                            |
| `npm run test:unit`    | Run the fast unit suites (plain Mocha, no editor host). |
| `npm test`             | Run the integration suite in the Extension Host.        |

## Project layout

```
.
├── src/
│   ├── extension.ts             # LSP client — starts the server, no logic
│   ├── server/                  # LSP server (adapter): server.ts, toLspDiagnostic.ts
│   ├── services/                # domain logic — platform-free (syntax + structure validation)
│   ├── parser/                  # lexer.ts, parser.ts (error-recovering) → typed AST
│   ├── model/                   # domain types: ast, diagnostic, range, fileType
│   └── test/
│       ├── extension.test.ts    # integration suite (Extension Host)
│       └── unit/                # unit suites (plain Mocha)
├── esbuild.js                   # bundler (two entry points → dist/extension.js, dist/server.js)
├── language-configuration.json  # comments/brackets for the victoria2 language
├── eslint.config.mjs            # lint rules (strict, type-checked)
├── tsconfig.json                # strict TypeScript config
└── package.json                 # extension manifest
```

The core (`parser/`, `model/`, `services/`) imports neither `vscode` nor
`vscode-languageserver`, so it is unit-tested without any editor host.

## Type-safety policy

This project uses **strict TypeScript with strong typing**. `tsconfig.json`
enables `strict` plus every additional check (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitReturns`, and more), and ESLint runs
the `strict-type-checked` ruleset with `no-explicit-any` promoted to an error.
Keep it that way.
