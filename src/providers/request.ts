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
