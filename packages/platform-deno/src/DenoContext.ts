/**
 * This module exposes a platform context {@linkplain Layer.Layer | layer} for Deno-powered applications.
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

import type {
  CommandExecutor,
  FileSystem,
  Path,
  Terminal,
  Worker,
} from "@effect/platform";
import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal";
import { Layer } from "effect";
import * as DenoCommandExecutor from "./DenoCommandExecutor.ts";
import * as DenoFileSystem from "./DenoFileSystem.ts";
import * as DenoPath from "./DenoPath.ts";
import * as DenoWorker from "./DenoWorker.ts";

/**
 * The set of runtime-agnostic layers Deno has an adapter for.
 *
 * @since 0.1.0
 * @category models
 */
export type DenoContext =
  | CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | Terminal.Terminal
  | Worker.WorkerManager;

/**
 * A {@linkplain Layer.Layer | layer} that provides a {@linkcode DenoContext} to your app.
 *
 * @since 0.1.0
 * @category layer
 */
export const layer: Layer.Layer<DenoContext> = Layer.mergeAll(
  DenoPath.layer,
  DenoCommandExecutor.layer,
  NodeTerminal.layer,
  DenoWorker.layerManager,
).pipe(Layer.provideMerge(DenoFileSystem.layer));
