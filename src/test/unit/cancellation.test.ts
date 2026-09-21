import * as assert from 'node:assert';
import { Cancelled, isCancelled, NEVER_CANCELLED, throwIfCancelled } from '../../model/cancellation.js';
import { runToEnd, YieldBudget, type WorkUnits } from '../../services/scheduling.js';

/** A signal the test flips, the way a cancellation token flips under a running request. */
function switchable(): { signal: { readonly cancelled: boolean }; cancel: () => void } {
  let cancelled = false;
  return {
    signal: { get cancelled(): boolean { return cancelled; } },
    cancel: (): void => { cancelled = true; },
  };
}

suite('cancellation', () => {
  test('a signal that never fires lets throwIfCancelled through', () => {
    assert.doesNotThrow(() => { throwIfCancelled(NEVER_CANCELLED); });
  });

  test('a fired signal throws Cancelled, which is recognisable', () => {
    assert.throws(() => { throwIfCancelled({ cancelled: true }); }, (error: unknown) => isCancelled(error));
  });

  test('an ordinary error is not mistaken for cancellation', () => {
    assert.ok(!isCancelled(new Error('boom')));
    assert.ok(!isCancelled(undefined));
  });

  test('a cancelled budget stops at the next unit instead of running on', async () => {
    const { signal, cancel } = switchable();
    let done = 0;
    function* units(): WorkUnits {
      for (let index = 0; index < 100; index += 1) {
        done += 1;
        if (done === 3) {
          cancel();
        }
        yield 1;
      }
    }
    await assert.rejects(new YieldBudget(1000, signal).run(units()), (error: unknown) => isCancelled(error));
    // The unit that was already running finishes; the next one does not start.
    assert.strictEqual(done, 3);
  });

  test('a budget with no signal runs to the end', async () => {
    let done = 0;
    function* units(): WorkUnits {
      for (let index = 0; index < 5; index += 1) {
        done += 1;
        yield 1;
      }
    }
    await new YieldBudget(1000).run(units());
    assert.strictEqual(done, 5);
  });

  test('runToEnd ignores cancellation entirely, which is what a direct caller wants', () => {
    let done = 0;
    function* units(): WorkUnits {
      for (let index = 0; index < 5; index += 1) {
        done += 1;
        yield 1;
      }
    }
    runToEnd(units());
    assert.strictEqual(done, 5);
  });

  test('Cancelled is an Error, so nothing that catches Error swallows it silently', () => {
    const error = new Cancelled();
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, 'Cancelled');
  });
});
