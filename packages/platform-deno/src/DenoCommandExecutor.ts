/**
 * This modules exposes primitives for running subprocesses to Effect-based applications that use Deno.
 * @module
 *
 * @since 0.1.2
 */

import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import {
  Deferred,
  Effect,
  Inspectable,
  Layer,
  Option,
  type Scope,
  Sink,
  Stream,
  identity,
  pipe,
} from "effect";
import { constUndefined } from "effect/Function";
import { handleErrnoException } from "./internal/error.ts";
import { fromWritable } from "./internal/sink.ts";

const inputToStdioOption = (
  stdin: Command.Command.Input,
): "piped" | "inherit" =>
  typeof stdin === "string" ? (stdin === "pipe" ? "piped" : stdin) : "piped";

const outputToStdioOption = (
  output: Command.Command.Output,
): "piped" | "inherit" =>
  typeof output === "string" ? (output === "pipe" ? "piped" : output) : "piped";

const toError = (err: unknown): Error =>
  err instanceof globalThis.Error ? err : new globalThis.Error(String(err));

const toPlatformError = (
  method: string,
  error: Error,
  command: Command.Command,
): PlatformError => {
  const flattened = Command.flatten(command).reduce((acc, curr) => {
    const command = `${curr.command} ${curr.args.join(" ")}`;
    return acc.length === 0 ? command : `${acc} | ${command}`;
  }, "");
  return handleErrnoException("Command", method)(error, [flattened]);
};

type ExitCode = readonly [code: number | null, signal: Deno.Signal | null];
type ExitCodeDeferred = Deferred.Deferred<ExitCode>;

