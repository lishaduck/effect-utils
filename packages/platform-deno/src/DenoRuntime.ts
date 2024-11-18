/**
 * @file
 * @since 0.1.0
 */

import { type RunMain, makeRunMain } from "@effect/platform/Runtime";
import { constVoid } from "effect/Function";

/**
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
