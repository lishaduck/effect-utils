/**
 * This modules exposes primitives for multithread-communication using the standard {@linkcode MessagePort} API.
 * @module
 *
 * @since 1.0.0
 */
import { WorkerRunner as Runner, WorkerError } from "@effect/platform";
import {
  Context,
  Deferred,
  Effect,
  ExecutionStrategy,
  Exit,
  FiberId,
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
 * Constructs a {@linkplain Runner.PlatformRunner | runner} from a {@linkcode MessagePort}.
 *
 * @since 1.0.0
 * @category constructors
 */
export const make: (self: MessagePort | Window) => Runner.PlatformRunner = (
  self: MessagePort | Window,
) =>
  Runner.PlatformRunner.of({
    [Runner.PlatformRunnerTypeId]: Runner.PlatformRunnerTypeId,
    start<I, O>(): Effect.Effect<
      Runner.BackingRunner<I, O>,
      WorkerError.WorkerError
    > {
      return Effect.sync(() => {
        let currentPortId = 0;

        const ports = new Map<
          number,
          readonly [MessagePort, Scope.CloseableScope]
        >();
        const send = (
          portId: number,
          message: O,
          transfer?: readonly unknown[],
        ): Effect.Effect<void> =>
          Effect.sync(() => {
            (ports.get(portId)?.[0] ?? (self as MessagePort)).postMessage(
              [1, message],
              {
                transfer: transfer as Transferable[],
              },
            );
          });

        const run = <A, E, R>(
          handler: (portId: number, message: I) => Effect.Effect<A, E, R>,
        ): Effect.Effect<
          never,
          WorkerError.WorkerError | E,
          Exclude<R, Scope.Scope>
        > =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const scope = yield* Effect.scope;
              const runtime = (yield* Effect.runtime<R | Scope.Scope>()).pipe(
                Runtime.updateContext(Context.omit(Scope.Scope)),
              ) as Runtime.Runtime<R>;
              const fiberSet = yield* FiberSet.make<
                unknown,
                WorkerError.WorkerError | E
              >();
              const runFork = Runtime.runFork(runtime);

              function onMessage(portId: number) {
                // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: It's fine. I guess.
                return (event: MessageEvent): void => {
                  const message = (event as MessageEvent)
                    .data as Runner.BackingRunner.Message<I>;
                  if (message[0] === 0) {
                    FiberSet.unsafeAdd(
                      fiberSet,
                      runFork(restore(handler(portId, message[1]))),
                    );
                  } else {
                    const port = ports.get(portId);
                    if (port) {
                      Effect.runFork(Scope.close(port[1], Exit.void));
                    }
                    ports.delete(portId);
                    if (ports.size === 0) {
                      Deferred.unsafeDone(
                        fiberSet.deferred,
                        Exit.interrupt(FiberId.none),
                      );
                    }
                  }
                };
              }
              function onMessageError(error: MessageEvent): void {
                Deferred.unsafeDone(
                  fiberSet.deferred,
                  new WorkerError.WorkerError({
                    reason: "decode",
                    cause: error.data,
                  }),
                );
              }
              function onError(error: MessageEvent): void {
                Deferred.unsafeDone(
                  fiberSet.deferred,
                  new WorkerError.WorkerError({
                    reason: "unknown",
                    cause: error.data,
                  }),
                );
              }
              function handlePort(port: MessagePort): void {
                const fiber = Scope.fork(
                  scope,
                  ExecutionStrategy.sequential,
                ).pipe(
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
                FiberSet.unsafeAdd(fiberSet, fiber);
              }
              self.addEventListener("error", onError as EventListener);
              let prevOnConnect: unknown | undefined;
              if ("onconnect" in self) {
                prevOnConnect = self.onconnect;
                self.onconnect = (event: MessageEvent): void => {
                  // biome-ignore lint/style/noNonNullAssertion: I don't want to break this fragile code.
                  const port = (event as MessageEvent).ports[0]!;
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
                handlePort(self as MessagePort);
              }
              yield* Scope.addFinalizer(
                scope,
                Effect.sync(() => {
                  self.removeEventListener("error", onError as EventListener);
                  if ("onconnect" in self) {
                    self.onconnect = prevOnConnect;
                  }
                }),
              );

              return (yield* restore(FiberSet.join(fiberSet))) as never;
            }).pipe(Effect.scoped),
          );

        return { run, send };
      });
    },
  });

/**
 * A {@linkplain Layer.Layer | layer} that provides a {@linkcode Runner.PlatformRunner | PlatformRunner} from {@linkcode self} to your app.
 *
 * @since 1.0.0
 * @category layers
 */
export const layer: Layer.Layer<Runner.PlatformRunner> = Layer.sync(
  Runner.PlatformRunner,
  () => make(self),
);

/**
 * A {@linkplain Layer.Layer | layer} that provides a {@linkcode Runner.PlatformRunner | PlatformRunner} from a {@linkcode MessagePort} to your app.
 *
 * @since 1.0.0
 * @category layers
 */
export const layerMessagePort: (
  port: MessagePort | Window,
) => Layer.Layer<Runner.PlatformRunner> = (port: MessagePort | Window) =>
  Layer.succeed(Runner.PlatformRunner, make(port));