const ProcessProto = {
  [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
  ...Inspectable.BaseProto,
  toJSON(this: CommandExecutor.Process): object {
    return {
      _id: Symbol.keyFor(CommandExecutor.ProcessTypeId),
      pid: this.pid,
    };
  },
};

const runCommand =
  (fileSystem: FileSystem.FileSystem) =>
  (
    command: Command.Command,
  ): Effect.Effect<CommandExecutor.Process, PlatformError, Scope.Scope> => {
    switch (command._tag) {
      case "StandardCommand": {
        const spawn = Effect.flatMap(Deferred.make<ExitCode>(), (exitCode) =>
          Effect.tryPromise<
            readonly [Deno.ChildProcess, ExitCodeDeferred],
            PlatformError
          >({
            // deno-lint-ignore require-await -- We need the abort signal.
            try: async (
              signal,
            ): Promise<readonly [Deno.ChildProcess, ExitCodeDeferred]> => {
              const comm = new Deno.Command(command.command, {
                // TODO: PR Deno to make args as immutable.
                // @ts-expect-error: args is mutable, command.args is immutable.
                args: command.args,
                stdin: inputToStdioOption(command.stdin),
                stdout: outputToStdioOption(command.stdout),
                stderr: outputToStdioOption(command.stderr),
                cwd: Option.getOrElse(command.cwd, constUndefined),
                env: {
                  ...Deno.env.toObject(),
                  ...Object.fromEntries(command.env),
                },
                signal,
              });
              const handle = comm.spawn();

              void handle.status.then((status) => {
                Deferred.unsafeDone(
                  exitCode,
                  Effect.succeed<ExitCode>([status.code, status.signal]),
                );
              });

              return [handle, exitCode];
            },
            catch: (err): PlatformError =>
              toPlatformError("spawn", err as Error, command),
          }),
        );
        return pipe(
          // Validate that the directory is accessible
          Option.match(command.cwd, {
            onNone: (): Effect.Effect<void, never> => Effect.void,
            onSome: (dir): Effect.Effect<void, PlatformError> =>
              fileSystem.access(dir),
          }),
          Effect.zipRight(
            Effect.acquireRelease(spawn, ([handle, exitCode]) =>
              Effect.flatMap(Deferred.isDone(exitCode), (done) =>
                done
                  ? Effect.void
                  : Effect.suspend(() => {
                      handle.kill("SIGTERM");
                      return Deferred.await(exitCode);
                    }),
              ),
            ),
          ),
          Effect.map(([handle, exitCodeDeferred]): CommandExecutor.Process => {
            let stdin: Sink.Sink<void, unknown, never, PlatformError> =
              Sink.drain;

            stdin = fromWritable(
              () => handle.stdin,
              (err: unknown) =>
                toPlatformError("toWritable", toError(err), command),
            );

            const exitCode: CommandExecutor.Process["exitCode"] =
              Effect.flatMap(
                Deferred.await(exitCodeDeferred),
                ([code, signal]) => {
                  if (code !== null) {
                    return Effect.succeed(CommandExecutor.ExitCode(code));
                  }
                  // If code is `null`, then `signal` must be defined. See the NodeJS
                  // documentation for the `"exit"` event on a `child_process`.
                  // https://nodejs.org/api/child_process.html#child_process_event_exit
                  return Effect.fail(
                    toPlatformError(
                      "exitCode",
                      new globalThis.Error(
                        `Process interrupted due to receipt of signal: ${signal}`,
                      ),
                      command,
                    ),
                  );
                },
              );

            const isRunning = Effect.negate(Deferred.isDone(exitCodeDeferred));

            const kill: CommandExecutor.Process["kill"] = (
              signal = "SIGTERM",
            ) =>
              Effect.suspend(() => {
                handle.kill(
                  // Deno's Signal type is slightly different.
                  // They support `SIGEMT`, but don't support `SIGIOT` or `SIGLOST`.
                  // Presumably, there's no runtime validation, so it should be fine.
                  signal as Deno.Signal,
                );
                return Effect.asVoid(Deferred.await(exitCodeDeferred));
              });

            const pid = CommandExecutor.ProcessId(handle.pid);
            const stderr = Stream.fromReadableStream<Uint8Array, PlatformError>(
              () => handle.stderr,
              (err: unknown) =>
                toPlatformError(
                  "fromReadableStream(stderr)",
                  toError(err),
                  command,
                ),
            );
            let stdout: Stream.Stream<Uint8Array, PlatformError> =
              Stream.fromReadableStream<Uint8Array, PlatformError>(
                () => handle.stdout,
                (err: unknown) =>
                  toPlatformError(
                    "fromReadableStream(stdout)",
                    toError(err),
                    command,
                  ),
              );
            // TODO: add Sink.isSink
            if (typeof command.stdout !== "string") {
              stdout = Stream.transduce(stdout, command.stdout);
            }
            return Object.assign(Object.create(ProcessProto), {
              pid,
              exitCode,
              isRunning,
              kill,
              stdin,
              stderr,
              stdout,
            });
          }),
          typeof command.stdin === "string"
            ? identity
            : Effect.tap((process) =>
                Effect.forkDaemon(
                  Stream.run(
                    command.stdin as Stream.Stream<Uint8Array>,
                    process.stdin,
                  ),
                ),
              ),
        );
      }
      case "PipedCommand": {
        const flattened = Command.flatten(command);
        if (flattened.length === 1) {
          return pipe(flattened[0], runCommand(fileSystem));
        }
        const head = flattened[0];
        const tail = flattened.slice(1);
        const initial = tail.slice(0, tail.length - 1);
        // TODO: PR Effect to fix this type.
        // biome-ignore lint/style/noNonNullAssertion: A pipe always has a `right` element, but types don't use a non-empty tuple.
        const last = tail.at(-1)!;
        const stream = initial.reduce(
          (stdin, command) =>
            pipe(
              Command.stdin(command, stdin),
              runCommand(fileSystem),
              Effect.map((process) => process.stdout),
              Stream.unwrapScoped,
            ),
          pipe(
            runCommand(fileSystem)(head),
            Effect.map((process) => process.stdout),
            Stream.unwrapScoped,
          ),
        );
        return pipe(Command.stdin(last, stream), runCommand(fileSystem));
      }
    }
  };

/**
 * A {@linkplain Layer.Layer | layer} that provides support for running subprocesses to your app.
 *
 * @since 1.0.0
 * @category layer
 */
export const layer: Layer.Layer<
  CommandExecutor.CommandExecutor,
  never,
  FileSystem.FileSystem
> = Layer.effect(
  CommandExecutor.CommandExecutor,
  pipe(
    FileSystem.FileSystem,
    Effect.map((fileSystem) =>
      CommandExecutor.makeExecutor(runCommand(fileSystem)),
    ),
  ),
);
