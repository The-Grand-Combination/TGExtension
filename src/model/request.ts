/**
 * An LSP request method that carries its parameter and result types. The brand
 * is erased at compile time: the value is the method string the protocol sees,
 * so a descriptor is accepted anywhere a method name is.
 */
export type RequestDescriptor<TParams, TResult> = string & {
  readonly __params: TParams;
  readonly __result: TResult;
};

export function requestDescriptor<TParams, TResult>(method: string): RequestDescriptor<TParams, TResult> {
  // The brand has no runtime representation, so the cast is the whole implementation.
  return method as RequestDescriptor<TParams, TResult>;
}
