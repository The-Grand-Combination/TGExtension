import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import { COUNTRY_LIST_FILE } from '../model/gamePaths.js';
import { parseCountryList, type CountryListEntry } from './countryList.js';

/** Where a country definition path in `common/countries.txt` is resolved from. */
const COMMON_FOLDER = 'common';

interface EssentialTag {
  readonly tag: string;
  /** What the engine uses it for, so the message says why it cannot be dropped. */
  readonly role: string;
}

/**
 * Tags the engine needs by name. `REB` is the one the base game cannot do
 * without: every rebel army in the game belongs to it, so a mod that drops it
 * has no one to rise up. Tags a mod invents for its own bookkeeping are not
 * essential and are none of this check's business.
 */
const ESSENTIAL_TAGS: readonly EssentialTag[] = [
  { tag: 'REB', role: 'every rebel army in the game belongs to it' },
];

/**
 * `common/countries.txt` has to declare every essential tag, above
 * `dynamic_tags = yes`, and the country definition each one points at has to be
 * somewhere in the stack. The definition is resolved over the stack rather than
 * in the mod folder: a mod that does not replace `common/` inherits the base
 * game's `common/countries/rebels.txt`, and that counts.
 */
export function auditEssentialTags(
  countriesText: string | undefined,
  definitionExists: (relativePath: string) => boolean,
): Diagnostic[] {
  if (countriesText === undefined) {
    return [];
  }
  const entries = parseCountryList(countriesText);
  return ESSENTIAL_TAGS.flatMap((essential) => tagFindings(essential, entries, definitionExists));
}

function tagFindings(
  essential: EssentialTag,
  entries: readonly CountryListEntry[],
  definitionExists: (relativePath: string) => boolean,
): Diagnostic[] {
  const entry = entries.find((candidate) => candidate.tag.value.toUpperCase() === essential.tag);
  if (entry === undefined) {
    return [undeclared(essential)];
  }
  if (entry.dynamic) {
    return [declaredDynamic(essential, entry)];
  }
  const definition = `${COMMON_FOLDER}/${entry.definitionFile}`;
  return definitionExists(definition) ? [] : [withoutDefinition(essential, entry, definition)];
}

/** Reported at the start of the file: there is no token to point at when the tag is simply not there. */
function undeclared(essential: EssentialTag): Diagnostic {
  return diagnostic(
    'error',
    'missing-essential-tag',
    `${COUNTRY_LIST_FILE} does not declare '${essential.tag}', which the engine needs by name: ${essential.role}. ` +
      `Add '${essential.tag} = "countries/<file>.txt"' to it.`,
    { start: 0, end: 0 },
  );
}

function declaredDynamic(essential: EssentialTag, entry: CountryListEntry): Diagnostic {
  return diagnostic(
    'error',
    'missing-essential-tag',
    `'${essential.tag}' is declared below 'dynamic_tags = yes', where the engine reads it as a tag to hand out to a ` +
      `released nation rather than as a country of its own. It has to sit above that line: ${essential.role}.`,
    entry.tag.range,
  );
}

function withoutDefinition(
  essential: EssentialTag,
  entry: CountryListEntry,
  definition: string,
): Diagnostic {
  return diagnostic(
    'error',
    'missing-country-definition',
    `'${essential.tag}' points at '${definition}', which no layer of the stack has. ` +
      'The engine needs that file for the tag to exist: it carries the colour and the party list.',
    entry.tag.range,
  );
}
