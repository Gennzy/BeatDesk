import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CartList } from "@/components/sales/cart-list";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePrices, type PriceKey, priceLabel, type Prices } from "@/lib/prices";
import { priceKey } from "@/lib/sales/tier";

export const metadata: Metadata = {
  title: "Корзина",
  robots: { index: false, follow: false },
};

type CartRow = {
  id: string;
  beat_id: string;
  tier: string;
  created_at: string;
  beats: {
    id: string;
    title: string;
    cover_url: string | null;
    prices: unknown;
    prices_before: unknown;
    discount_percent: number | null;
    currency: string | null;
    sale_state: string | null;
    is_public: boolean | null;
    profiles: { username: string } | { username: string }[] | null;
  } | null;
};

export default async function CartPage() {
  const [t, supabase] = await Promise.all([getT(), createClient()]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cart");

  const { data, error } = await supabase
    .from("cart_items")
    .select(
      "id, beat_id, tier, created_at, beats(id, title, cover_url, prices, prices_before, discount_percent, currency, sale_state, is_public, profiles!beats_owner_id_fkey(username))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  /*
   * Позиция собирается здесь, а не на клиенте: цена со скидкой, название
   * уровня и продавец нужны и для списка, и для итога, и считать их в двух
   * местах — значит однажды разойтись.
   *
   * Бит мог быть снят с продажи или удалён, пока лежал в корзине. Такую
   * позицию не показываем как обычную: человек увидел бы кнопку оплаты
   * для того, что купить уже нельзя.
   */
  const items = (data ?? [])
    .map((row) => toItem(row as unknown as CartRow))
    .filter((item): item is NonNullable<ReturnType<typeof toItem>> => item !== null);

  const available = items.filter((item) => item.available && item.price !== null);
  const total = available.reduce((sum, item) => sum + (item.price ?? 0), 0);

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <CartList
          items={items}
          total={total}
          label={{
            title: t("cart.title"),
            emptyTitle: t("cart.emptyTitle"),
            emptyNote: t("cart.emptyNote"),
            toCatalog: t("cart.toCatalog"),
            total: t("cart.total"),
            checkout: t("cart.checkout"),
            remove: t("cart.remove"),
            unavailable: t("cart.unavailable"),
            dropUnavailable: t("cart.dropUnavailable"),
          }}
          priceNames={priceLabel}
        />
      </Container>
    </section>
  );
}

/** Одна позиция корзины: цена, уровень, продавец и годность позиции. */
function toItem(row: CartRow) {
  const beat = row.beats;

  // Ссылка на бит могла пропасть: удалённый бит удаляет позицию по
  // каскаду, но если он стал черновиком, строка остаётся.
  if (!beat) return null;

  const key = priceKey(row.tier) as PriceKey | null;
  const prices = normalizePrices(beat.prices) as Prices;
  const before = beat.prices_before ? normalizePrices(beat.prices_before) : null;
  const price = key ? prices[key] : null;

  const sellable = beat.sale_state === "on_sale" && beat.is_public === true;
  const profiles = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;

  const tiers = (Object.keys(prices) as PriceKey[]).filter((candidate) => prices[candidate] !== null);

  return {
    beatId: beat.id,
    title: beat.title,
    coverUrl: beat.cover_url,
    username: profiles?.username ?? "",
    currency: beat.currency ?? "RUB",
    tierKey: key,
    price,
    before: key && before ? before[key] : null,
    discountPercent: beat.discount_percent ?? 0,
    // Оплатить имеет смысл только то, что ещё продаётся.
    available: sellable && price !== null && price !== undefined,
    tiers,
  };
}