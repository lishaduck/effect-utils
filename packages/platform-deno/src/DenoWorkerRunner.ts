/**
 * This modules exposes primitives for multithread-communication using the standard {@linkcode MessagePort} API.
 * @module
 *
 * @since 0.1.1
 */

import { WorkerRunner as Runner, WorkerError } from "@effect/platform";
import {
  Cause,
  Context,
  Deferred,
  Effect,
  ExecutionStrategy,
  Exit,
  FiberSet,
  Layer,
  Runtime,
  Scope,
} from "effect";
import { globalValue } from "effect/GlobalValue";

const cachedPorts = globalValue(
  "@lishaduck/effect-platform-deno/Worker/cachedPorts",
  () => new Set<MessagePort>(),
);
function globalHandleConnect(event: MessageEvent): void {
  // biome-ignore lint/style/noNonNullAssertion: I don't want to break this fragile code.
  cachedPorts.add((event as MessageEvent).ports[0]!);
}
if (typeof self !== "undefined" && "onconnect" in self) {
  self.onconnect = globalHandleConnect;
}

/**
 * Just a simple alias for {@linkcode globalThis} and {@linkcode MessagePort}.
 *
 * @internal
 */
export type Self = typeof globalThis | MessagePort;

/**
 * Constructs a {@linkplain Runner.PlatformRunner | runner} from a {@linkcode MessagePort}.
 *
 * @since 0.1.1
 * @category constructors
 */
export const make: (self: Self) => Runner.PlatformRunner = (self: Self) =>
  Runner.PlatformRunner.of({
    [Runner.PlatformRunnerTypeId]: Runner.PlatformRunnerTypeId,
    start<I, O>(
      closeLatch: Deferred.Deferred<void, WorkerError.WorkerError>,
    ): Effect.Effect<Runner.BackingRunner<I, O>, WorkerError.WorkerError> {
      return Effect.sync(() => {
        let currentPortId = 0;

        const ports = new Map<number, readonly [Self, Scope.CloseableScope]>();
        const send = (
          portId: number,
          message: O,
          transfer?: readonly unknown[],
        ): Effect.Effect<void> =>
          Effect.sync(() => {
            (ports.get(portId)?.[0] ?? self).postMessage([1, message], {
              transfer: transfer as Transferable[],
            });
          });

        const run = Effect.fnUntraced(function* <A, E, R>(
          handler: (portId: number, message: I) => Effect.Effect<A, E, R>,
        ) {
          const scope = yield* Effect.scope;
          const runtime = (yield* Effect.interruptible(
            Effect.runtime<R | Scope.Scope>(),
          )).pipe(
            Runtime.updateContext(Context.omit(Scope.Scope)),
          ) as Runtime.Runtime<R>;
          const fiberSet = yield* FiberSet.make<
            unknown,
            WorkerError.WorkerError | E
          >();
          const runFork = Runtime.runFork(runtime);
          function onExit(exit: Exit.Exit<unknown, E>): void {
            if (exit._tag === "Failure") {
              Deferred.unsafeDone(
                closeLatch,
                Exit.die(Cause.squash(exit.cause)),
              );
            }
          }

          function onMessage(portId: number): (event: Event) => void {
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: It's fine. I guess.
            return (event: Event): void => {
              const message = (event as MessageEvent)
                .data as Runner.BackingRunner.Message<I>;
              if (message[0] === 0) {
                const fiber = runFork(handler(portId, message[1]));
                fiber.addObserver(onExit);
                FiberSet.unsafeAdd(fiberSet, fiber);
              } else {
                const port = ports.get(portId);

                if (!port) {
                  return;
                }

                if (ports.size === 1) {
                  // let the last port close with the outer scope
                  Deferred.unsafeDone(closeLatch, Exit.void);

                  return;
                }
                ports.delete(portId);
                Effect.runFork(Scope.close(port[1], Exit.void));
              }
            };
          }
          function onMessageError(error: Event): void {
            Deferred.unsafeDone(
              closeLatch,
              new WorkerError.WorkerError({
                reason: "decode",
                cause: (error as MessageEvent).data,
              }),
            );
          }
          function onError(error: Event): void {
            Deferred.unsafeDone(
              closeLatch,
              new WorkerError.WorkerError({
                reason: "unknown",
                cause: (error as MessageEvent).data,
              }),
            );
          }
          function handlePort(port: Self): void {
            const fiber = Scope.fork(scope, ExecutionStrategy.sequential).pipe(
              Effect.flatMap((scope) => {
                const portId = currentPortId++;
                ports.set(portId, [port, scope]);
                const onMsg = onMessage(portId);
                port.addEventListener("message", onMsg);
                port.addEventListener("messageerror", onMessageError);
                if ("start" in port) {
                  port.start();
                }
                port.postMessage([0]);
                return Scope.addFinalizer(
                  scope,
                  Effect.sync(() => {
                    port.removeEventListener("message", onMsg);
                    port.removeEventListener("messageerror", onError);
                    port.close();
                  }),
                );
              }),
              runFork,
            );
            fiber.addObserver(onExit);
            FiberSet.unsafeAdd(fiberSet, fiber);
          }
          self.addEventListener("messageerror", onError);
          let prevOnConnect: unknown | undefined;
          if ("onconnect" in self) {
            prevOnConnect = self.onconnect;
            self.onconnect = (event: MessageEvent): void => {
              // biome-ignore lint/style/noNonNullAssertion: We know it's there. Maybe.
              const port = event.ports[0]!;
              handlePort(port);
            };
            for (const port of cachedPorts) {
              handlePort(port);
            }
            cachedPorts.clear();
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => self.close()),
            );
          } else {
            handlePort(self);
          }
          yield* Scope.addFinalizer(
            scope,
            Effect.sync(() => {
              self.removeEventListener("messageerror", onError);
              if ("onconnect" in self) {
                self.onconnect = prevOnConnect;
              }
            }),
          );
        });

        return { run, send };
      });
    },
  });

/**
 * A {@linkplain Layer.Layer | layer} that provides a {@linkcode Runner.PlatformRunner | PlatformRunner} from {@linkcode self} to your app.
 *
 * @since 0.1.1
 * @category layers
 */
export const layer: Layer.Layer<Runner.PlatformRunner> = Layer.sync(
  Runner.PlatformRunner,
  // globalThis in a Web Worker is a MessagePort.
  () => make(globalThis as unknown as MessagePort),
);

/**
 * A {@linkplain Layer.Layer | layer} that provides a {@linkcode Runner.PlatformRunner | PlatformRunner} from a {@linkcode MessagePort} to your app.
 * Note that if you try to pass in {@linkcode window}, you may need a type assertion.
 *
 * @since 0.1.1
 * @category layers
 */
export const layerMessagePort: (
  port: MessagePort,
) => Layer.Layer<Runner.PlatformRunner> = (port: MessagePort) =>
  Layer.succeed(Runner.PlatformRunner, make(port));

// biome-ignore lint/performance/noBarrelFile: We need it for compatibility.
export {
  /**
   * @since 0.1.2
   * @category re-exports
   */
  launch,
} from "@effect/platform/WorkerRunner";
