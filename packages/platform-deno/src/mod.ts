/**
 * @file
 *
 * ```ts
 * import { Path } from "@effect/platform";
 * import { DenoContext, DenoRuntime } from "@lishaduck/effect-platform-deno";
 * import { Console, Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   // Access the Path service
 *   const path = yield* Path.Path;
 *
 *   // Join parts of a path to create a complete file path
 *   const tmpPath = path.join("tmp", "file.txt");
 *
 *   yield* Console.log(tmpPath);
 * });
 *
 * DenoRuntime.runMain(program.pipe(Effect.provide(DenoContext.layer)));
 * ```
 */

/**
 * Provides a platform context using Deno.
 *
 * @since 0.1.0
 */
export * as DenoContext from "./DenoContext.ts";

/**
 * An effect runtime using Deno.
 *
 * @since 0.1.0
 */
export * as DenoRuntime from "./DenoRuntime.ts";

/**
 * @since 0.1.0
 */
export * as DenoPath from "./DenoPath.ts";

/**
 * @since 0.1.0
 */
export * as DenoWorker from "./DenoWorker.ts";
