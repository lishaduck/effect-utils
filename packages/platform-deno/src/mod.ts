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
 * @file
 * Provides a platform context using Deno.
 */
export * as DenoContext from "./DenoContext.ts";

/**
 * @file
 * An effect runtime using Deno.
 */
export * as DenoRuntime from "./DenoRuntime.ts";
