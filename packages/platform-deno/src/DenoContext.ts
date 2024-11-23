/**
 * This module exposes a {@linkplain Layer.Layer | layer} for Deno-powered operations.
 * @module
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
import * as NodeCommandExecutor from "@effect/platform-node-shared/NodeCommandExecutor";
import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal";
import { Layer } from "effect";
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
  NodeCommandExecutor.layer,
  NodeTerminal.layer,
  DenoWorker.layerManager,
).pipe(Layer.provideMerge(DenoFileSystem.layer));
