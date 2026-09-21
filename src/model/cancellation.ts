/**
 * Whether the caller still wants the result. A long operation checks it where
 * it already pauses, so the answer is never more than one unit of work stale.
 *
 * It is an interface rather than a token type so the domain stays free of the
 * protocol: the language server adapts an LSP cancellation token to it.
 */
export interface CancelSignal {
  readonly cancelled: boolean;
}

/** For callers with nothing to cancel: a direct call, a test, a background build. */
export const NEVER_CANCELLED: CancelSignal = { cancelled: false };

/**
 * Thrown to unwind an operation the caller gave up on. It is not a failure and
 * nothing should report it as one; the adapter that owns the request turns it
 * into whatever its protocol says cancellation is.
 */
export class Cancelled extends Error {
  constructor() {
    super('The operation was cancelled.');
    this.name = 'Cancelled';
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof Cancelled;
}

export function throwIfCancelled(signal: CancelSignal): void {
  if (signal.cancelled) {
    throw new Cancelled();
  }
}
