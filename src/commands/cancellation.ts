/**
 * Whether a rejected request was cancelled rather than broken. The server
 * answers a cancelled request with the protocol's own code, which reaches the
 * client as an error; it is the expected end of a cancelled run, so the command
 * that asked closes quietly instead of reporting a failure.
 */
const REQUEST_CANCELLED = -32800;
/** What the client raises when it cancels before the server has answered. */
const CANCELLATION_MESSAGE = 'Canceled';

export function isCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code: unknown = (error as { code?: unknown }).code;
  const name: unknown = (error as { name?: unknown }).name;
  return code === REQUEST_CANCELLED || name === CANCELLATION_MESSAGE;
}
