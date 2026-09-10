# Snippets

Two snippet files ship with the extension, carried over from the previous Victorian Tools
extension and re-pointed at this one's language ids. Type a prefix in a matching file and accept
the completion; `$1`, `$2`, ... are tab stops.

| File | Language | Applies to |
|---|---|---|
| `snippets/victoria2.code-snippets` | `victoria2` | every Paradox script file (see [file-classification.md](file-classification.md)) |
| `snippets/victoria2-csv.code-snippets` | `victoria2-csv` | `localisation/**/*.csv` and `map/**/*.csv` |

They are declared under `contributes.snippets` in `package.json`. Snippets are a purely
declarative contribution: VS Code expands them, the language server is not involved, and an
expanded snippet is validated afterwards like any other text.

## Script snippets (49)

| Prefix | Name | Description | Lines |
|---|---|---|---|
| `if` | If emulation | Emulate the IF conditional by using the random_owned and owner scopes. | 10 |
| `define_general` | Define General | Effect that creates a general with the specified name, personality and background. | 5 |
| `add_country_modifier` | Add Country Modifier | Creates a country-scope modifier. | 1 |
| `add_province_modifier` | Add Province Modifier | Creates a province-scope modifier. | 1 |
| `sub_unit` | Create Unit | Spawns a unit. (Warning: may be slightly unstable.) | 1 |
| `upper_house` | Upper House Composition | Changes or checks the Upper House's compsition. In effects, the amount gained (U) is calculated by the following formula: U=1-1/(1+N) The other values will be multiplied by 1-U. | 1 |
| `dominant_issue` | Change Issue Value | Changes the dominant issue of a portion of the targeted pop to the given issue. Works the same way as Upper House. | 1 |
| `move_issue_percentage` | Issue Shift | Makes a certain percentage of people supporting issue A, switch to issue B. Usually used in CBs. | 5 |
| `scaled_consciousness` | Scaled Consciousness | Changes the consciousness of the targeted pops by the given value multiplied by the proportion of the pop that is of the given ideology or issue. | 1 |
| `scaled_militancy` | Scaled Militancy | Changes the militancy of the targeted pops by the given value multiplied by the proportion of the pop that is of the given ideology or issue. | 1 |
| `ideology` | Change Ideology Value | Change the proportion of the targeted pop that follows the specified ideology. Works the same way as Upper House. | 1 |
| `add_casus_belli_effect` | Add Casus Belli - Effect | NOT TO BE CONFUSED WITH casus_belli. Gives the target a casus belli against the country in scope for n months. | 5 |
| `casus_belli_effect` | Casus Belli - Effect | NOT TO BE CONFUSED WITH add_casus_belli. Grants the scoped country a casus belli against the target country for n months. | 5 |
| `influence` | Diplomatic Influence | Changes or checks the influence that the scoped country has on the specified country. | 1 |
| `relation` | Relation | Changes or checks the relation between the scoped country and the specified country. | 1 |
| `war` | War | Starts a war between the country for whom the event or decision fired and the given country. defender_goal, state_province_id and call_ally may be optional. | 12 |
| `set_variable` | Set Variable | Creates a new variable and assigns it the value n. | 1 |
| `check_variable` | Check Variable | Returns true if the variable has been set at an earlier stage and its value is greater than x. NOTE: Unlike other conditions, check_variable will *only* be true if the variable's actual value is greater than the value in the condition. Likewise, NOT = { check_variable } will *only* be true if the variable's actual value is less than the value in the condition. | 1 |
| `change_variable` | Change Variable | Increases or decreases the value of an existing variable. | 1 |
| `country_event_effect` | Fire Country Event | Fires the specified country event for the targeted country in a specified amount of days. | 1 |
| `random` | Random | Specifies the probability n that the specified effects will occur. | 4 |
| `random_list` | Random List | Specifies the probability n that the specified effects will occur. | 4 |
| `hidden tooltip` | Hidden Tooltip | Uses a clever assortment of if emulation and country flags to make an hidden tooltip, original method by SirRunner. | 7 |
| `unemployment_by_type` | Unemployment by PoP Type | Change the proportion of the targeted pop that follows the specified ideology. Works the same way as Upper House. | 1 |
| `work` | Work Available | Returns true if there is any work available for the specified pop type—meaning specifically is it possible for that pop type to be employed, not whether they would actually find work there or whether there's any unemployment in the province. If a province has factories, this command will always return true for craftsmen and clerks. If the province produces coal, this command will always return true for labourers and false for farmers. | 1 |
| `limit` | Limit statement | Restricts the effects that follow to the scopes matching these conditions. Inside an iterator, filters which scopes it visits. | 3 |
| `immediate` | Immediate statement | Event-specific statement that fires an effect as soon as the event appears. | 3 |
| `trigger` | Trigger statement | The conditions that must hold for an event to fire, or for a triggered modifier or crime to apply. | 3 |
| `option_event` | Option statement for events | An event option, with the localisation key the engine expects (EVTOPTA<id>, EVTOPTB<id>, ...) and an AI weight. | 10 |
| `ai_chance` | AI_chance statement | AI weight modifiers for choosing options in events. | 6 |
| `ai_will_do` | ai_will_do statement | AI weight modifiers for enacting decisions. | 6 |
| `country_event` | Country Event | A basic country event template. Note that it can only have a maximum of 5 options without looking bad. | 40 |
| `country_event_triggered_only` | Country Event Triggered | A basic triggered only country event template. Note that it can only have a maximum of 5 options without looking bad. | 32 |
| `country_event_barebones` | Country Event Barebones | A barebones event template for mechanical stuff, for Bob | 12 |
| `news` | News Article | News article structure for events and decisions. | 4 |
| `decision` | Decision | Basic decision template. Note that all decisions in a file *must* be within 'political_decisions = {}'. | 19 |
| `alliance` | History Relationship | A template for pre-existing special relationships at the start of the game. Only for use inside history/diplomacy files. | 6 |
| `history relation` | History Relations | A template for pre-existing relations at the start of the game. Only for use inside the history files. | 5 |
| `leader` | History Leader | A template for pre-existing leaders at the start of the game. Only for use inside the history files. | 8 |
| `army` | History Army | A template for pre-existing armies at the start of the game. Only for use inside the history files. | 15 |
| `navy` | History Navy | A template for pre-existing armies at the start of the game. Only for use inside the history files. | 13 |
| `province history` | History Province | A template for pre-existing provinces at the start of the game. Only for use inside the history files. | 28 |
| `country history` | History Country | A template for countries at the start of the game. Only for use inside the history files. | 51 |
| `country info` | Commons Country | A template for basic country data. Only for use inside the commons files. | 50 |
| `casus_belli_defining` | Casus Belli - Defining | A template for a casus belli that is only ever given out by events/decisions or in scripted wars. Causes minimal lag. | 35 |
| `rename_prov` | Renaming Format - Province Only | Standard IF emulation for renames for provs in the renaming event. | 8 |
| `rename_capital` | Renaming Format - Province + State | Standard IF emulation for renames for capital provs in the renaming event. | 11 |
| `song` | Song | Effect that sets up the chances for a specific piece of music to play. | 6 |
| `modifier_song` | Song Modifier | Effect that adds a modifier to the chance of a specific piece of music playing. | 1 |

