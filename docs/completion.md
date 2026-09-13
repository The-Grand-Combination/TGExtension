# Completion

The server answers `textDocument/completion` (`completionProvider` in `server.ts`, trigger
characters `=` and a space) from the same datasets the validator uses, so what is offered is what
would pass validation. The manifest turns VS Code's word-based suggestions off for the `victoria2`
language (`configurationDefaults`): without a provider the editor offers every word already in the
file, which is noise, and with one it would only dilute the list.

Completion needs the mod index. In a file outside a mod root, nothing is offered.

## Where the cursor is (`completionContext.ts`)

The context comes from the **token stream**, not the AST: a file being typed is rarely well-formed,
and `tokenize` walks an open brace or a missing value without complaint where the parser would have
to recover. One pass over the tokens before the cursor folds them into a stack of enclosing block
keys and yields:

- `position` — `value` when an operator (`=`, `<`, `>`, `<=`, `>=`) is the last thing before the
  cursor or before the partial word under it, `key` otherwise.
- `path` — the enclosing block keys, outermost first; in value position the assigned key is last.
- `prefix` and `range` — what is typed so far, and the word the items replace.

A cursor inside a string or after a `#` on the same line completes nothing.

## Values

The accepted argument kinds of the key being assigned are resolved by the first rule that knows it:

| rule | example | source |
|---|---|---|
| the key is a reform/policy class | `slavery = ` | `optionPoolByClass` (the index) |
| the parent is a symbol with a block argument, and the key is one of its fields | `add_country_modifier = { name = ` | `EFFECTS` / `TRIGGERS` |
| the key is a field of the file's own grammar | `trade_goods = ` in `history/provinces` | the `FieldTable` of that `FileType` |
| the key is a symbol taking a scalar | `remove_country_modifier = ` | `EFFECTS` / `TRIGGERS` |

The file's own table outranks the symbol tables on purpose: `primary_culture` in
`history/countries` is that file's culture field, not the trigger of the same name, which also
accepts a country.

Each kind then becomes items:

- An identifier category (`modifier`, `culture`, `good`, `technology`, `cbType`, ...) lists the
  names the index holds for it, labelled with `CATEGORY_LABELS`. The index folds every name to
  lowercase; country tags are offered uppercased, the way mods write them.
- `yesno` offers `yes`/`no`, `strata` offers `poor`/`middle`/`rich`.
- `flag` offers the flags the mod already sets, so a typo does not quietly create a new one.
- `number`, `date`, `string`, `identifier` and `variable` offer nothing — there is no list.

A localisation key carries its English text as the item detail instead of its category.

### Categories with thousands of names

Localisation keys, province ids and event ids run to thousands. Above **2,000** names a category is
gated: it offers nothing until **2** characters are typed, matches them from the start of the name,
caps the list at **300**, and marks the result incomplete so the editor asks again on the next
keystroke.

The threshold sits above every category a modder names by hand — a big mod has around 1,100
modifiers, 700 tags and 850 state regions, all of which open with nothing typed — and below the
three that are machine-sized (a big mod has 3,500 provinces, 4,200 event ids and 50,000
localisation keys).

## Keys

1. Inside a symbol's block argument (`add_country_modifier = { `), the fields that block declares,
   required ones labelled as such. This applies only where the enclosing level is script:
   `country_event` names an event definition at the top of an events file and the effect that fires
   one everywhere else.
2. Inside script, the symbols valid there: `TRIGGERS` or `EFFECTS` filtered by the scope, the scope
   changers whose `from` includes it and whose context matches, the mod's pop types as scope keys,
   and the control keys (`and`/`or`/`not` in a trigger; `limit`, `random`, `random_list`,
   `hidden_tooltip` in an effect). A weight block offers `factor`, `base`, `months`, `days`, `years`
   and `modifier` instead. Each item carries the hover documentation — the same doc, syntax and
   scope list `symbolHover.ts` renders — and a block-shaped argument is inserted as a block.
3. Otherwise, the fields of the file's own grammar: the keys of its `FieldTable`, its body fields
   (`EVENT_BODY_FIELDS`, `CB_BODY_FIELDS`, ...) and the keys that open script in it. At the top of
   an events or decisions file, the root keys instead (`country_event`, `province_event`,
   `political_decisions`).

### Resolving the scope (`completionScope.ts`)

Walking the path from the outside in, in two stages.

**Where script starts.** Each file type has a table of openers, assembled from the datasets the
validators already consult: `EVENT_TRIGGER_FIELDS` / `EVENT_EFFECT_FIELDS`, `DECISION_*`,
`CB_TRIGGER_FIELDS` / `CB_EFFECT_FIELDS`, `REBEL_*_FIELDS`, `POPTYPE_WEIGHT_FIELDS`,
`IDEOLOGY_WEIGHT_FIELDS`, `POP_CHANCE_KEYS`, plus the single-key openers of `crime`,
`triggered_modifiers`, `national_focus`, `news`, `issues`, `technology`, `invention`,
`production_types` and `common/countries/*`. Those datasets already record the scope each field
evaluates in. An event is the exception: its scope comes from its root key (`country_event` →
country, `province_event` → province).

**From there inward.** `SCOPE_CHANGERS` moves the scope (`resolveProduces`, shared with the
walker); `limit`, `and`, `or` and `not` keep the scope and switch to trigger context;
`hidden_tooltip`, `random` and `random_list` keep both; `modifier` inside a weight block is a
trigger context. A key the dataset does not name is resolved against the index as a dynamic scope
key — a country tag, a province id, a state region (which iterates provinces), a pop type. A
`random_list` weight is read as a number, never as the province of the same id.

## Silence over noise

Where the path cannot be named — an unknown key wrapping the cursor, a file type with no rules — the
key list comes back empty rather than guessing. Offering the wrong list is the problem this feature
exists to fix. Snippets ([snippets.md](snippets.md)) still expand by prefix there.

The depth of a structural level is not checked: a file type's fields are offered anywhere below its
root key, not only at the exact level that holds them. Every name offered is a real field of that
file type.
