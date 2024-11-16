import { Effect } from "effect";
import type { FunctionN } from "effect/Function";

export const effectifyPromise =
  <
    // biome-ignore lint/suspicious/noExplicitAny: Otherwise, there's no way to accept anything. Neither `never` nor `unknown` works.
    DenoParams extends any[],
    DenoReturn extends Promise<unknown>,
    MappedError = never,
  >(
    method: FunctionN<DenoParams, DenoReturn>,
    onError: (error: Error, args: DenoParams) => MappedError,
  ) =>
  (...args: DenoParams): Effect.Effect<Awaited<DenoReturn>, MappedError> => {
    return Effect.tryPromise<Awaited<DenoReturn>, MappedError>({
      try: async (): Promise<Awaited<DenoReturn>> => await method(...args),
      catch: (err): MappedError => onError(err as Error, args),
    });
  };

export const effectifyAbortablePromise =
  <
    // biome-ignore lint/suspicious/noExplicitAny: Otherwise, there's no way to accept anything. Neither `never` nor `unknown` works.
    DenoParams extends any[] = never,
    DenoReturn extends Promise<unknown> = Promise<unknown>,
    MappedError = never,
  >(
    method: (signal: AbortSignal) => (...args: DenoParams) => DenoReturn,
    onError: (error: Error, args: DenoParams) => MappedError,
  ) =>
  (...args: DenoParams): Effect.Effect<Awaited<DenoReturn>, MappedError> => {
    return Effect.tryPromise<Awaited<DenoReturn>, MappedError>({
      try: async (signal): Promise<Awaited<DenoReturn>> =>
        await method(signal)(...args),
      catch: (err): MappedError => onError(err as Error, args),
    });
  };
