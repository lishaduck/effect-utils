import { Path } from "@effect/platform";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import * as DenoPath from "../src/DenoPath.ts";

it.layer(DenoPath.layer)("Integration", (it) => {
  it.effect("Runs demo program.", ({ expect }) =>
    Effect.gen(function* () {
      // Access the Path service
      const path = yield* Path.Path;

      // Join parts of a path to create a complete file path
      const tmpPath = path.join("tmp", "file.txt");

      expect(tmpPath).toBe("tmp/file.txt");
    }),
  );
});
