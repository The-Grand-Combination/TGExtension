# Events and decisions

## Events (`events/*.txt`)

### Structural checks (`structureValidation.ts`, no mod index needed)

Applied even when no mod root is found:

- Only `country_event` / `province_event` blocks are allowed at the top level
  (`unexpected-top-level` for a stray entry, `unknown-top-level-key` for any other key).
- Each event block is required to have `id` (`event-missing-id`, error) and warned for a missing
  `title` (`event-missing-title`) or `desc` (`event-missing-desc`).
- An event with zero `option` blocks gets `event-no-option` (warning) — the player cannot dismiss
  it.

### Semantic checks (`semanticValidation.ts` → `validateEventFile`, needs the mod index)

`country_event` sets scope `country` for its body; `province_event` sets scope `province`.

- `id` — duplicate detection: an event id already used elsewhere in the mod (any other file, or a
  second definition in the same file) is `duplicate-event-id` (error) on every occurrence, naming
  the other file(s).
- `title`, `desc`, `news_title`, `news_desc_long`, `news_desc_medium`, `news_desc_short` — checked
  against the mod's localisation (`missing-localisation`, warning; skipped entirely when no
  `localisation/` folder was found, to avoid flooding mods without English loc).
- `picture` — checked against `gfx/pictures/events/*.tga`/`.dds` (`missing-picture`, warning; same
  skip-when-absent rule).
- `major`, `election`, `news`, `fire_only_once`, `is_triggered_only`, `allow_multiple_instances`,
  `issue_group` — accepted as plain metadata fields, not further validated.
- `trigger` — walked as a **trigger** at the event's scope.
- `immediate` — walked as an **effect** at the event's scope.
- `mean_time_to_happen` — walked as a weight block (`modifier`/`group` sub-blocks, `months`/`days`/
  `years`/`factor`/`base` skipped) at the event's scope.
- `option` — `name` is checked as a localisation key; `ai_chance` is walked as a weight block; every
  other entry is walked as an **effect** at the event's scope.
- Any other top-level key inside the event body → `unknown-event-field` (error).
- Any bare value/block instead of `key = value` anywhere in the body → `stray-value` / `stray-block`
  (error) — this is what catches a stray identifier like a dropped `a` inside
  `country_event = { a id = 999597 ... }`.

## Decisions (`decisions/*.txt`)

### Structural checks

- Only `political_decisions` is allowed at the top level.
- Duplicate decision names within the same parse are flagged (`duplicate-decision-name`).
- Each decision is warned if missing `potential` or `effect` (`decision-missing-potential` /
  `decision-missing-effect`).

### Semantic checks (`validateDecisionFile`)

Decision bodies always start at `country` scope.

- Duplicate decision names **across files** are checked via the mod index
  (`duplicate-decision-name`, error, naming the other file(s) — this is in addition to the
  same-file structural check above).
- `<name>_title` / `<name>_desc` (derived from the decision's own name) are checked against
  localisation (`missing-localisation`, warning, skipped when no `localisation/` folder exists).
- `picture` — checked against `gfx/pictures/decisions/`.
- `potential`, `allow` — walked as **triggers** at `country` scope.
- `effect` — walked as an **effect** at `country` scope.
- `ai_will_do` — walked as a weight block at `country` scope.
- `alert`, `news`, `news_title`, `news_desc_long`, `news_desc_medium`, `news_desc_short` — plain
  metadata.
- Any other key → `unknown-decision-field`.

See [diagnostics-reference.md](diagnostics-reference.md) for every code's exact severity, and
[triggers.md](triggers.md) / [effects.md](effects.md) for what's valid inside `trigger`/`allow`/
`potential` and `immediate`/`effect` bodies.
