import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, type Plugin } from "vite";

/** manifest.json копируется как есть: vite его не собирает. Путь берём из конфига, а не из import.meta.url — конфиг грузится из временного файла. */
function manifest(): Plugin {
  let root = process.cwd();
  return {
    name: "beatdesk-manifest",
    configResolved(config) {
      root = config.root;
    },
    closeBundle() {
      const out = resolve(root, "dist");
      mkdirSync(out, { recursive: true });
      copyFileSync(resolve(root, "src/manifest.json"), resolve(out, "manifest.json"));
    },
  };
}

/**
 * popup и service worker.
 *
 * Content script собирается отдельным проходом: если входов несколько,
 * общий модуль уезжает в отдельный чанк, а content script не умеет
 * импортировать соседние файлы — он выполняется как обычный скрипт.
 */
export default defineConfig({
  plugins: [manifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        popup: "popup.html",
        background: "src/background.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
