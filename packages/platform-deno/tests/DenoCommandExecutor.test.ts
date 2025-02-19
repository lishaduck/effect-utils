import { Command, FileSystem, Path } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { it } from "@effect/vitest";
import {
  // biome-ignore lint/suspicious/noShadowRestrictedNames: Oh well.
  Array,
  Chunk,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Order,
  Stream,
  TestClock,
  pipe,
} from "effect";
import * as DenoCommandExecutor from "../src/DenoCommandExecutor.ts";
import * as DenoFileSystem from "../src/DenoFileSystem.ts";
import * as DenoPath from "../src/DenoPath.ts";

const TEST_BASH_SCRIPTS_PATH = [
  // biome-ignore lint/style/noNonNullAssertion: This is a local module.
  import.meta.dirname!,
  "fixtures",
  "bash",
];

const TestLive = DenoCommandExecutor.layer.pipe(
  Layer.provideMerge(DenoFileSystem.layer),
  Layer.merge(DenoPath.layer),
);

it.layer(TestLive)("Command", (it) => {
  it.effect("should convert stdout to a string", ({ expect }) =>
    Effect.gen(function* () {
      const command = Command.make("echo", "-n", "test");
      const result = yield* Command.string(command);
      expect(result).toEqual("test");
    }),
  );

  it.effect("should convert stdout to a list of lines", ({ expect }) =>
    Effect.gen(function* () {
      const command = Command.make("echo", "-n", "1\n2\n3");
      const result = yield* Command.lines(command);
      expect(result).toEqual(["1", "2", "3"]);
    }),
  );

  it.effect("should stream lines of output", ({ expect }) =>
    Effect.gen(function* () {
      const command = Command.make("echo", "-n", "1\n2\n3");
      const result = yield* Stream.runCollect(Command.streamLines(command));
      expect(Chunk.toReadonlyArray(result)).toEqual(["1", "2", "3"]);
    }),
  );

  it.effect("should work with a Stream directly", ({ expect }) =>
    Effect.gen(function* () {
      const decoder = new TextDecoder("utf-8");
      const command = Command.make("echo", "-n", "1\n2\n3");
      const result = yield* pipe(
        Command.stream(command),
        Stream.mapChunks(Chunk.map((bytes) => decoder.decode(bytes))),
        Stream.splitLines,
        Stream.runCollect,
      );
      expect(Chunk.toReadonlyArray(result)).toEqual(["1", "2", "3"]);
    }),
  );

  it.effect(
    "should fail when trying to run a command that does not exist",
    ({ expect }) =>
      Effect.gen(function* () {
        const command = Command.make("some-invalid-command", "test");
        const result = yield* Effect.exit(Command.string(command));
        expect(result).toStrictEqual(
          Exit.fail(
            SystemError({
              reason: "NotFound",
              module: "Command",
              method: "spawn",
              pathOrDescriptor: "some-invalid-command test",
              syscall: "spawn some-invalid-command",
              message: "spawn some-invalid-command ENOENT",
            }),
          ),
        );
      }),
    { fails: true }, // Deno has worse errors.
  );

  it.effect("should pass environment variables", ({ expect }) =>
    Effect.gen(function* () {
      const command = pipe(
        Command.make("bash", "-c", 'echo -n "var = $VAR"'),
        Command.env({ VAR: "myValue" }),
      );
      const result = yield* Command.string(command);
      expect(result).toBe("var = myValue");
    }),
  );

  it.effect(
    "should accept streaming stdin",
    ({ expect }) =>
      Effect.gen(function* () {
        const stdin = Stream.make(new TextEncoder().encode("a b c"));
        const command = pipe(Command.make("cat"), Command.stdin(stdin));
        const result = yield* Command.string(command);
        expect(result).toEqual("a b c");
      }),
    { fails: true }, // Times out.
  );

  it.effect(
    "should accept string stdin",
    ({ expect }) =>
      Effect.gen(function* () {
        const stdin = "piped in";
        const command = pipe(Command.make("cat"), Command.feed(stdin));
        const result = yield* Command.string(command);
        expect(result).toEqual("piped in");
      }),
    { fails: true }, // Times out.
  );

  it.effect("should set the working directory", ({ expect }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const command = pipe(
        Command.make("ls"),
        Command.workingDirectory(
          // biome-ignore lint/style/noNonNullAssertion: This is a local module.
          path.join(import.meta.dirname!, "..", "src"),
        ),
      );
      const result = yield* Command.lines(command);
      expect(result).toContain("DenoCommandExecutor.ts");
    }),
  );

  it.effect(
    "should be able to fall back to a different program",
    ({ expect }) =>
      Effect.gen(function* () {
        const command = Command.make("custom-echo", "-n", "test");
        const result = yield* pipe(
          command,
          Command.string(),
          Effect.catchTag("SystemError", (error) => {
            if (error.reason === "NotFound") {
              return Command.string(Command.make("echo", "-n", "test"));
            }
            return Effect.fail(error);
          }),
        );
        expect(result).toBe("test");
      }),
  );

  it.effect("should interrupt a process manually", ({ expect }) =>
    Effect.gen(function* () {
      const command = Command.make("sleep", "20");
      const result = yield* pipe(
        Effect.fork(Command.exitCode(command)),
        Effect.flatMap((fiber) => Effect.fork(Fiber.interrupt(fiber))),
        Effect.flatMap(Fiber.join),
      );
      expect(Exit.isInterrupted(result)).toBe(true);
    }),
  );

  it.effect(
    "should interrupt a process due to a timeout",
    ({ expect }) =>
      Effect.gen(function* () {
        const command = pipe(
          Command.make("sleep", "20"),
          Command.exitCode,
          Effect.timeout(5000),
        );

        const fiber = yield* Effect.fork(command);
        const adjustFiber = yield* Effect.fork(TestClock.adjust(5000));

        yield* Effect.sleep(5000);

        yield* Fiber.join(adjustFiber);
        const output = yield* Fiber.join(fiber);

        expect(output).not.toEqual(0);
      }),
    { fails: true }, // Times out.
  );

  it.scoped("should capture stderr and stdout separately", ({ expect }) =>
    it.flakyTest(
      Effect.gen(function* () {
        const path = yield* Path.Path;

        const command = pipe(
          Command.make("./duplex.sh"),
          Command.workingDirectory(path.join(...TEST_BASH_SCRIPTS_PATH)),
        );
        const process = yield* Command.start(command);
        const result = yield* pipe(
          process.stdout,
          Stream.zip(process.stderr),
          Stream.runCollect,
          Effect.map((bytes) => {
            const decoder = new TextDecoder("utf-8");
            return globalThis.Array.from(bytes).flatMap(
              ([left, right]) =>
                [decoder.decode(left), decoder.decode(right)] as const,
            );
          }),
        );
        expect(result).toEqual(["stdout1\nstdout2\n", "stderr1\nstderr2\n"]);
      }),
    ),
  );

  it("should return non-zero exit code in success channel", ({ expect }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const command = pipe(
        Command.make("./non-zero-exit.sh"),
        Command.workingDirectory(path.join(...TEST_BASH_SCRIPTS_PATH)),
      );
      const result = yield* Command.exitCode(command);
      expect(result).toBe(1);
    }));

  it.effect(
    "should throw permission denied as a typed error",
    ({ expect }) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const command = pipe(
          Command.make("./no-permissions.sh"),
          Command.workingDirectory(path.join(...TEST_BASH_SCRIPTS_PATH)),
        );
        const result = yield* Effect.exit(Command.string(command));
        expect(result).toEqual(
          Exit.fail(
            SystemError({
              reason: "PermissionDenied",
              module: "Command",
              method: "spawn",
              pathOrDescriptor: "./no-permissions.sh ",
              syscall: "spawn ./no-permissions.sh",
              message: "spawn ./no-permissions.sh EACCES",
            }),
          ),
        );
      }),
    { fails: true }, // Deno has worse errors.
  );

  it.effect(
    "should throw non-existent working directory as a typed error",
    ({ expect }) =>
      Effect.gen(function* () {
        const command = pipe(
          Command.make("ls"),
          Command.workingDirectory("/some/bad/path"),
        );
        const result = yield* Effect.exit(Command.lines(command));
        expect(result).toEqual(
          Exit.fail(
            SystemError({
              reason: "NotFound",
              module: "FileSystem",
              method: "access",
              pathOrDescriptor: "/some/bad/path",
              syscall: "access",
              message:
                "ENOENT: no such file or directory, access '/some/bad/path'",
            }),
          ),
        );
      }),
    { fails: true }, // Deno has worse errors.
  );

  it("should be able to kill a running process", ({ expect }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const command = pipe(
        Command.make("./repeat.sh"),
        Command.workingDirectory(path.join(...TEST_BASH_SCRIPTS_PATH)),
      );
      const process = yield* Command.start(command);
      const isRunningBeforeKill = yield* process.isRunning;
      yield* process.kill();
      const isRunningAfterKill = yield* process.isRunning;
      expect(isRunningBeforeKill).toBe(true);
      expect(isRunningAfterKill).toBe(false);
    }));

  it.effect(
    "should support piping commands together",
    ({ expect }) =>
      Effect.gen(function* () {
        const command = pipe(
          Command.make("echo", "2\n1\n3"),
          Command.pipeTo(Command.make("cat")),
          Command.pipeTo(Command.make("sort")),
        );
        const result = yield* Command.lines(command);
        expect(result).toEqual(["1", "2", "3"]);
      }),
    { fails: true }, // Times out.
  );

  it.effect(
    "should ensure that piping commands is associative",
    ({ expect }) =>
      Effect.gen(function* () {
        const command = pipe(
          Command.make("echo", "2\n1\n3"),
          Command.pipeTo(Command.make("cat")),
          Command.pipeTo(Command.make("sort")),
          Command.pipeTo(Command.make("head", "-2")),
        );
        const lines1 = yield* Command.lines(command);
        const lines2 = yield* Command.lines(command);
        expect(lines1).toEqual(["1", "2"]);
        expect(lines2).toEqual(["1", "2"]);
      }),
    { fails: true }, // Times out.
  );

  it.effect(
    "should allow stdin on a piped command",
    ({ expect }) =>
      Effect.gen(function* () {
        const encoder = new TextEncoder();
        const command = pipe(
          Command.make("cat"),
          Command.pipeTo(Command.make("sort")),
          Command.pipeTo(Command.make("head", "-2")),
          Command.stdin(Stream.make(encoder.encode("2\n1\n3"))),
        );
        const result = yield* Command.lines(command);
        expect(result).toEqual(["1", "2"]);
      }),
    { fails: true }, // Times out.
  );

  it("should delegate env to all commands", ({ expect }) => {
    const env = { key: "value" };
    const command = pipe(
      Command.make("cat"),
      Command.pipeTo(Command.make("sort")),
      Command.pipeTo(Command.make("head", "-2")),
      Command.env(env),
    );
    const envs = Command.flatten(command).map((command) =>
      Object.fromEntries(command.env),
    );
    expect(envs).toEqual([env, env, env]);
  });

  it("should delegate workingDirectory to all commands", ({ expect }) => {
    const workingDirectory = "working-directory";
    const command = pipe(
      Command.make("cat"),
      Command.pipeTo(Command.make("sort")),
      Command.pipeTo(Command.make("head", "-2")),
      Command.workingDirectory(workingDirectory),
    );
    const directories = Command.flatten(command).map((command) => command.cwd);
    expect(directories).toEqual([
      Option.some(workingDirectory),
      Option.some(workingDirectory),
      Option.some(workingDirectory),
    ]);
  });

  it("should delegate stderr to the right-most command", ({ expect }) => {
    const command = pipe(
      Command.make("cat"),
      Command.pipeTo(Command.make("sort")),
      Command.pipeTo(Command.make("head", "-2")),
      Command.stderr("inherit"),
    );
    const stderr = Command.flatten(command).map((command) => command.stderr);
    expect(stderr).toEqual(["pipe", "pipe", "inherit"]);
  });

  it("should delegate stdout to the right-most command", ({ expect }) => {
    const command = pipe(
      Command.make("cat"),
      Command.pipeTo(Command.make("sort")),
      Command.pipeTo(Command.make("head", "-2")),
      Command.stdout("inherit"),
    );
    const stdout = Command.flatten(command).map((command) => command.stdout);
    expect(stdout).toEqual(["pipe", "pipe", "inherit"]);
  });

  it.scoped("exitCode after exit", ({ expect }) =>
    Effect.gen(function* () {
      const command = Command.make("echo", "-n", "test");
      const process = yield* Command.start(command);
      yield* process.exitCode;
      const code = yield* process.exitCode;
      expect(code).toEqual(0);
    }),
  );

  it.scoped(
    "should allow running commands in a shell",
    ({ expect }) =>
      Effect.gen(function* () {
        const files = ["foo.txt", "bar.txt", "baz.txt"];
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const tempDir = yield* fileSystem.makeTempDirectoryScoped();
        yield* pipe(
          Effect.forEach(
            files,
            (file) =>
              fileSystem.writeFile(path.join(tempDir, file), new Uint8Array()),
            { discard: true },
          ),
        );
        const command = Command.make("compgen", "-f").pipe(
          Command.workingDirectory(tempDir),
          Command.runInShell("/bin/bash"),
        );
        const lines = yield* Command.lines(command);
        expect(Array.sort(files, Order.string)).toEqual(
          Array.sort(lines, Order.string),
        );
      }),
    { fails: true }, // Doesn't seem to run in a shell, gets 'Failed to spawn... entity not found'.
  );
});
