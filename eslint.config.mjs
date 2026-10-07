import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Собранное расширение: это машинный вывод, а не наш код. Без этого
    // правила линтер проверяет минифицированные файлы и сыплет ложными
    // предупреждениями, которые никто не сможет исправить.
    // Essentia тоже приезжает готовым: склеивающий скрипт emscripten на
    // две тысячи строк. Правила там чужие, а размер не наш.
    "public/essentia/**",
    // Отчёты покрытия.
    "coverage/**",
  ]),
]);

export default eslintConfig;
