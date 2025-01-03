/**
 * This module provides Deno primitives for the Effect ecosystem.
 * @module
 *
 * @example
 * ```ts
 * import { Path } from "@effect/platform";
 * import { DenoContext, DenoRuntime } from "@lishaduck/effect-platform-deno";
 * import { assertEquals } from "@std/assert";
 * import { Console, Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   // Access the Path service
 *   const path = yield* Path.Path;
 *
 *   // Join parts of a path to create a complete file path
 *   const tmpPath = path.join("tmp", "file.txt");
 *
 *   assertEquals(tmpPath, "tmp/file.txt");
 * });
 *
 * DenoRuntime.runMain(program.pipe(Effect.provide(DenoContext.layer)));
 * ```
 */

export * as DenoContext from "./DenoContext.ts";
export * as DenoFileSystem from "./DenoFileSystem.ts";
export * as DenoKeyValueStore from "./DenoKeyValueStore.ts";
export * as DenoRuntime from "./DenoRuntime.ts";
export * as DenoPath from "./DenoPath.ts";
export * as DenoWorker from "./DenoWorker.ts";
export * as DenoWorkerRunner from "./DenoWorkerRunner.ts";
