import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      // `v8` does't work. `istanbul` works, but lines are wonky. I don't trust it.
      provider: "istanbul",
      include: ["packages/*/src/**/*.ts"],
    },
    sequence: {
      concurrent: true,
      shuffle: {
        files: false,
        tests: true,
      },
    },
    workspace: ["packages/*/"],
  },
});
