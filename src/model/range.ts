/** A half-open span of source text, measured in UTF-16 offsets. */
export interface Range {
  readonly start: number;
  readonly end: number;
}

export function range(start: number, end: number): Range {
  return { start, end };
}
