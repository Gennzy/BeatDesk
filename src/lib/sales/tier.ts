import type { PriceKey } from "@/lib/prices";

/**
 * Уровни лицензии: одно правило на заказ, корзину и всё остальное.
 *
 * В проекте две схемы имён, и путать их нельзя:
 *
 *   PriceKey — как уровень называется в интерфейсе: mp3, wav, trackout
 *   TIERS    — как он лежит в базе: mp3, bundle, trackout
 *
 * Цена со скидкой лежит в prices ->> tier, поэтому на сервер уходит bundle.
 * Раньше это правило жило в маршруте заказов, а корзина его повторила бы
 * своим списком — и через месяц один из них разошёлся бы с базой, то есть
 * ошибка вылезла бы в момент оплаты.
 */

/** Уровни в том виде, в каком они лежат в базе. */
export const TIERS = ["mp3", "bundle", "trackout", "exclusive"] as const;

export type DbTier = (typeof TIERS)[number];

/** Что приходит из интерфейса и что на самом деле означает. */
const TIER_ALIASES: Record<string, string> = {
  // WAV в интерфейсе, bundle в колонке цен.
  wav: "bundle",
};

/**
 * Привести уровень к виду базы.
 *
 * Строка, которой нет в списке, — это null, а не «как пришло»: уровень из
 * ручной правки запроса попал бы в заказ и упал бы уже на оплате.
 */
export function normalizeTier(value: unknown): DbTier | null {
  if (typeof value !== "string") return null;

  const raw = value.trim().toLowerCase();
  const tier = TIER_ALIASES[raw] ?? raw;

  return (TIERS as readonly string[]).includes(tier) ? (tier as DbTier) : null;
}

/** Обратно: уровень из базы в том виде, в каком его знает интерфейс. */
export function priceKey(tier: string): PriceKey | null {
  if (tier === "bundle") return "wav";

  return (["mp3", "trackout", "exclusive"] as const).includes(tier as never) ? (tier as PriceKey) : null;
}

/** Цена уровня из объекта цен бита. */
export function tierPrice(prices: Record<string, unknown> | null | undefined, tier: string): number | null {
  const raw = prices?.[tier];

  if (raw === null || raw === undefined || raw === "") return null;

  const value = Number(raw);

  return Number.isFinite(value) && value > 0 ? value : null;
}
