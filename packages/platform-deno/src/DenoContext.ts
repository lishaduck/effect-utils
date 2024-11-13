import type {
  CommandExecutor,
  FileSystem,
  Path,
  Terminal,
  Worker,
} from "@effect/platform";
import * as NodeCommandExecutor from "@effect/platform-node-shared/NodeCommandExecutor";
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal";
import { Layer } from "effect";
import * as DenoPath from "./DenoPath.ts";
import * as DenoWorker from "./DenoWorker.ts";

/**
 * @since 1.0.0
 * @category models
 */
export type DenoContext =
  | CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | Terminal.Terminal
  | Worker.WorkerManager;

/**
 * @since 1.0.0
 * @category layer
 */
export const layer: Layer.Layer<DenoContext> = Layer.mergeAll(
  DenoPath.layer,
  NodeCommandExecutor.layer,
  NodeTerminal.layer,
  DenoWorker.layerManager,
).pipe(Layer.provideMerge(NodeFileSystem.layer));
