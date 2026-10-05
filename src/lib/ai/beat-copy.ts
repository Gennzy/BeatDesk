/**
 * Подсказки по оформлению бита.
 *
 * Модель получает факты о бите — темп, тональность, длительность, ключ и
 * жанровые теги, — и возвращает варианты названия, описание и теги.
 *
 * Ключевое: всё, что модель пишет о звучании, должно опираться на реальные
 * данные. Если бит не прослушан, мы не даём модели выдумывать жанр: она
 * склонна назвать бит «drill» просто потому, что так чаще.
 */

import { chat, type ChatMessage } from "./openrouter";
import { parseSuggestion, type BeatSuggestion } from "./beat-suggestion";

export type BeatFacts = {
  title?: string;
  bpm?: number;
  musicalKey?: string;
  tags?: string[];
  artists?: string[];
  /** Длительность в секундах, если файл уже разобран. */
  duration?: number;
  /** Сколько дорожек в стемах: влияет на упоминание в описании. */
  hasStems?: boolean;
  /** Есть ли готовый WAV. */
  hasWav?: boolean;
};

export const SYSTEM_PROMPT = [
  "Ты продюсер и битмейкер, который оформляет карточки битов.",
  "Отвечай ТОЛЬКО валидным JSON. Никаких рассуждений, пояснений и обёртки ```.",
  'Схема: {"titles": string[1..3], "description": string, "tags": string[3..8], "notes": string[0..3]}',
  "",
  "Правила:",
  "- Название короткое, до 40 символов, без кавычек и эмодзи, без года.",
  "- В описании пиши о том, что реально известно из данных: жанр, настроение, темп, тональность.",
  "- Не выдумывай то, чего нет в данных: бит не прослушан — не пиши про звучание.",
  "- Теги — латиницей, без #, по одному слову, максимум 8.",
  "- Описание 2–4 предложения, без воды и без «подписывайтесь».",
].join("\n");

/**
 * Собрать запрос.
 *
 * Отдельная функция, чтобы правила проверялись тестами: подсказка — это
 * место, где модель незаметно начинает фантазировать.
 */
export function buildMessages(facts: BeatFacts): ChatMessage[] {
  const known: string[] = [];

  if (facts.bpm) known.push(`темп: ${facts.bpm} BPM`);
  if (facts.musicalKey) known.push(`тональность: ${facts.musicalKey}`);
  if (facts.tags?.length) known.push(`жанровые теги автора: ${facts.tags.join(", ")}`);
  if (facts.artists?.length) known.push(`type beat на: ${facts.artists.slice(0, 6).join(", ")}`);
  if (facts.duration) known.push(`длительность: ${Math.round(facts.duration)} с`);
  if (facts.hasStems) known.push("есть стемы");
  if (facts.hasWav) known.push("есть WAV без потерь");
  if (facts.title) known.push(`текущее название: «${facts.title}»`);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Данные бита:",
        ...known.map((line) => `- ${line}`),
        "",
        facts.tags?.length || facts.bpm
          ? "Дай варианты названия, описание и теги."
          : "Данных почти нет. Предложи нейтральное название и описание без догадок о звучании, а в notes напиши, чего не хватает.",
      ].join("\n"),
    },
  ];
}

export type SuggestOutcome = BeatSuggestion | { error: string };

export async function suggestBeatFacts(facts: BeatFacts): Promise<SuggestOutcome> {
  const result = await chat(buildMessages(facts));

  if ("error" in result) return { error: result.error };

  const parsed = parseSuggestion(result.text);
  if (!parsed) return { error: "Не удалось разобрать ответ модели" };

  return parsed;
}
