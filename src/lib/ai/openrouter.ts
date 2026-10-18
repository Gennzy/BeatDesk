/**
 * Клиент OpenRouter.
 *
 * Модели бесплатные: полный список отваливается по лимитам, поэтому
 * перечислено несколько — если первая перегружена, идём по следующей.
 * Пробуем по очереди, а не падаем с первого раза.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Бесплатные модели, проверенные живым запросом к /api/v1/chat/completions.
 *
 * Список не взят из памяти: бесплатные модели у OpenRouter меняются каждый
 * день, и помеченная :free может оказаться платной или вовсе без эндпоинтов.
 * Перепроверяется скриптом `scripts/probe-models.mjs`, который честно печатает
 * код ответа каждой модели.
 *
 * Результат последней проверки:
 *
 * - inclusionai/ling-3.0-flash-sante:free — 404, эндпоинтов не существует.
 *   Раньше она стояла первой, и каждый запрос начинал с заведомо мёртвой;
 * - gemma-4-31b и gemma-4-26b — 429, перегружены постоянно;
 * - nemotron-3.5-lightning отвечает, но очень медленно (140 секунд) — в
 *   конце списка;
 * - dots-3-note-preview отвечает быстро и сразу готовым JSON.
 *
 * Перебор остаётся: перегрузка бесплатных моделей норма, и один отказ не
 * должен превращаться в ошибку на странице.
 */
export const MODELS = [
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
] as const;

export const DEFAULT_MODEL = MODELS[0];

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = { text: string; model: string } | { error: string; model?: string };

export function apiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim();

  return key ? key : null;
}

export const isConfigured = () => Boolean(apiKey());

/**
 * Один запрос к модели.
 *
 * Возвращает ошибку текстом, а не бросает: вызывающий покажет человеку
 * причину, а не «что-то пошло не так».
 */
async function askOnce(
  key: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<ChatResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // OpenRouter просит указать источник трафика: без этого запросы
        // идут с ограничениями.
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://beatdesk.app",
        "X-Title": "BeatDesk",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
    });

    if (!response.ok) {
      const detail = await response.text();

      // 429 и 503 — модель перегружена: это не поломка, а повод взять другую.
      return { error: `${response.status}: ${detail.slice(0, 200)}`, model };
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (payload.error?.message) return { error: payload.error.message, model };

    const text = payload.choices?.[0]?.message?.content ?? "";

    return text.trim() ? { text, model } : { error: "Модель вернула пустой ответ", model };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "нет связи с OpenRouter", model };
  }
}

/**
 * Спросить модель, перебирая бесплатные по очереди.
 *
 * Перебор осмыслен: перегрузка бесплатных моделей норма, и один отказ не
 * должен превращаться в ошибку на странице.
 */
export async function chat(
  messages: ChatMessage[],
  { maxTokens = 700, models = MODELS }: { maxTokens?: number; models?: readonly string[] } = {},
): Promise<ChatResult> {
  const key = apiKey();
  if (!key) return { error: "OPENROUTER_API_KEY не задан" };

  let lastError = "";

  for (const model of models) {
    const result = await askOnce(key, model, messages, maxTokens);

    if ("text" in result) return result;

    lastError = result.error;

    // 401 и 402 — это про ключ, а не про модель: перебор не поможет.
    if (/^40[12]/.test(lastError)) return { error: lastError, model };
  }

  return { error: lastError || "все бесплатные модели недоступны" };
}
