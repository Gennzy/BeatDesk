/**
 * Спрос по тегам: что на самом деле находят у нас.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * Модель знает, как ищут биты вообще — по своему обучению. Она не знает, как
 * ищут у нас. Разница огромная: в интернете «trap type beat» может значить
 * что угодно, а у нас конкретный жанр и конкретные слова, которые приводят
 * прослушивания.
 *
 * Это единственное место, где у площадки есть настоящее преимущество: её
 * собственные данные. Модель без них угадывает, модель с ними — знает.
 *
 * ---------------------------------------------------------------------------
 * КАК СЧИТАЕТСЯ
 *
 * Прослушивание весит больше, чем любой другой знак: человек дослушал.
 * Тег на бите без прослушиваний ничего не значит — по нему не пришли, и
 * добавлять его в описание бесполезно.
 *
 * Время тоже важно: бит, который слушали полгода назад, не говорит ни о
 * чём сегодняшнем. Отсюда затухание с половинным сроком жизни в два
 * месяца: за год вес падает вчетверо, за три года — в тридцать два раза.
 *
 * Порог отсекает шум: тег, набравший копейки, в подсказку не попадает.
 */

/** Что нужно о бите, чтобы посчитать спрос. */
export type DemandRow = {
  tags: string[] | null;
  /** Прослушивания: главный знак спроса. */
  plays: number;
  /** Дата публикации: по ней считается затухание. */
  createdAt: string;
};

/** Тег и его вес. */
export type TagDemand = {
  tag: string;
  /** Взвешенные прослушивания: сумма с учётом возраста бита. */
  weight: number;
  /** Сколько битов носят этот тег. */
  beats: number;
  /** Сырые прослушивания, без затухания: для честного сравнения. */
  plays: number;
};

/** Половинный срок жизни веса, в днях. */
export const HALF_LIFE_DAYS = 60;

/** Тег с весом меньше этого в подсказку не идёт. */
export const MIN_TAG_WEIGHT = 1;

/**
 * Затухание по возрасту.
 *
 * Бит двухлетней давности весит четверть от сегодняшнего, трёхлетний — одну
 * тридцать вторую. Старое не должно вытеснять свежее: спрос меняется, и
 * битмейкеру нужен сегодняшний язык, а не прошлогодний.
 */
export function decayOf(createdAt: string, now = Date.now()): number {
  const at = Date.parse(createdAt);

  if (!Number.isFinite(at)) return 0;

  const days = Math.max(0, (now - at) / 86_400_000);

  return 0.5 ** (days / HALF_LIFE_DAYS);
}

/**
 * Теги по убыванию спроса.
 *
 * Порядок определяет, что попадёт в первые строки подсказки, а первые строки
 * читают.
 */
export function rankTagsByDemand(rows: DemandRow[], limit = 12, now = Date.now()): TagDemand[] {
  const totals = new Map<string, { weight: number; plays: number; beats: number }>();

  for (const row of rows) {
    const plays = Number(row.plays) || 0;

    // Тег на бите, который никто не слушал, ничего не сообщает: по нему не
    // приходят, и добавлять его в описание значит занять место впустую.
    if (plays <= 0) continue;

    const decay = decayOf(row.createdAt, now);
    const weight = plays * decay;

    if (weight <= 0) continue;

    for (const raw of row.tags ?? []) {
      const tag = raw.trim().toLowerCase().replace(/^#/, "");

      if (!tag) continue;

      const current = totals.get(tag) ?? { weight: 0, plays: 0, beats: 0 };

      current.weight += weight;
      current.plays += plays;
      current.beats += 1;

      totals.set(tag, current);
    }
  }

  return [...totals.entries()]
    .filter(([, value]) => value.weight >= MIN_TAG_WEIGHT)
    .map(([tag, value]) => ({ tag, ...value }))
    .sort((a, b) => b.weight - a.weight || b.plays - a.plays || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/**
 * Теги, которые почти не ищут.
 *
 * Обратная сторона: битмейкер написал тег, а по нему не приходят. Такой тег
 * в описании только занимает место.
 */
export function coldTags(rows: DemandRow[], warm: TagDemand[], limit = 10): string[] {
  const hot = new Set(warm.map((item) => item.tag));
  const seen = new Map<string, { plays: number; beats: number }>();

  for (const row of rows) {
    for (const raw of row.tags ?? []) {
      const tag = raw.trim().toLowerCase().replace(/^#/, "");

      if (!tag || hot.has(tag)) continue;

      const current = seen.get(tag) ?? { plays: 0, beats: 0 };

      current.plays += Number(row.plays) || 0;
      current.beats += 1;

      seen.set(tag, current);
    }
  }

  return [...seen.entries()]
    .filter(([, value]) => value.plays === 0)
    .map(([tag]) => tag)
    .slice(0, limit);
}

/**
 * Медианная цена по уровню MP3.
 *
 * Медиана, а не среднее: у половины битов в жанре нет MP3, и несколько
 * дорогих выбросов среднее уводит так, что битмейкер не понимает, дорог он
 * или нет.
 */
export function medianPrice(prices: (number | null)[]): number | null {
  const values = prices
    .map((price) => (typeof price === "number" && price > 0 ? price : null))
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const middle = Math.floor(values.length / 2);

  if (values.length % 2 === 1) return values[middle];

  return Math.round((values[middle - 1] + values[middle]) / 2);
}
