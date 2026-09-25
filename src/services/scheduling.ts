import { NEVER_CANCELLED, throwIfCancelled, type CancelSignal } from '../model/cancellation.js';

/** Let queued I/O callbacks and requests run before a long computation continues. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Work a long computation reports as it goes: each value is the size, in
 * characters of source, of the unit it has just finished. Yielding the size
 * rather than pausing lets one loop serve both callers below — the language
 * server interleaves it, a test runs it straight through — without the loop
 * itself knowing which.
 */
export type WorkUnits = Generator<number>;

/**
 * Characters of source a computation may get through before the event loop is
 * given a turn. Parsing runs at roughly 50 characters per microsecond, so this
 * is about five milliseconds of work: small enough that a hover queued behind
 * it is not felt, large enough that the pauses themselves cost nothing.
 *
 * One unit is never split, so a single file larger than this still holds the
 * loop for as long as it takes to parse.
 */
const DEFAULT_BUDGET = 256 * 1024;

/** Files read together, so their reads overlap. */
export const READ_BATCH = 64;

/** `read` over every item a batch at a time, yielding to the event loop and reading `signal` between batches. */
export async function readInBatches<Item, Result>(
  items: readonly Item[],
  read: (item: Item) => Promise<Result>,
  signal: CancelSignal = NEVER_CANCELLED,
): Promise<Result[]> {
  const results: Result[] = [];
  for (let start = 0; start < items.length; start += READ_BATCH) {
    throwIfCancelled(signal);
    results.push(...(await Promise.all(items.slice(start, start + READ_BATCH).map(read))));
    await yieldToEventLoop();
  }
  return results;
}

/** Run every unit without pausing. */
export function runToEnd(units: WorkUnits): void {
  let step = units.next();
  while (!step.done) {
    step = units.next();
  }
}

/**
 * Runs work units, giving the event loop a turn whenever the budget is spent.
 * One budget is shared across the units of a whole build, so a run of small
 * steps pauses as often as one long step does.
 *
 * A unit boundary is also where the caller's `signal` is read, so an abandoned
 * request stops within one unit instead of running to the end.
 */
export class YieldBudget {
  private spent = 0;

  constructor(
    private readonly budget: number = DEFAULT_BUDGET,
    private readonly signal: CancelSignal = NEVER_CANCELLED,
  ) {}

  async run(units: WorkUnits): Promise<void> {
    for (const size of units) {
      throwIfCancelled(this.signal);
      this.spent += size;
      if (this.spent >= this.budget) {
        this.spent = 0;
        await yieldToEventLoop();
      }
    }
  }
}
