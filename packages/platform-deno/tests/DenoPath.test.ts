import { Path } from "@effect/platform";
import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import * as DenoPath from "../src/DenoPath.ts";

const runPromise = <E, A>(self: Effect.Effect<A, E, Path.Path>): Promise<A> =>
  Effect.runPromise(Effect.provide(self, DenoPath.layer));

const program = Effect.gen(function* () {
  // Access the Path service
  const path = yield* Path.Path;

  // Join parts of a path to create a complete file path
  return path.join("tmp", "file.txt");
});

describe.concurrent("Integration", () => {
  it("Runs demo program.", async ({ expect }) => {
    const output = await runPromise(program);

    expect(output).toBe("tmp/file.txt");
  });
});
