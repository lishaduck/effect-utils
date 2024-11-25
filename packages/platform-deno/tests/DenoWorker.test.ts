import "@vitest/web-worker";
import { Worker as EffectWorker, type WorkerError } from "@effect/platform";
import { describe, it } from "@effect/vitest";
import { Chunk, Effect, Exit, Option, type Scope, Stream, pipe } from "effect";
import * as DenoWorker from "../src/DenoWorker.ts";
import {
  GetPersonById,
  GetSpan,
  GetUserById,
  InitialMessage,
  Person,
  RunnerInterrupt,
  User,
  type WorkerMessage,
} from "./fixtures/schema.ts";

/**
 * A partial polyfill of `importMetaResolve`.
 *
 * A function that returns resolved specifier as if it would be imported using `import(specifier)`.
 *
 * ```ts
 * console.log(importMetaResolve("./foo.js"));
 * // file:///dev/foo.js
 * ```
 * @param specifier - A relative path specifier.
 * @returns A `file://` path.
 */
const importMetaResolve = (specifier: string): string =>
  new URL(specifier, import.meta.url).toString();

describe.sequential("Worker", () => {
  it.scoped("executes streams", ({ expect }) =>
    Effect.gen(function* () {
      const pool = yield* EffectWorker.makePool<number, never, number>({
        size: 1,
      });
      const items = yield* pipe(pool.execute(99), Stream.runCollect);
      expect(items.length).toStrictEqual(100);
    }).pipe(
      Effect.provide(
        DenoWorker.layer(
          () => new Worker(importMetaResolve("./fixtures/worker.ts")),
        ),
      ),
    ),
  );

  it.scoped("Serialized", ({ expect }) =>
    Effect.gen(function* () {
      const pool = yield* EffectWorker.makePoolSerialized({ size: 1 });
      const people = yield* pipe(
        pool.execute(new GetPersonById({ id: 123 })),
        Stream.runCollect,
      );
      expect(Chunk.toReadonlyArray(people)).toStrictEqual([
        new Person({ id: 123, name: "test", data: new Uint8Array([1, 2, 3]) }),
        new Person({ id: 123, name: "ing", data: new Uint8Array([4, 5, 6]) }),
      ]);
    }).pipe(
      Effect.provide(
        DenoWorker.layer(
          () => new Worker(importMetaResolve("./fixtures/serializedWorker.ts")),
        ),
      ),
    ),
  );

  it.scoped("Serialized with initialMessage", ({ expect }) =>
    Effect.gen(function* () {
      const pool = yield* EffectWorker.makePoolSerialized<WorkerMessage>({
        size: 1,
        initialMessage: (): InitialMessage =>
          new InitialMessage({
            name: "custom",
            data: new Uint8Array([1, 2, 3]),
          }),
      });
      let user = yield* pool.executeEffect(new GetUserById({ id: 123 }));
      user = yield* pool.executeEffect(new GetUserById({ id: 123 }));
      expect(user).toStrictEqual(new User({ id: 123, name: "custom" }));
      const people = yield* pipe(
        pool.execute(new GetPersonById({ id: 123 })),
        Stream.runCollect,
      );
      expect(Chunk.toReadonlyArray(people)).toStrictEqual([
        new Person({ id: 123, name: "test", data: new Uint8Array([1, 2, 3]) }),
        new Person({ id: 123, name: "ing", data: new Uint8Array([4, 5, 6]) }),
      ]);
    }).pipe(
      Effect.provide(
        DenoWorker.layer(
          () => new Worker(importMetaResolve("./fixtures/serializedWorker.ts")),
        ),
      ),
    ),
  );

  it.scoped("tracing", ({ expect }) =>
    Effect.gen(function* () {
      const parentSpan = yield* Effect.currentSpan;
      const pool = yield* EffectWorker.makePoolSerialized({
        size: 1,
      });
      const span = yield* pipe(
        pool.executeEffect(new GetSpan()),
        Effect.tapErrorCause(Effect.log),
      );
      expect(span.parent).toStrictEqual(
        Option.some({
          traceId: parentSpan.traceId,
          spanId: parentSpan.spanId,
        }),
      );
    }).pipe(
      Effect.withSpan("test"),
      Effect.provide(
        DenoWorker.layer(
          () => new Worker(importMetaResolve("./fixtures/serializedWorker.ts")),
        ),
      ),
    ),
  );

  // TODO: vitest/web-worker doesn't support postMessage throwing errors
  //   it("send error", () =>
  //     Effect.gen(function* () {
  //       const pool = yield* EffectWorker.makePool<number, never, number>({
  //         spawn: () => new Worker(importMetaResolve("./fixtures/worker.ts")),
  //         transfers(_message) {
  //           return [new Uint8Array([1, 2, 3])];
  //         },
  //         size: 1,
  //       });
  //       return yield* pipe(pool.execute(99), Stream.runCollect, Effect.flip);
  //     }).pipe(
  //       Effect.scoped,
  //       Effect.provide(EffectWorker.layerManager),
  //       Effect.runPromise,
  //     ));

  it.scoped(
    "interrupt runner",
    ({ expect }): Effect.Effect<void, WorkerError.WorkerError, Scope.Scope> =>
      Effect.gen(function* () {
        const pool = yield* EffectWorker.makePoolSerialized<WorkerMessage>({
          size: 1,
          initialMessage: (): InitialMessage =>
            new InitialMessage({
              name: "custom",
              data: new Uint8Array([1, 2, 3]),
            }),
        });

        const exit = yield* pool
          .execute(new RunnerInterrupt())
          .pipe(Stream.runDrain, Effect.exit);
        expect(Exit.isInterrupted(exit)).toBe(true);
      }).pipe(
        Effect.provide(
          DenoWorker.layer(
            () =>
              new Worker(importMetaResolve("./fixtures/serializedWorker.ts")),
          ),
        ),
      ),
  );
});
