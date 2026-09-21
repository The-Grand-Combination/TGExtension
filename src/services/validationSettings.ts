import { compilePattern, type ValidationOptions } from '../model/validationOptions.js';

/**
 * The settings a validation reads, compiled. A regex costs nothing to use and
 * something to build, and these are read on every keystroke, so they are built
 * once and rebuilt only when the text they came from changes.
 */
export interface ValidationSettingsSource {
  readonly locKeyPattern: string;
  readonly flagNamePattern: string;
  readonly nullTagPattern: string;
  readonly nullTagSuppressWarnings: boolean;
  readonly ignoreMarker: string;
}

/** Holds one compiled set and the strings it was compiled from. */
export class CompiledValidationOptions {
  private sources: readonly string[] = [];
  private options: ValidationOptions | undefined;

  constructor(private readonly nullTagFlags: string) {}

  of(source: ValidationSettingsSource): ValidationOptions {
    const sources = sourcesOf(source);
    if (this.options === undefined || sources.some((text, position) => text !== this.sources[position])) {
      this.sources = sources;
      this.options = {
        locKeyPattern: compilePattern(source.locKeyPattern),
        flagNamePattern: compilePattern(source.flagNamePattern),
        nullTagPattern: compilePattern(source.nullTagPattern, this.nullTagFlags),
        suppressNullTagWarnings: source.nullTagSuppressWarnings,
        ignoreMarker: source.ignoreMarker,
      };
    }
    return this.options;
  }
}

function sourcesOf(source: ValidationSettingsSource): readonly string[] {
  return [
    source.locKeyPattern,
    source.flagNamePattern,
    source.nullTagPattern,
    String(source.nullTagSuppressWarnings),
    source.ignoreMarker,
  ];
}

/** One pattern compiled from its text, rebuilt when the text changes. */
export class CompiledPattern {
  private source: string | undefined;
  private pattern: RegExp | undefined;

  constructor(private readonly flags: string) {}

  of(source: string): RegExp | undefined {
    if (source !== this.source) {
      this.source = source;
      this.pattern = compilePattern(source, this.flags);
    }
    return this.pattern;
  }
}
