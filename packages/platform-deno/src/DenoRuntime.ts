/**
 * This module exposes an {@link https://effect.website/docs/runtime/ | Effect Runtime} powered by Deno.
 * @module
 *
 * @example
 * ```ts
 * import { DenoContext, DenoRuntime } from "@lishaduck/effect-platform-deno";
 * import { Console, Effect } from "effect";
 *
 * DenoRuntime.runMain(Console.log("Hello, World").pipe(Effect.provide(DenoContext.layer)));
 * ```
 *
 * @since 0.1.0
 */

import { type RunMain, makeRunMain } from "@effect/platform/Runtime";
import { constVoid } from "effect/Function";

/**
 * Run an Effect as the entrypoint to a Deno application.
 *
 * @since 0.1.0
 * @category runtime
 */
export const runMain: RunMain = makeRunMain(({ fiber, teardown }) => {
  const keepAlive = setInterval(constVoid, 2 ** 31 - 1);
  let receivedSignal = false;

  fiber.addObserver((exit) => {
    if (!receivedSignal) {
      Deno.removeSignalListener("SIGINT", onSigint);
      Deno.removeSignalListener("SIGTERM", onSigint);
    }
    clearInterval(keepAlive);
    teardown(exit, (code) => {
      if (receivedSignal || code !== 0) {
        Deno.exit(code);
      }
    });
  });

  function onSigint(): void {
    receivedSignal = true;
    Deno.removeSignalListener("SIGINT", onSigint);
    Deno.removeSignalListener("SIGTERM", onSigint);
    fiber.unsafeInterruptAsFork(fiber.id());
  }

  Deno.addSignalListener("SIGINT", onSigint);
  Deno.addSignalListener("SIGTERM", onSigint); // Not supported on Windows.
});
