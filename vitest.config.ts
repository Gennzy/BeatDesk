import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "extension/**/*.test.ts", "bench/**/*.test.ts"],
    // Замер детекторов считает десятки секунд на фикстурах, ему нужен запас.
    testTimeout: 180_000,
  },
});
