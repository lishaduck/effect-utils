import * as Channel from "effect/Channel";
import type * as Chunk from "effect/Chunk";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import type { LazyArg } from "effect/Function";
import * as Sink from "effect/Sink";
import { writeInput } from "./stream.ts";

/** @internal */
export const fromWritable = <E, A = Uint8Array | string>(
  evaluate: LazyArg<WritableStream>,
  onError: (error: unknown) => E,
): Sink.Sink<void, A, never, E> =>
  Sink.fromChannel(fromWritableChannel(evaluate, onError));

/** @internal */
export const fromWritableChannel = <IE, OE, A>(
  writable: LazyArg<WritableStream>,
  onError: (error: unknown) => OE,
): Channel.Channel<
  Chunk.Chunk<never>,
  Chunk.Chunk<A>,
  IE | OE,
  IE,
  void,
  unknown
> =>
  Channel.flatMap(
    Effect.zip(
      Effect.sync(() => writable()),
      Deferred.make<void, IE | OE>(),
    ),
    ([writable, deferred]) =>
      Channel.embedInput(
        writableOutput(writable, deferred, onError),
        writeInput<IE, A>(
          writable,
          (cause) => Deferred.failCause(deferred, cause),
          Deferred.complete(deferred, Effect.void),
        ),
      ),
  );

const writableOutput = <IE, E>(
  writable: WritableStream,
  deferred: Deferred.Deferred<void, IE | E>,
  onError: (error: unknown) => E,
): Effect.Effect<void, IE | E> =>
  Effect.suspend(() => {
    function handleError(err: unknown): void {
      Deferred.unsafeDone(deferred, Effect.fail(onError(err)));
    }

    void writable.getWriter().closed.catch(handleError);
    return Deferred.await(deferred);
  });
