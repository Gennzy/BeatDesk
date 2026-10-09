import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutPanel } from "@/components/sales/checkout-panel";
import { Container } from "@/components/ui/container";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { normalizePrices, type PriceKey } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import { priceKey } from "@/lib/sales/tier";

export const metadata: Metadata = {
  title: "Оформление",
  robots: { index: false, follow: false },
};

type CartRow = {
  beat_id: string;
  tier: string;
  beats: {
    id: string;
    title: string;
    prices: unknown;
    currency: string | null;
    sale_state: string | null;
    is_public: boolean | null;
  } | null;
};

/**
 * Оформление заказа из корзины.
 *
 * Страница перечитывает корзину с сервера, а не берёт её из корзины на
 * клиенте: между переходом и оплатой позиции могли измениться, и человек
 * должен платить за то, что видит сейчас.
 */
export default async function CheckoutPage() {
  const [t, supabase] = await Promise.all([getT(), createClient()]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/checkout");

  const { data } = await supabase
    .from("cart_items")
    .select("beat_id, tier, beats(id, title, prices, currency, sale_state, is_public)")
    .eq("user_id", user.id);

  const items = (data ?? [])
    .map((row) => {
      const row0 = row as unknown as CartRow;
      const beat = row0.beats;

      if (!beat) return null;

      const key = priceKey(row0.tier) as PriceKey | null;
      const prices = normalizePrices(beat.prices);
      const price = key ? prices[key] : null;
      const sellable = beat.sale_state === "on_sale" && beat.is_public === true;

      return {
        beatId: beat.id,
        title: beat.title,
        currency: beat.currency ?? "RUB",
        tierKey: key,
        price,
        available: sellable && price !== null,
        tiers: key ? ([key] as PriceKey[]) : [],
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null && item.available);

  // Оформлять нечего: либо корзина пуста, либо всё в ней снято с продажи.
  if (items.length === 0) redirect("/cart");

  const total = items.reduce((sum, item) => sum + (item.price ?? 0), 0);

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-title uppercase tracking-tight text-paper">{t("checkout.title")}</h1>

            <CheckoutPanel
              items={items}
              label={{
                email: t("checkout.email"),
                emailHint: t("checkout.emailHint"),
                submit: t("checkout.submit"),
                busy: t("checkout.busy"),
                error: t("checkout.error"),
                note: t("checkout.note"),
              }}
            />
          </div>

          <aside className="flex w-full flex-col gap-3 rounded-panel border border-line p-5 lg:w-96">
            {items.map((item) => (
              <div key={item.beatId} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="truncate text-paper">{item.title}</span>
                <span className="font-mono text-mute tabular-nums">
                  {item.price !== null ? formatMoney(item.price, item.currency) : "—"}
                </span>
              </div>
            ))}

            <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-3">
              <span className="label text-mute">{t("cart.total")}</span>
              <span className="font-mono text-xl text-paper tabular-nums">
                {formatMoney(total, items[0]?.currency ?? "RUB")}
              </span>
            </div>
          </aside>
        </div>
      </Container>
    </section>
  );
}