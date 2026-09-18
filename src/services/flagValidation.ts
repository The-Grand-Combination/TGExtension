import type { Scalar } from '../model/ast.js';
import { asBlock, blockKeysOf, firstByKey } from '../model/astQuery.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import { COUNTRY_LIST_FILE, FLAG_EXTENSION, FLAG_FOLDER, GOVERNMENTS_FILE } from '../model/gamePaths.js';
import { parseCountryList } from './countryList.js';
import { parseDocument } from './syntaxValidation.js';

export interface FlagAuditInput {
  readonly governmentsText: string | undefined;
  readonly countriesText: string | undefined;
  /** File names (not paths) directly inside `gfx/flags`, merged across the mod stack. */
  readonly flagFileNames: readonly string[];
}

/** Findings split by the file they are reported on. */
export interface FlagAudit {
  readonly governments: readonly Diagnostic[];
  readonly countries: readonly Diagnostic[];
}

/**
 * Every country tag needs one flag per government flag type. A government block
 * in `common/governments.txt` carrying `flagType = x` makes the engine look for
 * `gfx/flags/<TAG>_x.tga` for every tag in `common/countries.txt`, and a
 * government without a `flagType` uses the default `gfx/flags/<TAG>.tga`. A
 * flag type no tag has art for is reported once, on the government that names
 * it; anything else is reported on the tag that is missing it.
 *
 * Dynamic tags (everything below `dynamic_tags = yes`) are left out: a released
 * dominion flies the flag of the country that released it, so it has none of
 * its own.
 */
export function auditFlags(input: FlagAuditInput): FlagAudit {
  const tags = countryTags(input.countriesText);
  const flagTypes = declaredFlagTypes(input.governmentsText);
  const onDisk = fileIndex(input.flagFileNames);
  // No tags or no flag folder at all: the stack is not complete enough to judge.
  if (tags.length === 0 || onDisk.size === 0) {
    return { governments: [], countries: [] };
  }
  const withoutArt = flagTypes.filter((type) => tags.every((tag) => !onDisk.has(flagFile(tag.value, type.value).toLowerCase())));
  const covered = flagTypes.filter((type) => !withoutArt.includes(type));
  return {
    governments: withoutArt.map((type) => flagTypeWithoutArt(type, tags.length)),
    countries: tags.flatMap((tag) => tagFindings(tag, covered, onDisk)),
  };
}

/** `TAG.tga` for the default flag, `TAG_<type>.tga` for a government flag type. */
function flagFile(tag: string, flagType?: string): string {
  return `${tag}${flagType === undefined ? '' : `_${flagType}`}${FLAG_EXTENSION}`;
}

/** Lowercase name → the name as it actually is on disk, so a case slip is visible. */
function fileIndex(names: readonly string[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!index.has(key)) {
      index.set(key, name);
    }
  }
  return index;
}

function tagFindings(
  tag: Scalar,
  flagTypes: readonly Scalar[],
  onDisk: ReadonlyMap<string, string>,
): Diagnostic[] {
  const expected = [flagFile(tag.value), ...flagTypes.map((type) => flagFile(tag.value, type.value))];
  const missing = expected.filter((name) => !onDisk.has(name.toLowerCase()));
  const miscased = expected.filter((name) => {
    const actual = onDisk.get(name.toLowerCase());
    return actual !== undefined && actual !== name;
  });
  return [
    ...(missing.length > 0 ? [missingFlags(tag, missing)] : []),
    ...(miscased.length > 0 ? [miscasedFlags(tag, miscased, onDisk)] : []),
  ];
}

function missingFlags(tag: Scalar, missing: readonly string[]): Diagnostic {
  return diagnostic(
    'error',
    'missing-flag',
    `'${tag.value}' has no ${missing.length === 1 ? 'flag' : `${String(missing.length)} flags`}: ${list(missing)}. ` +
      `Every tag needs a ${FLAG_FOLDER}/<TAG>_<flagType>.tga for each flagType in ${GOVERNMENTS_FILE}, plus the default <TAG>.tga.`,
    tag.range,
  );
}

function miscasedFlags(
  tag: Scalar,
  miscased: readonly string[],
  onDisk: ReadonlyMap<string, string>,
): Diagnostic {
  const pairs = miscased.map((name) => `${String(onDisk.get(name.toLowerCase()))} should be ${name}`);
  return diagnostic(
    'warning',
    'flag-name-case',
    `The flag of '${tag.value}' is on disk under another spelling: ${pairs.join('; ')}. ` +
      'Windows opens it anyway, but the name no longer matches the tag and the flag type; rename it.',
    tag.range,
  );
}

function flagTypeWithoutArt(flagType: Scalar, tagCount: number): Diagnostic {
  return diagnostic(
    'error',
    'flag-type-without-art',
    `No country has a flag for flag type '${flagType.value}': not one of the ${String(tagCount)} tags in ${COUNTRY_LIST_FILE} ` +
      `has a ${FLAG_FOLDER}/<TAG>_${flagType.value}${FLAG_EXTENSION}. Draw the flags or drop the flagType.`,
    flagType.range,
  );
}

function list(names: readonly string[]): string {
  return names.map((name) => `${FLAG_FOLDER}/${name}`).join(', ');
}

/** The tag tokens of `common/countries.txt` that fly a flag of their own. */
function countryTags(text: string | undefined): Scalar[] {
  return text === undefined
    ? []
    : parseCountryList(text)
        .filter((entry) => !entry.dynamic)
        .map((entry) => entry.tag);
}

/** The distinct `flagType` values of `common/governments.txt`, at their first mention. */
function declaredFlagTypes(text: string | undefined): Scalar[] {
  if (text === undefined) {
    return [];
  }
  const types: Scalar[] = [];
  const seen = new Set<string>();
  for (const government of blockKeysOf(parseDocument(text).document)) {
    const block = asBlock(government.value);
    const value = block === undefined ? undefined : firstByKey(block.entries, 'flagType')?.value;
    if (value?.kind !== 'scalar' || seen.has(value.value.toLowerCase())) {
      continue;
    }
    seen.add(value.value.toLowerCase());
    types.push(value);
  }
  return types;
}
