/**
 * Панель «что в тренде» для битмейкера.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * Битмейкер смотрит на площадку и не понимает двух вещей: во что сейчас
 * ищут и как он стоит относительно своих. «Средняя цена в жанре» и «твои
 * теги никто не ищет» — это ровно то, что нужно, чтобы поставить цену и
 * переписать описание.
 *
 * Это не украшение, а счётчик: цифры те же, что в ленте, только собранные
 * по жанрам и по продавцу.
 *
 * ---------------------------------------------------------------------------
 * ЧТО СЧИТАЕТСЯ
 *
 * Прослушивания — знак спроса: человек дослушал. Цена — медианная, а не
 * средняя: у половины битов в жанре MP3 нет, и несколько дорогих выбросов
 * среднее уводит так, что битмейкер не понимает, дорог он или нет.
 */

import { medianPrice, rankTagsByDemand, type DemandRow } from "@/lib/demand";

/** Бит в разрезе жанра: что нужно, чтобы собрать панель. */
export type GenreBeat = {
  id: string;
  ownerId: string;
  title: string;
  genre: string | null;
  tags: string[] | null;
  plays: number;
  price: number | null;
  createdAt: string;
};

/** Срез по одному жанру. */
export type GenreTrend = {
  genre: string | null;
  /** Сколько битов в жанре. */
  beats: number;
  /** Прослушивания за всё время: с затуханием по возрасту. */
  plays: number;
  /** Медианная цена MP3 в жанре. */
  medianPrice: number | null;
  /** Теги жанра по убыванию спроса. */
  topTags: { tag: string; weight: number; beats: number; plays: number }[];
};

/**
 * Срез по жанрам.
 *
 * Жанры идут по прослушиваниям: первым идёт тот, где сейчас смотрят.
 */
export function genreTrends(beats: GenreBeat[], now = Date.now()): GenreTrend[] {
  const groups = new Map<string, GenreBeat[]>();

  for (const beat of beats) {
    const key = beat.genre ?? "—";
    const list = groups.get(key) ?? [];

    list.push(beat);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([genre, list]) => {
      const demandRows: DemandRow[] = list.map((beat) => ({
        tags: beat.tags,
        plays: beat.plays,
        createdAt: beat.createdAt,
      }));

      const topTags = rankTagsByDemand(demandRows, 8, now);
      const totalPlays = topTags.reduce((sum, item) => sum + item.plays, 0);

      return {
        genre: genre === "—" ? null : genre,
        beats: list.length,
        plays: totalPlays,
        medianPrice: medianPrice(list.map((beat) => beat.price)),
        topTags,
      };
    })
    .sort((a, b) => b.plays - a.plays || b.beats - a.beats);
}

/** Как стоит битмейкер в своём жанре. */
export type SellerStanding = {
  /** Сколько его битов в жанре. */
  beats: number;
  /** Его прослушивания в жанре. */
  plays: number;
  /** Медианная цена жанра: с ней сравнивается его. */
  medianPrice: number | null;
  /** Его цена. */
  price: number | null;
  /** Дороже медианы, дешевле или наравне. */
  verdict: "higher" | "lower" | "same" | "unknown";
  /** Теги, по которым его не находят. */
  coldTags: string[];
};

/**
 * Место продавца в своём жанре.
 *
 * Сравнение с медианой, а не со средним: человек должен понимать, дорог ли он
 * для своего жанра, а медиана отвечает на это прямо.
 */
export function sellerStanding(
  own: GenreBeat[],
  trend: GenreTrend | undefined,
  now = Date.now(),
): SellerStanding {
  const prices = own.map((beat) => beat.price).filter((price): price is number => typeof price === "number" && price > 0);
  const price = prices.length > 0 ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null;
  const median = trend?.medianPrice ?? null;

  let verdict: SellerStanding["verdict"] = "unknown";

  if (price !== null && median !== null) {
    if (price > median * 1.1) verdict = "higher";
    else if (price < median * 0.9) verdict = "lower";
    else verdict = "same";
  }

  const demandRows: DemandRow[] = own.map((beat) => ({
    tags: beat.tags,
    plays: beat.plays,
    createdAt: beat.createdAt,
  }));

  const hot = rankTagsByDemand(demandRows, 8, now);
  const hotSet = new Set(hot.map((item) => item.tag));
  const cold: string[] = [];

  for (const beat of own) {
    for (const raw of beat.tags ?? []) {
      const tag = raw.trim().toLowerCase().replace(/^#/, "");

      if (!tag || hotSet.has(tag) || cold.includes(tag)) continue;

      cold.push(tag);
    }
  }

  return {
    beats: own.length,
    plays: own.reduce((sum, beat) => sum + beat.plays, 0),
    medianPrice: median,
    price,
    verdict,
    coldTags: cold.slice(0, 10),
  };
}

/** Подпись вердикта. */
export function verdictLabel(verdict: SellerStanding["verdict"]): string {
  switch (verdict) {
    case "higher":
      return "Дороже, чем в жанре";

    case "lower":
      return "Дешевле, чем в жанре";

    case "same":
      return "Как и в жанре";

    default:
      return "Сравнить пока не с чем";
  }
}
