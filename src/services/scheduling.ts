/** Let queued I/O callbacks and requests run before a long computation continues. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
