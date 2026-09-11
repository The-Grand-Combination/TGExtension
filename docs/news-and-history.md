# `news/` and `history/`

## `news/<name>.txt` → `validateNewsFile`

News generator/priority/article scripts have a structure the engine mostly ignores unknown blocks
in, so validation is deliberately narrow: the file is walked recursively, and every `trigger` block
found at any depth is validated as a **country-scope trigger** (which is where the 21
news-comparison triggers — `tags_eq`, `values_greater`, `date_greater`, ... — matter; see
[triggers.md](triggers.md)). Nothing else in a news file is type-checked.

## `history/countries/<TAG> - <name>.txt` → `validateCountryHistoryEntries`

Entries at the top level and inside dated sub-blocks (`yyyy.m.d = { ... }`, recursed the same way):

- `COUNTRY_HISTORY_FIELDS`: `capital` (province), `primary_culture`/`culture` (culture),
  `remove_culture` (culture), `religion` (religion), `government` (government), `plurality`
  (number), `prestige` (number), `nationalvalue` (national value), `literacy` (number),
  `non_state_culture_literacy` (number), `civilized` (`yesno`), `is_releasable_vassal` (`yesno`),
  `ruling_party` (identifier), `schools` (a tech-school modifier reference), `consciousness`
  (number), `nonstate_consciousness` (number), `last_election` (date), `oob` (string/identifier —
  the order-of-battle file name), `colonial_points` (number), `set_country_flag` /
  `set_global_flag` / `clr_country_flag` / `clr_global_flag` (flag).
- `upper_house` — an `ideology → number` map.
- `foreign_investment` — a `country → number` map.
- `govt_flag` — a block with required `government` and `flag`.
- `scripted_govt_flag` — accepted, not validated.
- `decision` — checked against the decision index (`unknown-decision`, skipped if the mod defines
  no decisions).
- A `yyyy.m.d` date key — recurses into the block with the same field set.
- A known technology or invention name — value must be `number` or `yesno`.
- A known reform-class name (e.g. `slavery`) — checked as a reform-option value.
- `political_reform` / `social_reform` / `economic_reform` / `military_reform` — the effect-form
  keys (`military_reform = yes_military_constructions` starts the country with that reform); the
  value must be a known reform option. The game accepts these in history even though NCE does not.
- Anything else → `unknown-country-history-key`.

## `history/provinces/<id> - <name>.txt` → `validateProvinceHistoryEntries`

- `PROVINCE_HISTORY_FIELDS`: `life_rating` (number), `colony`/`colonial` (number), `trade_goods`
  (good), `owner`/`controller` (country, or `---` / `null` for an uncolonized province), `terrain`
  (terrain), `add_core`/`remove_core` (country), `is_slave` (`yesno`),
  `set_province_flag`/`clr_province_flag` (flag). `set_province_flag` is broken in the engine and
  reported as `broken-effect` here too.
- `party_loyalty` — a block with required `ideology` and `loyalty_value`.
- `state_building` — a block: `building` (required), `level` (optional number), `upgrade`
  (optional `yesno`).
- `revolt`, `rgo_distribution` — accepted, not validated.
- A `yyyy.m.d` date key — recurses with the same field set.
- A known building name — numeric (a building level).
- Anything else → `unknown-province-history-key`.

## `history/pops/<date>/<name>.txt` → `validatePopsHistory`

Top level: each key must be a numeric string that resolves to a known province id
(`unknown-province` otherwise). Each province's block: each key must be a known pop type
(`unknown-poptype`, skipped when the mod defines no pop types); each pop's body accepts
`POP_HISTORY_FIELDS` (`culture`, `religion`, `size` (number), `militancy` (number), `rebel_type`).

## `history/diplomacy/*.txt` → `validateDiplomacyHistory`

Top-level keys must be one of the four `DIPLOMACY_RELATION_KEYS` (`alliance`, `vassal`, `union`,
`substate`); each holds `DIPLOMACY_RELATION_FIELDS` (`first`, `second` — both country references;
`start_date`, `end_date` — both dates). This is the check that catches a relation block with fields
in the wrong shape (e.g. a typo'd field name inside an `alliance` block).

## `history/units/*.txt` (orders of battle) → `validateOobEntries`

- `leader` — a block of `OOB_LEADER_FIELDS` (`name`, `date`, `type`, `personality`/`background` —
  traits, `prestige`, `picture`).
- `army` / `navy` — recurse into `validateOobForce`:
  - `name` — accepted, unchecked.
  - `location` — a province reference.
  - `regiment` / `ship` — a block of `OOB_SHIP_FIELDS` (`name`, `type` — a unit reference, `home` —
    a province reference).
  - `leader` — same `OOB_LEADER_FIELDS` as above.
  - Nested `army`/`navy` — recurse again.
  - Anything else → `unknown-field`.
- At the top level only: `ai` (accepted, unchecked) or a country TAG — a block of
  `OOB_RELATIONSHIP_FIELDS` (`value`, `level`, `influence_value`, `truce_until` — date,
  `military_access` — `yesno`) describing that country's relationship in the OOB.
- Anything else → `unknown-oob-key`.

## `history/wars/*.txt` → `validateWarHistory`

- `name` — accepted, unchecked.
- A `yyyy.m.d` date key — recurses into `validateWarBlock`:
  - `war_goal` — a block of `WAR_GOAL_FIELDS` (`casus_belli`, `actor`, `receiver`, `country` — all
    country/CB references as appropriate, `state_province_id` — a province reference).
  - `WAR_BLOCK_FIELDS`: `add_attacker`, `add_defender`, `rem_attacker`, `rem_defender` (all country
    references), `world_war` (`yesno`).
  - Anything else → `unknown-field`.
- Any other top-level key → `unknown-war-key` ("expected a date block or 'name'").

## `historyOther`

`history/<subfolder>/` for any subfolder other than the six above (`countries`, `provinces`,
`pops`, `diplomacy`, `units`, `wars`) classifies as `historyOther` — syntax-checked only, no
semantic validator, and exempt from the top-level stray-entry check (see
[file-classification.md](file-classification.md)).

## Dates

Every history file (and history-adjacent MTTH-style code) recognizes a `yyyy.m.d` date the same
way: `DATE_PATTERN = /^\d{1,4}\.\d{1,2}\.\d{1,2}$/` — 1-4 digit year, 1-2 digit month, 1-2 digit
day, no zero-padding required.
