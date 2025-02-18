import deno from "@deno/vite-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [deno()],
});
