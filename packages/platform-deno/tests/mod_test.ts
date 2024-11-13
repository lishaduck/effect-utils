import { Path } from "@effect/platform";
import { describe, test } from "@effect/vitest";
import { Console, Effect } from "effect";
import { runMain } from "../src/DenoRuntime.ts";
import { DenoContext } from "../src/mod.ts";

const program = Effect.gen(function* () {
  // Access the Path service
  const path = yield* Path.Path;

  // Join parts of a path to create a complete file path
  const tmpPath = path.join("tmp", "file.txt");

  yield* Console.log(tmpPath);
});

describe.concurrent("Integration", () => {
  test("Runs demo program.", ({ expect }) => {
    expect(() => {
      runMain(program.pipe(Effect.provide(DenoContext.layer)));
    }).not.toThrow();
  });
});
