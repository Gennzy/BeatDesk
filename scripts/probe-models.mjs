/**
 * Проверка бесплатных моделей OpenRouter.
 *
 * Список моделей в src/lib/ai/openrouter.ts живёт по памяти, а память протухает
 * каждую неделю: модель уходит в перегрузку или вовсе исчезает из списка
 * эндпоинтов. Скрипт честно спрашивает каждую и печатает код ответа — по
 * нему список и правят руками, а не по ощущениям.
 *
 * Запуск: node scripts/probe-models.mjs
 *
 * Ключ берётся из .env.local и никуда не печатается.
 */

import fs from "node:fs";

const env = {};

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const key = env.OPENROUTER_API_KEY;

if (!key) {
  console.error("OPENROUTER_API_KEY не задан в .env.local");
  process.exit(1);
}

/** Держим в списке с openrouter.ts, иначе проверка ничего не скажет. */
const MODELS = [
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "inclusionai/ling-3.0-flash-sante:free",
];

/**
 * Бюджет намеренно большой.
 *
 * Часть моделей сначала рассуждает и на это уходит несколько сотен токенов.
 * При маленьком max_tokens ответ приходил пустым при коде 200, и выглядело это
 * как «модель не отвечает», хотя отвечала.
 */
const MAX_TOKENS = 3000;

for (const model of MODELS) {
  const started = Date.now();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://beatdesk.vercel.app",
        "X-Title": "BeatDesk",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        messages: [
          { role: "system", content: 'Отвечай ТОЛЬКО валидным JSON. Схема: {"ok": boolean}' },
          { role: "user", content: 'Ответь ровно {"ok": true}' },
        ],
      }),
    });

    const payload = await response.json().catch(() => null);
    const elapsed = Date.now() - started;

    if (!response.ok) {
      const detail = payload?.error?.message ?? (await response.text()).slice(0, 80);

      console.log(`${response.status}  ${model.padEnd(42)}  ${detail}`);
      continue;
    }

    const choice = payload?.choices?.[0];
    const content = choice?.message?.content ?? "";
    const reasoning = payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

    const json = content.includes("{") && /\{[\s\S]*\}/.test(content);

    console.log(
      `200  ${model.padEnd(42)}  ${String(elapsed).padStart(6)}ms  ` +
        `json: ${json ? "да" : "нет"}  рассуждений: ${reasoning}`,
    );
  } catch (error) {
    console.log(`ERR  ${model.padEnd(42)}  ${error instanceof Error ? error.message : "нет связи"}`);
  }
}