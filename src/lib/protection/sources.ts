/**
 * Источники кандидатов: площадки, где движок ищет следы бита.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ КАНДИДАТЫ, А НЕ ОБХОД ВСЕГО
 *
 * Обходить все релизы площадки и сравнивать с битом — работа на месяцы и
 * терабайты трафика. В бит-мире есть соглашение, которое работу уменьшает
 * на порядки: артист, выложивший треп с чужим битом, называет его по имени
 * битмейкера или по имени типа-бита.
 *
 * Поэтому ищем не «все треки», а те, чьё название или артист похожи на наш
 * бит, — и проверяем их звуком.
 *
 * ---------------------------------------------------------------------------
 * КАК ЭТО ВЫГЛЯДИТ СО СТОРОНЫ ЧЕЛОВЕКА
 *
 * Никак. Ключи площадок и обход держит площадка, а битмейкер покупает
 * услугу и получает отчёт. Человек не должен ни вставлять ключи, ни что-то
 * настраивать.
 */

/** Кандидат: релиз на площадке, который может содержать наш бит. */
export type Candidate = {
  platform: string;
  /** Идентификатор трека на площадке. */
  externalId: string;
  title: string;
  artist: string;
  /** Прямая ссылка на превью: по ней качается звук для сверки. */
  previewUrl: string | null;
  url: string;
};

/** Что ищем. */
export type Query = {
  /** Название бита: ищем и его, и имя битмейкера. */
  title: string;
  /** Имена артистов типа-бита: «madk1d type beat» ищется именно так. */
  artists: string[];
  /** Имя битмейкера: часто стоит в названии трепа. */
  producer?: string;
  /** Сколько кандидатов берём с площадки. */
  limit?: number;
};

/** Источник: одна площадка. */
export type Source = {
  platform: string;
  /**
   * Ищет кандидатов по запросу.
   *
   * Площадки без доступа к звуку (YouTube) отдают кандидатов без
   * previewUrl: их проверяем по названию, и в отчёте они помечены как
   * «не проверено звуком».
   */
  search: (query: Query) => Promise<Candidate[]>;
};

/**
 * Собирает список запросов по биту.
 *
 * Ищем несколькими способами: по названию бита, по имени типа-бита и по
 * имени битмейкера. Один запрос находит не всё, а биты называют по-разному.
 */
export function queriesFor(query: Query): string[] {
  const out = new Set<string>();

  const title = query.title.trim();
  const producer = query.producer?.trim();

  if (title) {
    out.add(title);
    out.add(`${title} type beat`);
  }

  for (const artist of query.artists) {
    const name = artist.trim();

    if (!name) continue;

    out.add(`${name} type beat`);
    out.add(`${title} ${name}`.trim());
  }

  if (producer) {
    out.add(`${producer} type beat`);
  }

  return [...out].filter(Boolean);
}

/**
 * Схлопывает кандидатов: один и тот же трек находится несколькими
 * запросами.
 *
 * Без этого в отчёте трек светился бы трижды, а человек решил бы, что его
 * использовали трижды.
 */
export function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>();

  for (const candidate of candidates) {
    const key = `${candidate.platform}:${candidate.externalId}`;

    if (!seen.has(key)) seen.set(key, candidate);
  }

  return [...seen.values()];
}
