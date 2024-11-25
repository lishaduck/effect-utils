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

/**
 * Provides a platform context using Deno.
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
 *   const fileName = path.basename("some/directory/file.txt");
 *
 *   assertEquals(fileName, "file.txt");
 * });
 *
 * DenoRuntime.runMain(program.pipe(Effect.provide(DenoContext.layer)));
 * ```
 *
 * @since 0.1.0
 */
export * as DenoContext from "./DenoContext.ts";

/**
 * An effect runtime using Deno.
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
export * as DenoRuntime from "./DenoRuntime.ts";

/**
 * @since 0.1.0
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
 *   const extension = path.extname("file.txt");
 *
 *   assertEquals(extension, ".txt");
 * });
 *
 * DenoRuntime.runMain(program.pipe(Effect.provide(DenoContext.layer)));
 * ```
 *
 */
export * as DenoPath from "./DenoPath.ts";

/**
 * @since 0.1.0
 */
export * as DenoWorker from "./DenoWorker.ts";
