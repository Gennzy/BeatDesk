import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Заказ",
  robots: { index: false, follow: false },
};

type OrderItem = {
  id: string;
  beat_id: string;
  tier: string;
  price_minor: number;
  beat_title: string;
  currency: string;
};

type Order = {
  id: string;
  status: string;
  currency: string;
  total_minor: number;
  commission_minor: number;
  seller_net_minor: number;
  buyer_email: string;
  created_at: string;
};

function money(minor: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₽";
  const value = (minor / 100).toLocaleString(currency === "RUB" ? "ru-RU" : "en-US");
  return `${value} ${symbol}`;
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) notFound();

  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();

  if (!order) notFound();

  const typed = order as Order;

  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);

  const rows = (items ?? []) as OrderItem[];

  /*
   * У лицензии нет колонки order_id — она висит на позиции заказа.
   * Запрос по order_id падал бы пустым на каждой оплаченной покупке,
   * поэтому лицензии ищем по id позиций этого заказа.
   */
  const { data: licenseRows } =
    rows.length > 0
      ? await supabase
          .from("licenses")
          .select("license_key, tier, order_item_id")
          .in("order_item_id", rows.map((item) => item.id))
      : { data: [] as { license_key: string; tier: string; order_item_id: string }[] };

  const licenses = (licenseRows ?? []) as { license_key: string; tier: string }[];

  return (
    <section className="py-14 lg:py-20">
      <Container>
        <div className="flex flex-col gap-6 border-b border-line pb-8">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("order.title")}</span>
          </span>
          <h1 className="font-display text-section font-black text-paper uppercase">{t("order.heading")}</h1>
          <p className="label text-mute">{typed.id}</p>
          <p className={typed.status === "paid" ? "label text-signal" : "label text-amber"}>
            {typed.status === "paid" ? t("order.paid") : t("order.pending")}
          </p>
        </div>

        <ul className="flex flex-col gap-px pt-8">
          {rows.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 bg-ink-2 px-4 py-3">
              <span className="flex flex-col">
                <span className="label text-paper">{item.beat_title}</span>
                <span className="text-xs text-mute">{item.tier}</span>
              </span>
              <span className="font-mono text-sm text-amber">{money(item.price_minor, item.currency)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-6">
          <span className="label text-paper">{t("order.total")}</span>
          <span className="font-mono text-sm text-paper">{money(typed.total_minor, typed.currency)}</span>
        </div>

        <p className="pt-4 text-xs leading-relaxed text-mute">
          {t("order.deliveryNote")}: {typed.buyer_email}
        </p>

        {typed.status === "paid" && licenses && (licenses as { license_key: string; tier: string }[]).length > 0 ? (
          <div className="flex flex-col gap-3 pt-8">
            <span className="label text-paper">{t("order.licenses")}</span>
            {(licenses as { license_key: string; tier: string }[]).map((license) => (
              <code key={license.license_key} className="mono border border-line bg-ink-2 px-4 py-3 text-xs text-paper">
                {license.tier}: {license.license_key}
              </code>
            ))}
          </div>
        ) : null}

        {typed.status !== "paid" ? (
          <p className="pt-8 text-sm leading-relaxed text-mute">{t("order.manualNote")}</p>
        ) : null}
      </Container>
    </section>
  );
}
