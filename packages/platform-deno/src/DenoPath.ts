/**
 * This module exposes path operations from the Deno Standard Library.
 * @module
 *
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
 * @since 0.1.0
 */

import { BadArgument } from "@effect/platform/Error";
import { Path, TypeId } from "@effect/platform/Path";
import * as DenoPath from "@std/path";
import * as DenoPathPosix from "@std/path/posix";
import * as DenoPathWin from "@std/path/windows";
import { Effect, Layer } from "effect";

const fromFileUrl = (url: URL): Effect.Effect<string, BadArgument> =>
  Effect.try({
    try: (): string => DenoPath.fromFileUrl(url),
    catch: (error): BadArgument =>
      BadArgument({
        module: "Path",
        method: "fromFileUrl",
        message: `${error}`,
      }),
  });

const toFileUrl = (path: string): Effect.Effect<URL, BadArgument> =>
  Effect.try({
    try: (): URL => DenoPath.toFileUrl(path),
    catch: (error): BadArgument =>
      BadArgument({
        module: "Path",
        method: "toFileUrl",
        message: `${error}`,
      }),
  });

/**
 * A {@linkplain Layer.Layer | layer} that provides POSIX path operations.
 *
 * @since 0.1.0
 * @category layer
 */
export const layerPosix: Layer.Layer<Path> = Layer.succeed(
  Path,
  Path.of({
    [TypeId]: TypeId,
    ...DenoPathPosix,
    sep: DenoPathPosix.SEPARATOR,
    fromFileUrl,
    toFileUrl,
  }),
);

/**
 * A {@linkplain Layer.Layer | layer} that provides Windows path operations.
 *
 * @since 0.1.0
 * @category layer
 */
export const layerWin32: Layer.Layer<Path> = Layer.succeed(
  Path,
  Path.of({
    [TypeId]: TypeId,
    ...DenoPathWin,
    sep: DenoPathWin.SEPARATOR,
    fromFileUrl,
    toFileUrl,
  }),
);

/**
 * A {@linkplain Layer.Layer | layer} that provides OS-agnostic path operations.
 *
 * @since 0.1.0
 * @category layer
 */
export const layer: Layer.Layer<Path> = Layer.succeed(
  Path,
  Path.of({
    [TypeId]: TypeId,
    ...DenoPath,
    sep: DenoPath.SEPARATOR,
    fromFileUrl,
    toFileUrl,
  }),
);
