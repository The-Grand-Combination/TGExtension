import type { PageMessage } from '../services/mapEditorMessages.js';

/**
 * The one door to the extension. Every message out goes through the shared
 * union, so a payload that drifts from what the extension validates fails to
 * compile here rather than being dropped there.
 */

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();

export function post(message: PageMessage): void {
  vscode.postMessage(message);
}

export function log(message: string): void {
  post({ type: 'log', message: message });
}

/** An unknown thrown value as text; a page error must never be swallowed. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