## Localisation snippets (20)

| Prefix | Name | Description | Lines |
|---|---|---|---|
| `event_localization_country` | Event Localization | Localization for country events | 4 |
| `option_event_localization` | Event Option Localization | Localization for event options | 1 |
| `decision_localization` | Decision Localization | Localization for decisions | 2 |
| `modifier_localization` | Modifier Localization | Localization for decisions | 2 |
| `news_event_localization` | Event News Localization | Localization for events | 3 |
| `ideology_localization` | Ideology Localization | Localization for ideologies | 2 |
| `issue_localization` | Issue Localization | Localization for issues | 3 |
| `reform_localization` | Reform Movement Localization | Localization for reforms | 3 |
| `rebels_localization` | Rebels Localization | Localization for rebels | 4 |
| `localization_other` | Single Line Localization | Generic Localization Format | 1 |
| `definition_prov` | Province Definitions | Defining Provinces: remember to define it in continent.txt, climate.txt, regions.txt, add prov + pop history files in history/provinces and history/pops, increase max_provinces by 1 for every new prov in default.map, and add it to the all_land_provs region | 1 |
| `adjacency_prov` | Province Adjacencies | Defining Adjacencies: 'Data' will always be '0' unless it is a canal; for impassable, use '0;0' | 1 |
| `govt_types_localization` | Country Government Types Localization | Localization for Government Types—delete portions as necessary | 18 |
| `adj_localization` | Country Adjectives Localization | Localization for country adjectives | 1 |
| `adj_expanded_localization` | Expanded Country Adjectives Localization | Expanded localization for country adjectives | 19 |
| `party_types_localization` | Country Party Types Localization | Localization for Parties: add and delete portions as necessary | 7 |
| `debug_events_localization` | Debug Events Localization | Localization for Parties: add and delete portions as necessary | 7 |
| `province_localization` | Province Localization | Localization for provinces | 1 |
| `region_localization` | Region Localization | Localization for regions | 1 |
| `metaregion_localization` | Metaregion Localization | Localization for metaregions | 1 |

## Invariants

Unit tests in `src/test/unit/snippets.test.ts` hold these:

- Every snippet has a prefix, a body, and a description.
- Prefixes are unique within a file, so one prefix means one snippet.
- `$0` (the final cursor position) appears at most once per snippet.
- Every `${...}` is syntax VS Code can parse. Anything else is inserted as literal text, which is
  how `${alliance-puppet_type}` and `${1-2}` used to leak into the file.
- Numbered tab stops run 1..n with no gaps, and one number never carries two different defaults.
- Script snippets insert balanced braces.
- Localisation rows carry the 15 columns the engine reads, and the two map rows carry 6.
- The snippets that insert a whole construct expand to text the validator accepts: both casus belli
  effects, `ai_chance`, `ai_will_do`, `option_event`, and `casus_belli_defining`. Placeholders
  are filled with values a real mod would define, then the result is validated in its proper file
  type.

The files are kept as strict JSON (no trailing commas), even though VS Code would accept JSONC, so
any tool can read them. An integration test checks that both ship with the extension and parse.
