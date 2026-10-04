import { defineConfig } from "vite";

/**
 * Content script одним куском.
 *
 * В manifest он подключается как обычный файл, поэтому внутри не должно
 * быть ни одного `import`: иначе Chrome молча не выполнит скрипт, а
 * расширение будет выглядеть как сломанное. Один вход плюс
 * inlineDynamicImports заставляют сборщик положить все зависимости внутрь.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    // Папку не чистим: здесь собирается только content.js, а manifest.json
    // и остальное кладут другие проходы.
    emptyOutDir: false,
    target: "es2022",
    lib: {
      entry: resolveEntry(),
      formats: ["iife"],
      name: "BeatDeskContent",
      fileName: () => "content.js",
    },
  },
});

function resolveEntry() {
  return new URL("./src/content.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
}
