import * as assert from 'node:assert';
import { Cancelled } from '../../model/cancellation.js';
import { readInBatches, runToEnd, YieldBudget, type WorkUnits } from '../../services/scheduling.js';

/** Records the order units run in, reporting each one's size. */
function counter(sizes: readonly number[], log: number[]): () => WorkUnits {
  return function* units(): WorkUnits {
    for (const [position, size] of sizes.entries()) {
      log.push(position);
      yield size;
    }
  };
}

suite('scheduling — work units', () => {
  test('runToEnd runs every unit', () => {
    const log: number[] = [];
    runToEnd(counter([1, 2, 3], log)());
    assert.deepStrictEqual(log, [0, 1, 2]);
  });

  test('a generator is lazy, so nothing runs until it is driven', () => {
    const log: number[] = [];
    const units = counter([1, 2, 3], log);
    units();
    assert.deepStrictEqual(log, []);
  });

  test('the budget runs every unit too', async () => {
    const log: number[] = [];
    await new YieldBudget(10).run(counter([1, 2, 3], log)());
    assert.deepStrictEqual(log, [0, 1, 2]);
  });

  test('it pauses once the units since the last pause pass the budget', async () => {
    let done = 0;
    function* units(): WorkUnits {
      for (const size of [40, 40, 40, 40, 40]) {
        done += 1;
        yield size;
      }
    }
    // A pause is a turn of the event loop, so a callback queued before the run
    // gets to see how far the work had got when the first one happened.
    let atFirstPause = -1;
    setImmediate(() => { atFirstPause = done; });
    await new YieldBudget(100).run(units());
    // 40 + 40 + 40 is the first total to reach 100.
    assert.strictEqual(atFirstPause, 3);
    assert.strictEqual(done, 5);
  });

  test('one budget spans several runs, so a stream of small steps still pauses', async () => {
    const budget = new YieldBudget(100);
    let stage = 'before';
    let pausedDuring = 'never';
    setImmediate(() => { pausedDuring = stage; });
    function* one(): WorkUnits {
      yield 60;
    }
    stage = 'first';
    await budget.run(one());
    stage = 'second';
    await budget.run(one());
    // 60 alone stays under; 60 + 60 crosses, so the pause falls in the second run.
    assert.strictEqual(pausedDuring, 'second');
  });

  test('a unit larger than the whole budget is still never split', async () => {
    const seen: number[] = [];
    function* one(): WorkUnits {
      seen.push(1);
      yield 10_000;
      seen.push(2);
    }
    await new YieldBudget(100).run(one());
    assert.deepStrictEqual(seen, [1, 2]);
  });
});

suite('scheduling — readInBatches', () => {
  test('reads every item in order and gives the loop a turn between batches', async () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    let turns = 0;
    let watching = true;
    const observe = (): void => { turns++; if (watching) { setImmediate(observe); } };
    setImmediate(observe);
    const results = await readInBatches(items, (i) => Promise.resolve(i * 2));
    watching = false;
    assert.deepStrictEqual(results, items.map((i) => i * 2));
    assert.ok(turns >= 2, `expected the loop to turn between three batches, saw ${String(turns)}`);
  });

  test('a cancelled signal stops the pass at a batch boundary', async () => {
    let read = 0;
    const signal = { get cancelled(): boolean { return read >= 64; } };
    await assert.rejects(
      readInBatches(Array.from({ length: 200 }, (_, i) => i), (i) => { read++; return Promise.resolve(i); }, signal),
      Cancelled,
    );
    assert.strictEqual(read, 64);
  });
});
