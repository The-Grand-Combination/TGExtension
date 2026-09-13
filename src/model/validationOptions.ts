/** Rule tuning a mod's authors apply from Settings; platform-free. */
export interface ValidationOptions {
  /**
   * Which `title` / `desc` / `name` values are treated as localisation keys.
   * A value that does not match is literal display text and is not looked up.
   * `undefined` checks every value.
   */
  readonly locKeyPattern: RegExp | undefined;
  /**
   * Which country/global flag names the never-set check applies to. A flag
   * whose name does not match is not reported. `undefined` checks every flag.
   */
  readonly flagNamePattern: RegExp | undefined;
  /**
   * Tags that stand for "no country" (`QQQ`, `---`, `null`). A country value
   * matching this is a warning instead of an unknown-tag error, because the
   * script means it. `undefined` is no exception: every unknown tag is an error.
   */
  readonly nullTagPattern: RegExp | undefined;
  /**
   * Whether a null tag is reported at all. The pattern above says what counts as
   * one; this says whether those are worth a warning, and by default they are
   * not: a mod uncolonizing by hand would read the same warning a hundred times.
   * A tag the pattern does not match is untouched: that one is not deliberate.
   */
  readonly suppressNullTagWarnings: boolean;
  /**
   * A marker a modder writes on a line to silence every finding on it. Matched
   * case-insensitively anywhere in the line; empty turns the escape hatch off.
   */
  readonly ignoreMarker: string;
}

/** Mirrors the manifest default of `victorianTools.localisation.keyPattern`. */
export const DEFAULT_LOC_KEY_PATTERN = '^EVT';

/** Mirrors the manifest default of `victorianTools.flags.namePattern`: every flag. */
export const DEFAULT_FLAG_NAME_PATTERN = '';

/** Mirrors the manifest default of `victorianTools.nullTags.pattern`. */
export const DEFAULT_NULL_TAG_PATTERN = '^(QQQ|---|null)$';

/** Null tags are written in any case, so the pattern is matched case-insensitively. */
export const NULL_TAG_FLAGS = 'i';

/**
 * Mirrors the manifest default of `victorianTools.nullTags.suppressWarnings`: on,
 * because a mod that writes a null tag wrote it on purpose. Turning it off brings
 * the warnings back for someone auditing those spots.
 */
export const DEFAULT_SUPPRESS_NULL_TAG_WARNINGS = true;

/** Mirrors the manifest default of `victorianTools.ignoreMarker`. */
export const DEFAULT_IGNORE_MARKER = '#VT - Skip Validation';

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  locKeyPattern: new RegExp(DEFAULT_LOC_KEY_PATTERN),
  flagNamePattern: undefined,
  nullTagPattern: new RegExp(DEFAULT_NULL_TAG_PATTERN, NULL_TAG_FLAGS),
  suppressNullTagWarnings: DEFAULT_SUPPRESS_NULL_TAG_WARNINGS,
  ignoreMarker: DEFAULT_IGNORE_MARKER,
};

/**
 * Compile a user-written pattern. An empty or invalid one is `undefined`, which
 * each rule reads as its own safe default: match everything for the patterns
 * that narrow a check, match nothing for the null-tag exception.
 */
export function compilePattern(source: string, flags = ''): RegExp | undefined {
  if (source.trim() === '') {
    return undefined;
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return undefined;
  }
}
