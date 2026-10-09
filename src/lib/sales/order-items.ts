import { normalizeTier } from "./tier";

/**
 * Позиции заказа из тела запроса.
 *
 * Принимаются оба вида: список items — для корзины, одиночная пара — для
 * покупки со страницы бита. Два вида в одном поле приводили бы к тому, что
 * одно из них молча проигнорируется, поэтому разбор один и явный.
 *
 * Дубль бита отбрасывается, а не пропускается: create_order берёт цены на
 * момент оплаты, и два одинаковых бита в одном заказе означали бы две
 * позиции по одной цене.
 */

export type OrderItem = { beat_id: string; tier: string };

export type OrderItemInput = {
  beatId?: unknown;
  tier?: unknown;
  items?: unknown;
};

export function parseOrderItems(body: OrderItemInput): OrderItem[] | { error: string } {
  const pairs: { beatId?: unknown; tier?: unknown }[] = Array.isArray(body.items)
    ? body.items.filter((item): item is { beatId?: unknown; tier?: unknown } =>
        typeof item === "object" && item !== null,
      )
    : [{ beatId: body.beatId, tier: body.tier }];

  if (pairs.length === 0) return { error: "Нужны позиции заказа" };

  const items: OrderItem[] = [];
  const seen = new Set<string>();

  for (const pair of pairs) {
    const beatId = typeof pair.beatId === "string" ? pair.beatId.trim() : "";
    const tier = normalizeTier(pair.tier);

    if (!beatId) return { error: "Нужен бит" };
    if (!tier) return { error: "Неизвестный уровень" };
    if (seen.has(beatId)) continue;

    seen.add(beatId);
    items.push({ beat_id: beatId, tier });
  }

  return items;
}
