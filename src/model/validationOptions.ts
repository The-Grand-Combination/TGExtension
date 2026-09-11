/** Rule tuning a mod's authors apply from Settings; platform-free. */
export interface ValidationOptions {
  /**
   * Which `title` / `desc` / `name` values are treated as localisation keys.
   * A value that does not match is literal display text and is not looked up.
   * `undefined` checks every value.
   */
  readonly locKeyPattern: RegExp | undefined;
}

/** Mirrors the manifest default of `victorianTools.localisation.keyPattern`. */
export const DEFAULT_LOC_KEY_PATTERN = '^EVT';

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  locKeyPattern: new RegExp(DEFAULT_LOC_KEY_PATTERN),
};

/** Compile a user-written pattern; an empty or invalid one checks every value. */
export function compileLocKeyPattern(source: string): RegExp | undefined {
  if (source.trim() === '') {
    return undefined;
  }
  try {
    return new RegExp(source);
  } catch {
    return undefined;
  }
}
