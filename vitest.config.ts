import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Пакет ставит Next.js, а vitest его не видит. Заглушка объявлена в
      // конфиге, а не снимается с модулей: снятый маркер означал бы, что
      // серверный код можно случайно утащить в клиент.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "bench/**/*.test.ts"],
    // Замер детекторов считает десятки секунд на фикстурах, ему нужен запас.
    testTimeout: 180_000,
  },
});
