import { WorkerRunner as Runner } from "@effect/platform";
import { Context, Effect, Layer, Option, Stream } from "effect";
import * as DenoRunner from "../../src/DenoWorkerRunner.ts";
import { Person, User, WorkerMessage } from "./schema.ts";

interface Name {
  readonly _: unique symbol;
}
const Name = Context.GenericTag<Name, string>("Name");

const WorkerLive = Runner.layerSerialized(WorkerMessage, {
  GetPersonById: (req): Stream.Stream<Person> =>
    Stream.make(
      new Person({ id: req.id, name: "test", data: new Uint8Array([1, 2, 3]) }),
      new Person({ id: req.id, name: "ing", data: new Uint8Array([4, 5, 6]) }),
    ),
  GetUserById: (req): Effect.Effect<User, never, Name> =>
    Effect.map(Name, (name) => new User({ id: req.id, name })),
  InitialMessage: (req): Layer.Layer<Name> => Layer.succeed(Name, req.name),
  GetSpan: (): Effect.Effect<
    {
      traceId: string;
      spanId: string;
      name: string;
      parent: Option.Option<{ traceId: string; spanId: string }>;
    },
    never,
    never
  > =>
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        name: span.name,
        parent: Option.map(span.parent, (span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
        })),
      };
    }).pipe(Effect.withSpan("GetSpan")),
  RunnerInterrupt: (): Effect.Effect<never> => Effect.interrupt,
}).pipe(Layer.provide(DenoRunner.layer));

Effect.runFork(Layer.launch(WorkerLive));
