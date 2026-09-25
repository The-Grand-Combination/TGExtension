/** A callback outside any request, with its failures logged under `label` instead of ending the process. */
export function guarded<A extends unknown[]>(
  label: string,
  log: (message: string) => void,
  callback: (...args: A) => void,
): (...args: A) => void {
  return (...args: A): void => {
    try {
      callback(...args);
    } catch (error: unknown) {
      log(`${label} failed: ${describeError(error)}`);
    }
  };
}

/** For the end of a promise chain: `.catch(logFailure('label', log))`. */
export function logFailure(label: string, log: (message: string) => void): (error: unknown) => void {
  return (error: unknown): void => {
    log(`${label} failed: ${describeError(error)}`);
  };
}

export function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
