import deno from "@deno/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [deno()],
  test: {
    coverage: {
      // enabled: true,
    },
    sequence: {
      concurrent: true,
      shuffle: {
        files: false,
        tests: true,
      },
    },
    workspace: [
      {
        extends: true,
        test: {
          name: "platform-deno",
          include: ["packages/platform-deno/tests/*.test.ts"],
        },
      },
    ],
  },
});
