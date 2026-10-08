import Link from "next/link";
import { redirect } from "next/navigation";

import { SellerOrderRow } from "@/components/sales/seller-order-row";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Заказы и выручка битмейкера.
 *
 * Раньше это были четыре цифры на главной кабинета и список ожидающих ниже.
 * Для работы этого мало: нужно видеть всю историю, состояние каждого заказа
 * и то, сколько денег пришло. Поэтому отдельная страница, а не блок.
 */

/** Периоды для сводки: за всё время, за месяц, за неделю. */
const PERIODS = [
  { key: "all", days: null, label: "cabinet.periodAll" },
  { key: "month", days: 30, label: "cabinet.periodMonth" },
  { key: "week", days: 7, label: "cabinet.periodWeek" },
] as const;

export default async function CabinetOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const [t, supabase, params] = await Promise.all([getT(), createClient(), searchParams]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/orders");

  const period = PERIODS.find((item) => item.key === params.period) ?? PERIODS[0];

  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, beat_id, beat_title, tier, seller_net_minor, currency")
    .eq("beat_owner_id", user.id);

  const rows = (items ?? []) as {
    order_id: string;
    beat_id: string;
    beat_title: string;
    tier: string;
    seller_net_minor: number;
    currency: string;
  }[];

  const orderIds = [...new Set(rows.map((row) => row.order_id))];

  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("id, status, buyer_email, created_at, paid_at, currency")
        .in("id", orderIds)
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; status: string; buyer_email: string; created_at: string; paid_at: string | null; currency: string }[] };

  const allOrders = (orders ?? []) as {
    id: string;
    status: string;
    buyer_email: string;
    created_at: string;
    paid_at: string | null;
    currency: string;
  }[];

  const statusById = new Map(allOrders.map((order) => [order.id, order.status]));

  // Деньги считаем по позициям: в заказе может быть несколько битов от разных
  // продавцов, и вся сумма заказа продавцу не принадлежит.
  const paidRows = rows.filter((row) => ["paid", "delivered"].includes(statusById.get(row.order_id) ?? ""));

  const cutoff = period.days ? Date.now() - period.days * 86_400_000 : null;
  const inPeriod = paidRows.filter((row) => {
    if (cutoff === null) return true;
    const order = allOrders.find((item) => item.id === row.order_id);
    return order ? new Date(order.paid_at ?? order.created_at).getTime() >= cutoff : false;
  });

  const earned = inPeriod.reduce((sum, row) => sum + Number(row.seller_net_minor), 0);
  const currency = paidRows[0]?.currency ?? "RUB";
  const pendingCount = allOrders.filter((order) => order.status === "pending").length;

  // Заказы, к которым относится хоть одна позиция продавца.
  const mine = allOrders.map((order) => ({
    ...order,
    items: rows.filter((row) => row.order_id === order.id),
  }));

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
          <div className="flex items-center gap-3">
            <Link href="/cabinet" className="text-mute transition-colors hover:text-paper" aria-label={t("cabinet.title")}>
              <Icon name="chevronRight" className="size-4 rotate-180" />
            </Link>
            <h1 className="font-display text-title font-semibold text-paper uppercase">{t("cabinet.ordersTitle")}</h1>
          </div>

          <nav className="flex items-center gap-1">
            {PERIODS.map((item) => (
              <Link
                key={item.key}
                href={`/cabinet/orders?period=${item.key}`}
                aria-current={period.key === item.key ? "page" : undefined}
                className={period.key === item.key ? "tab bg-signal text-ink" : "tab"}
              >
                {t(item.label as "cabinet.periodAll")}
              </Link>
            ))}
          </nav>
        </div>

        {/*
          Выручка — главная цифра страницы, и рядом с ней то, что требует
          действия. Пустая сумма без контекста ничего не говорит: важно,
          сколько из этого уже пришло и сколько ещё висит без подтверждения.
        */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="panel flex flex-col gap-2 p-5 sm:col-span-2">
            <span className="label text-mute">{t("cabinet.earnedFor", { period: t(period.label as "cabinet.periodAll") })}</span>
            <span className="font-mono text-4xl leading-none text-paper tabular-nums">
              {formatMoney(earned / 100, currency)}
            </span>
            <span className="text-xs text-mute">
              {t("cabinet.ordersPaid", { count: String(inPeriod.length) })}
            </span>
          </div>

          <div className="panel flex flex-col justify-between gap-3 p-5">
            <span className="label text-mute">{t("cabinet.pendingTitle")}</span>
            <span className={`font-display text-4xl leading-none tabular-nums ${pendingCount > 0 ? "text-signal" : "text-paper/85"}`}>
              {pendingCount}
            </span>
            {pendingCount > 0 ? (
              <span className="text-xs text-mute">{t("cabinet.pendingHint")}</span>
            ) : (
              <span className="text-xs text-mute">{t("cabinet.pendingEmpty")}</span>
            )}
          </div>
        </div>

        {mine.length === 0 ? (
          <div className="panel mt-6 flex flex-col items-start gap-3 p-8">
            <Icon name="sale" className="size-5 text-mute" />
            <p className="text-sm text-mute">{t("cabinet.ordersEmpty")}</p>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {mine.map((order) => (
              <li key={order.id}>
                <SellerOrderRow
                  orderId={order.id}
                  status={order.status as "pending" | "paid" | "failed" | "refunded" | "cancelled"}
                  buyerEmail={order.buyer_email}
                  createdAt={order.created_at}
                  items={order.items.map((item) => ({
                    id: item.beat_id,
                    title: item.beat_title,
                    tier: item.tier,
                    net: Number(item.seller_net_minor),
                    currency: item.currency,
                  }))}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}