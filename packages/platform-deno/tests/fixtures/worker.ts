import { WorkerRunner as Runner } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";
import * as DenoRunner from "../../src/DenoWorkerRunner.ts";

const WorkerLive = Runner.layer((n: number) => Stream.range(0, n)).pipe(
  Layer.provide(DenoRunner.layer),
);

Effect.runFork(Runner.launch(WorkerLive));
