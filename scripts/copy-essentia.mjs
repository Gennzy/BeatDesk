/**
 * КопированиеEssentia в public.
 *
 * Essentia собрана emscripten'ом и не рассчитана на бандлер: бинарник wasm
 * должен лежать рядом со склеивающим js. Поэтому файлы не импортируются, а
 * кладутся в public и грузятся обычными <script> в браузере.
 *
 * В git они не попадают: это 2 МБ чужого кода, который меняется при
 * обновлении пакета. Копирование выполняется перед dev и build.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "essentia-wasm.web.js",
  "essentia-wasm.web.wasm",
  // Именно UMD-сборка ядра: обычная рассчитана на глобальную переменную
  // EssentiaJS, которой в браузере нет, и падает с «EssentiaJS is not a
  // constructor». UMD подхватывает window.EssentiaWASM сам.
  "essentia.js-core.umd.min.js",
];

const source = resolve(process.cwd(), "node_modules/essentia.js/dist");
const target = resolve(process.cwd(), "public/essentia");

if (!existsSync(source)) {
  console.error("Нет node_modules/essentia.js/dist. Выполни pnpm install.");
  process.exit(1);
}

mkdirSync(target, { recursive: true });

for (const file of FILES) {
  const from = resolve(source, file);
  const to = resolve(target, file);

  copyFileSync(from, to);
  console.log(`essentia: ${file} — ${(statSync(to).size / 1024 / 1024).toFixed(2)} МБ`);
}
