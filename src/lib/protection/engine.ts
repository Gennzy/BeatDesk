/**
 * Движок поиска: бит против площадок.
 *
 * ---------------------------------------------------------------------------
 * КАК ОНО УСТРОЕНО
 *
 *   1. Собираем запросы по биту: название, имя типа-бита, имя битмейкера.
 *   2. Каждый источник отдаёт кандидатов: релизы, чьё название похоже.
 *   3. У кандидата с превью качаем звук и сравниваем с битом — со смещением,
 *      потому что бит в трепе играет не с начала.
 *   4. Кандидат без превью (YouTube) проверяем по названию и помечаем как
 *      непроверенный звуком.
 *   5. Находки, чей отпечаток совпал с кем-то из нашего журнала скачиваний,
 *      получают имя подозреваемого.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ДВИЖОК ВОЗВРАЩАЕТ
 *
 * Находки, а не приговоры. Совпадение отпечатков означает «очень похоже»:
 * бит простая вещь, и находка — это повод для разговора с артистом.
 */

import { align, MATCH_THRESHOLD } from "./align";
import { findSuspects, type DownloadRecord } from "./attribution";
import { dedupe, queriesFor, type Candidate, type Query, type Source } from "./sources";

/** Находка. */
export type EngineMatch = {
  platform: string;
  externalId: string;
  title: string;
  artist: string;
  url: string;
  /** Процент совпадения, 0..100. */
  confidence: number;
  /** Проверено ли звуком. На YouTube звука нет — там проверка по названию. */
  verifiedByAudio: boolean;
  /** Наш покупатель или скачавший, чей файл совпал. */
  suspect: { userId: string; label: string; createdAt: string } | null;
};

/** Что движку отдают. */
export type EngineInput = {
  query: Query;
  /** Отпечаток мастера: по нему ищем. */
  envelope: string;
  /** Кто и когда брал бит: по их отпечаткам ищем подозреваемого. */
  downloads: DownloadRecord[];
  /** Площадки, по которым идём. */
  platforms: string[];
  /** Кандидатов с площадки. */
  limit?: number;
};

/**
 * Отпечаток превью.
 *
 * Считается в браузере: сервер аудио не расшифровывает. Сюда приходит уже
 * посчитанный отпечаток кандидата.
 */
export type PreviewFetcher = (candidate: Candidate) => Promise<string | null>;

export type Engine = {
  name: string;
  run: (input: EngineInput, fetchPreview: PreviewFetcher) => Promise<EngineMatch[]>;
};

/**
 * Движок.
 *
 * Площадки приходят снаружи: у каждой свой доступ и своя форма ответа, а
 * сверка и отчёт от этого не меняются.
 */
export function createEngine(sources: Source[]): Engine {
  return {
    name: "own",
    run: async (input, fetchPreview) => {
      const queries = queriesFor(input.query);
      const wanted = new Set(input.platforms);

      // 1. Кандидаты со всех площадок по всем запросам.
      const raw: Candidate[] = [];

      for (const source of sources) {
        if (!wanted.has(source.platform)) continue;

        for (const query of queries) {
          try {
            raw.push(...(await source.search({ ...input.query, title: query, limit: input.limit })));
          } catch {
            // Площадка не ответила: идём дальше. Молчаливый пропуск был бы
            // не виден в отчёте, а человек решил бы, что площадку проверили.
            continue;
          }
        }
      }

      const candidates = dedupe(raw);

      // 2. Сверка звуком там, где звук есть.
      const matches: EngineMatch[] = [];

      for (const candidate of candidates) {
        let confidence = 0;
        let verifiedByAudio = false;
        let candidateEnvelope: string | null = null;

        if (candidate.previewUrl) {
          candidateEnvelope = await fetchPreview(candidate).catch(() => null);

          if (candidateEnvelope) {
            const result = align(input.envelope, candidateEnvelope);

            confidence = Math.round(result.match * 100);
            verifiedByAudio = true;
          }
        }

        // Без звука сверять нечем: название — это повод посмотреть, а не
        // находка. Такие кандидаты в отчёт не попадают, но остаются в
        // источнике для ручной проверки.
        if (!verifiedByAudio) continue;

        if (confidence < MATCH_THRESHOLD * 100) continue;

        // 3. Кто из наших покупателей совпал.
        const suspects = findSuspects(
          {
            platform: candidate.platform,
            title: candidate.title,
            artist: candidate.artist,
            url: candidate.url,
            confidence,
            envelope: candidateEnvelope,
          },
          input.downloads,
        );

        matches.push({
          platform: candidate.platform,
          externalId: candidate.externalId,
          title: candidate.title,
          artist: candidate.artist,
          url: candidate.url,
          confidence,
          verifiedByAudio,
          suspect: suspects[0]
            ? { userId: suspects[0].userId, label: suspects[0].label, createdAt: suspects[0].createdAt }
            : null,
        });
      }

      return matches.sort((a, b) => b.confidence - a.confidence);
    },
  };
}
