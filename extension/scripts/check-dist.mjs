/**
 * Проверка собранного расширения.
 *
 * У расширения нет тестов на упаковку, а поломка тут молчаливая: content
 * script с импортом внутри просто не выполнится, и всё будет выглядеть
 * как «BeatDesk сломался», хотя сломан был билд.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
const problems = [];

function read(name) {
  try {
    return readFileSync(resolve(dist, name), "utf8");
  } catch {
    problems.push(`нет файла dist/${name}`);
    return null;
  }
}

const manifestSource = read("manifest.json");
if (manifestSource) {
  let manifest = null;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    problems.push(`manifest.json не парсится: ${error.message}`);
  }

  if (manifest) {
    if (manifest.background?.service_worker !== "background.js") {
      problems.push("в манифесте нет service_worker — сообщение с сайта некуда примети");
    }
    if (!Array.isArray(manifest.externally_connectable?.matches)) {
      problems.push("нет externally_connectable.matches — сайт не сможет обратиться к расширению");
    }
    const scripts = manifest.content_scripts ?? [];
    if (!scripts.some((entry) => (entry.js ?? []).includes("content.js"))) {
      problems.push("content.js не подключён в content_scripts");
    }
    for (const entry of scripts) {
      for (const file of entry.js ?? []) read(file);
    }
  }
}

const background = read("background.js");
if (background && !background.includes("onMessageExternal")) {
  problems.push("в background.js нет слушателя внешних сообщений");
}

const content = read("content.js");
if (content) {
  // Внутри обычного скрипта импортов быть не должно: это ES-модуль,
  // который Chrome не выполнит из content_scripts.
  const bare = content.match(/^\s*import\s.*?from\s*["']\.\//ms) ?? content.match(/\bfrom\s*["']\.\/[^"']+["']/);
  if (bare) problems.push(`в content.js остался относительный импорт: ${bare[0].trim().slice(0, 80)}`);
}

if (problems.length > 0) {
  console.error("Упаковка расширения сломана:\n" + problems.map((item) => `  • ${item}`).join("\n"));
  process.exit(1);
}

console.log("Упаковка расширения в порядке.");
