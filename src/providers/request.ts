import type { CancellationToken } from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { RequestDescriptor } from '../model/request.js';

/**
 * Send a request the descriptor's way: the method, its parameters and its
 * result are checked against one declaration, so a mismatched pair no longer
 * compiles. An `undefined` parameter type takes no argument.
 */
export function request<TParams, TResult>(
  client: LanguageClient,
  descriptor: RequestDescriptor<TParams, TResult>,
  // The tuple stops the conditional from distributing over a union parameter type.
  ...params: [TParams] extends [undefined] ? [] : [TParams]
): Promise<TResult> {
  const [first] = params;
  return first === undefined
    ? client.sendRequest<TResult>(descriptor)
    : client.sendRequest<TResult>(descriptor, first);
}

/**
 * The same, for a request the user may give up on. Cancelling tells the server
 * to stop rather than only dropping the answer, so a long report does not keep
 * a core busy after the notification is dismissed.
 */
export function cancellableRequest<TParams, TResult>(
  client: LanguageClient,
  descriptor: RequestDescriptor<TParams, TResult>,
  params: TParams,
  token: CancellationToken,
): Promise<TResult> {
  return client.sendRequest<TResult>(descriptor, params, token);
}
