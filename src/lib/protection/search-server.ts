import "server-only";

import { availableSources, type Fetcher } from "./platforms";
import { dedupe, queriesFor, type Candidate } from "./sources";

/**
 * Поиск кандидатов по биту на сервере.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ НА СЕРВЕРЕ
 *
 * Ключи площадок — наши, и в браузере им не место. Битмейкер не вставляет
 * ничего: он покупает услугу и получает отчёт.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ВОЗВРАЩАЕТСЯ
 *
 * Кандидаты: релизы, чьё название похоже на бит. Проверки звуком на сервере
 * нет — сервер аудио не расшифровывает, — поэтому сверка идёт в браузере, а
 * сюда приходят уже готовые результаты.
 */

/** Какие площадки доступны. */
export function platformKeys(): { spotify?: string; spotifySecret?: string; deezer?: boolean; youtube?: string } {
  return {
    spotify: process.env.SPOTIFY_CLIENT_ID,
    spotifySecret: process.env.SPOTIFY_CLIENT_SECRET,
    deezer: process.env.DEEZER_ENABLED !== "false",
    youtube: process.env.YOUTUBE_SEARCH_API_KEY,
  };
}

/**
 * Кандидаты по биту.
 *
 * Площадка, которая не ответила, не роняет поиск: она просто не даёт
 * кандидатов. Но это молчание в отчёте выглядит как «проверили и не нашли»,
 * поэтому площадки без ответа возвращаются отдельным списком.
 */
export async function findCandidates(
  query: { title: string; artists: string[]; producer?: string },
  limit = 20,
  fetcher: Fetcher = fetch,
): Promise<{ candidates: Candidate[]; failed: string[] }> {
  const sources = availableSources(fetcher, platformKeys());
  const queries = queriesFor(query);

  const raw: Candidate[] = [];
  const failed: string[] = [];

  for (const source of sources) {
    let answered = false;

    for (const title of queries) {
      try {
        const found = await source.search({ ...query, title, limit });

        raw.push(...found);
        answered = true;
      } catch {
        // Площадка молчит: запоминаем и идём к следующей.
        break;
      }
    }

    if (!answered && !failed.includes(source.platform)) failed.push(source.platform);
  }

  return { candidates: dedupe(raw), failed };
}
