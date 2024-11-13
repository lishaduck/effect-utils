import { describe, test } from "@effect/vitest";
import { add } from "@lishaduck/effect-platform-deno";

describe.concurrent("Integration", () => {
  test("Runs demo program.", ({ expect }) => {
    expect(add(2, 3)).toEqual(5);
  });
});
