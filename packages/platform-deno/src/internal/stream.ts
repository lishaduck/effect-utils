import { type Cause, type Chunk, Effect } from "effect";
import type * as AsyncInput from "effect/SingleProducerAsyncInput";

/**
 * @category model
 * @since 1.0.0
 */
export interface FromWritableOptions {
  readonly endOnDone?: boolean;
}

/** @internal */
export const writeEffect =
  <A>(
    writable: WritableStream,
  ): ((chunk: Chunk.Chunk<A>) => Effect.Effect<void>) =>
  (chunk: Chunk.Chunk<A>): Effect.Effect<void> =>
    chunk.length === 0
      ? Effect.void
      : Effect.promise(async () => {
          for (const item of chunk) {
            await writable.getWriter().write(item);
          }
        });

/** @internal */
export const writeInput = <IE, A>(
  writable: WritableStream,
  onFailure: (cause: Cause.Cause<IE>) => Effect.Effect<void>,
  onDone = Effect.void,
): AsyncInput.AsyncInputProducer<IE, Chunk.Chunk<A>, unknown> => {
  const write = writeEffect(writable);
  return {
    awaitRead: (): Effect.Effect<void> => Effect.void,
    emit: write,
    error: (cause): Effect.Effect<void> =>
      Effect.zipRight(Effect.promise(writable.close), onFailure(cause)),
    done: (_): Effect.Effect<void> =>
      Effect.zipRight(Effect.promise(writable.close), onDone),
  };
};
