/**
 * Spelling suggestions for unknown identifiers. A candidate list can hold
 * thousands of names, so the distance is computed in a band of width
 * `2 * max + 1` around the diagonal (only cells that can still be within
 * `max`), over two reused rows instead of a fresh array per row.
 */

let previousRow = new Int32Array(64);
let currentRow = new Int32Array(64);

/** Levenshtein distance capped at `max + 1`; anything further apart reports `max + 1`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  if (b.length + 2 > previousRow.length) {
    previousRow = new Int32Array(b.length + 2);
    currentRow = new Int32Array(b.length + 2);
  }
  const over = max + 1;
  for (let j = 0; j <= b.length; j++) {
    previousRow[j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    const from = Math.max(1, i - max);
    const to = Math.min(b.length, i + max);
    currentRow[from - 1] = from === 1 ? i : over;
    let rowMin = over;
    for (let j = from; j <= to; j++) {
      const substitution = (previousRow[j - 1] ?? over) + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1);
      const insertion = (currentRow[j - 1] ?? over) + 1;
      const deletion = (previousRow[j] ?? over) + 1;
      const value = Math.min(substitution, insertion, deletion);
      currentRow[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) {
      return over;
    }
    // The cell past the band must read as "too far" for the next row.
    currentRow[to + 1] = over;
    [previousRow, currentRow] = [currentRow, previousRow];
  }
  return Math.min(previousRow[b.length] ?? over, over);
}

/** Closest candidate within a small edit distance, or undefined. */
export function suggestClosest(input: string, candidates: Iterable<string>): string | undefined {
  const maxDistance = input.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    if (Math.abs(candidate.length - input.length) > maxDistance) {
      continue;
    }
    const distance = editDistance(input, candidate, maxDistance);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      if (distance === 0) {
        break;
      }
    }
  }
  return best;
}

/** Format the ", did you mean 'x'?" suffix, or an empty string. */
export function didYouMean(input: string, candidates: Iterable<string>): string {
  const suggestion = suggestClosest(input, candidates);
  return suggestion !== undefined && suggestion !== input ? ` Did you mean '${suggestion}'?` : '';
}
