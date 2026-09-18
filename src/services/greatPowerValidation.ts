import type { Document } from '../model/ast.js';
import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import { compareDates } from '../model/gameDate.js';
import type { Range } from '../model/range.js';
import { parseCountryList } from './countryList.js';
import { yieldToEventLoop } from './scheduling.js';
import { parseDocument } from './syntaxValidation.js';

/** The engine's own default, used when `defines.lua` names no start date. */
const DEFAULT_START_DATE = '1836.1.1';

/** A country needs provinces in this many state regions before it can be seated as a great power. */
const STATES_FOR_GREAT_POWER = 2;

export interface GreatPowerCandidate {
  readonly tag: string;
  readonly civilized: boolean;
  /** Distinct state regions the tag owns a province in at the start date. */
  readonly stateCount: number;
}

/** `start_date = '1836.1.1'` in `common/defines.lua`; the engine's default without one. */
export function startDateOf(definesText: string | undefined): string {
  return /\bstart_date\s*=\s*['"]([\d.]+)['"]/.exec(definesText ?? '')?.[1] ?? DEFAULT_START_DATE;
}

/**
 * `GREAT_NATIONS_COUNT` is how many great powers the game seats at start, and
 * it seats them from the countries that qualify: civilized, and holding
 * provinces in at least two state regions. With fewer qualifying countries than
 * seats, the game crashes on load, so the count and the world have to agree —
 * either another country is made to qualify, or the count comes down.
 *
 * Reported on `defines.lua`, at the count itself: that is the number the modder
 * changes.
 */
export function auditGreatPowers(
  definesText: string | undefined,
  candidates: readonly GreatPowerCandidate[],
): Diagnostic[] {
  const seats = greatNationsCount(definesText);
  if (seats === undefined || candidates.length === 0) {
    return [];
  }
  const qualified = candidates.filter(isEligible);
  if (qualified.length >= seats.value) {
    return [];
  }
  return [
    diagnostic(
      'error',
      'too-few-great-powers',
      `GREAT_NATIONS_COUNT seats ${String(seats.value)} great powers, but only ${String(qualified.length)} ` +
        `${qualified.length === 1 ? 'country qualifies' : 'countries qualify'} at ${startDateOf(definesText)}, ` +
        'so the game crashes on load. A country qualifies when history/countries sets it civilized = yes and it owns ' +
        `provinces in at least ${String(STATES_FOR_GREAT_POWER)} state regions of map/region.txt. ` +
        `${nearMisses(candidates)}Lower GREAT_NATIONS_COUNT to ${String(qualified.length)} or make another country qualify.`,
      seats.range,
    ),
  ];
}

function isEligible(candidate: GreatPowerCandidate): boolean {
  return candidate.civilized && candidate.stateCount >= STATES_FOR_GREAT_POWER;
}

/** The countries one requirement away, named so the fix has somewhere to start. */
function nearMisses(candidates: readonly GreatPowerCandidate[]): string {
  const closest = candidates
    .filter((candidate) => !isEligible(candidate) && candidate.stateCount > 0)
    .sort((a, b) => Number(b.civilized) - Number(a.civilized) || b.stateCount - a.stateCount)
    .slice(0, 5);
  if (closest.length === 0) {
    return '';
  }
  const listed = closest.map(
    (candidate) =>
      `${candidate.tag} (${candidate.civilized ? 'civilized' : 'uncivilized'}, ` +
      `${String(candidate.stateCount)} state${candidate.stateCount === 1 ? '' : 's'})`,
  );
  return `Closest to qualifying: ${listed.join(', ')}. `;
}

interface CountValue {
  readonly value: number;
  readonly range: Range;
}

/**
 * `GREAT_NATIONS_COUNT = 8` out of the Lua defines. It is matched rather than
 * parsed: `defines.lua` is Lua, the extension has no Lua parser, and one flat
 * `KEY = number` is all this check needs.
 */
function greatNationsCount(definesText: string | undefined): CountValue | undefined {
  const match = /\bGREAT_NATIONS_COUNT\s*=\s*(\d+)/.exec(definesText ?? '');
  const digits = match?.[1];
  if (!match || digits === undefined) {
    return undefined;
  }
  const start = match.index + match[0].length - digits.length;
  return { value: Number(digits), range: { start, end: start + digits.length } };
}

/** The layered reads a start-date picture of the world needs; injected so the service stays testable. */
export interface StartStateReader {
  readonly startDate: string;
  /** Read a mod-root-relative path over the stack, as the game would. */
  readonly readFile: (relativePath: string) => Promise<string | undefined>;
  /** Merged paths under `history/provinces`, the highest layer of each first. */
  readonly provinceFiles: readonly string[];
  /** Merged paths under `history/countries`, the highest layer of each first. */
  readonly countryFiles: readonly string[];
  /** Province id → the state region it belongs to, from the mod index. */
  readonly stateOfProvince: ReadonlyMap<string, string>;
}

/** Files read together; also how often the pass yields to other requests. */
const BATCH_SIZE = 64;

/**
 * The world as the game sees it at the start date: which tags are civilized,
 * and how many state regions each owns provinces in. Both come from `history/`,
 * where a value can be set at the top of a file and then changed again by a
 * dated block; every block up to the start date counts.
 */
export async function collectGreatPowerCandidates(
  countriesText: string | undefined,
  reader: StartStateReader,
): Promise<GreatPowerCandidate[]> {
  if (countriesText === undefined) {
    return [];
  }
  const statesByTag = await ownedStates(reader);
  const historyByTag = countryHistoryByTag(reader.countryFiles);
  const candidates: GreatPowerCandidate[] = [];
  for (const entry of parseCountryList(countriesText)) {
    const tag = entry.tag.value.toUpperCase();
    const historyFile = historyByTag.get(tag);
    const text = historyFile === undefined ? undefined : await reader.readFile(historyFile);
    candidates.push({
      tag: entry.tag.value,
      civilized: text !== undefined && historyValueAtStart(text, 'civilized', reader.startDate)?.toLowerCase() === 'yes',
      stateCount: statesByTag.get(tag)?.size ?? 0,
    });
  }
  return candidates;
}

/**
 * Tag → its `history/countries` file. The engine takes the tag from the three
 * characters the file name starts with (`ENG - United Kingdom.txt`), not from
 * the path in `common/countries.txt`: that one points at the country
 * definition under `common/countries/`, which is a different file.
 */
function countryHistoryByTag(countryFiles: readonly string[]): ReadonlyMap<string, string> {
  const byTag = new Map<string, string>();
  for (const relativePath of countryFiles) {
    const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    const tag = /^([A-Za-z0-9]{3})(?![A-Za-z0-9])/.exec(name)?.[1]?.toUpperCase();
    // The highest layer comes first; a lower one is the file it replaces.
    if (tag !== undefined && !byTag.has(tag)) {
      byTag.set(tag, relativePath);
    }
  }
  return byTag;
}

/** Tag → the state regions it owns a province in, over every province history file. */
async function ownedStates(reader: StartStateReader): Promise<ReadonlyMap<string, Set<string>>> {
  const byTag = new Map<string, Set<string>>();
  const seenProvinces = new Set<string>();
  for (let start = 0; start < reader.provinceFiles.length; start += BATCH_SIZE) {
    const batch = reader.provinceFiles.slice(start, start + BATCH_SIZE);
    const texts = await Promise.all(batch.map((relativePath) => reader.readFile(relativePath)));
    batch.forEach((relativePath, position) => {
      const provinceId = provinceIdOf(relativePath);
      const text = texts[position];
      // The highest layer of a province comes first; a lower one is the file it replaces.
      if (provinceId === undefined || text === undefined || seenProvinces.has(provinceId)) {
        return;
      }
      seenProvinces.add(provinceId);
      const owner = historyValueAtStart(text, 'owner', reader.startDate)?.toUpperCase();
      const state = reader.stateOfProvince.get(provinceId);
      if (owner === undefined || state === undefined) {
        return;
      }
      const states = byTag.get(owner) ?? new Set<string>();
      states.add(state);
      byTag.set(owner, states);
    });
    await yieldToEventLoop();
  }
  return byTag;
}

/** The engine takes a province's id from the digits its file name starts with. */
function provinceIdOf(relativePath: string): string | undefined {
  return /^(\d+)/.exec(relativePath.slice(relativePath.lastIndexOf('/') + 1))?.[1];
}

/**
 * A history file's value for `key` at the start date: the one at the top of the
 * file, then whatever the dated blocks up to that date set, applied in date
 * order rather than in the order they happen to be written.
 */
export function historyValueAtStart(text: string, key: string, startDate: string): string | undefined {
  const document = parseDocument(text).document;
  const dated = datedBlocks(document, startDate).sort((a, b) => compareDates(a.date, b.date));
  let value = scalarAt(document.entries, key);
  for (const block of dated) {
    value = scalarAt(block.entries, key) ?? value;
  }
  return value;
}

interface DatedEntries {
  readonly date: string;
  readonly entries: Document['entries'];
}

function datedBlocks(document: Document, startDate: string): DatedEntries[] {
  const blocks: DatedEntries[] = [];
  for (const entry of document.entries) {
    if (
      entry.kind === 'assignment' &&
      entry.key.type === 'date' &&
      entry.value.kind === 'block' &&
      compareDates(entry.key.value, startDate) <= 0
    ) {
      blocks.push({ date: entry.key.value, entries: entry.value.entries });
    }
  }
  return blocks;
}

/** The last plain value for `key`; the engine keeps the last of a repeated key. */
function scalarAt(entries: Document['entries'], key: string): string | undefined {
  const lower = key.toLowerCase();
  let found: string | undefined;
  for (const entry of entries) {
    if (entry.kind === 'assignment' && entry.value.kind === 'scalar' && entry.key.value.toLowerCase() === lower) {
      found = entry.value.value;
    }
  }
  return found;
}
