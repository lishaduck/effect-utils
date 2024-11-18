/**
 * @file
 * @since 0.1.0
 */

import * as Worker from "@effect/platform/Worker";
import { WorkerError } from "@effect/platform/WorkerError";
import { Deferred, Effect, Layer, Scope } from "effect";

const platformWorkerImpl = Worker.makePlatform<
  globalThis.Worker | MessagePort
>()({
  setup({
    scope,
    worker,
  }): Effect.Effect<globalThis.Worker | MessagePort, WorkerError> {
    return Effect.as(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          worker.postMessage([1]);
        }),
      ),
      worker,
    );
  },
  listen({ deferred, emit, port, scope }): Effect.Effect<void> {
    function onMessage(event: MessageEvent): void {
      emit(event.data);
    }
    function onError(event: ErrorEvent): void {
      Deferred.unsafeDone(
        deferred,
        new WorkerError({
          reason: "unknown",
          cause: event.error ?? event.message,
        }),
      );
    }

    port.addEventListener("message", onMessage as EventListener);
    port.addEventListener("error", onError as EventListener);
    if ("start" in port) {
      port.start();
    }
    return Scope.addFinalizer(
      scope,
      Effect.sync(() => {
        port.removeEventListener("message", onMessage as EventListener);
        port.removeEventListener("error", onError as EventListener);
      }),
    );
  },
});

/**
 * @since 0.1.0
 * @category layers
 */
export const layerWorker: Layer.Layer<Worker.PlatformWorker> = Layer.succeed(
  Worker.PlatformWorker,
  platformWorkerImpl,
);

/**
 * @since 0.1.0
 * @category layers
 */
export const layerManager: Layer.Layer<Worker.WorkerManager> = Layer.provide(
  Worker.layerManager,
  layerWorker,
);

/**
 * @since 0.1.0
 * @category layers
 */
export const layer = (
  spawn: (id: number) => globalThis.Worker | MessagePort,
): Layer.Layer<Worker.Spawner | Worker.WorkerManager> =>
  Layer.merge(layerManager, Worker.layerSpawner(spawn));
