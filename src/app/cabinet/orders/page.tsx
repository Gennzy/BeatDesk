import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SellerOrderRow } from "@/components/sales/seller-order-row";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { DEFAULT_CURRENCY, formatMoney, formatMoneyByCurrency } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Заказы",
  robots: { index: false, follow: false },
};

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

/** Сколько заказов показываем в списке. Сводка считается базой и не зависит от этого числа. */
const ORDERS_LISTED = 100;

/**
 * Сколько идентификаторов уходит в один запрос.
 *
 * Идентификаторы едут в адресе запроса, а не в теле, и длинный адрес
 * обрезается на сервере: страница падает с ошибкой, а не с «показать ещё».
 * Сорок штук — около полутора килобайт, что переживает любой адрес.
 */
const ID_CHUNK = 40;

type PeriodTotals = {
  currencies: { currency: string; amount_minor: number; items: number }[];
  pending_orders: number;
};

type OrderRow = {
  id: string;
  status: string;
  buyer_email: string;
  created_at: string;
  paid_at: string | null;
  currency: string;
};

type ItemRow = {
  order_id: string;
  beat_id: string;
  beat_title: string;
  tier: string;
  seller_net_minor: number;
  currency: string;
};

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

  /*
   * Кнопка подтверждения видна только оператору: деньги приходят на счёт
   * площадки, и продавец подтвердить поступление не может — только увидеть
   * отказ. Проверка в маршруте и функции остаётся, это лишь про интерфейс.
   */
  const { data: me } = await supabase.from("profiles").select("is_operator").eq("id", user.id).maybeSingle();
  const canConfirm = me?.is_operator === true;

  const period = PERIODS.find((item) => item.key === params.period) ?? PERIODS[0];

  /*
   * Сводка приходит из базы, а не собирается из строк ниже.
   *
   * Собирать её на странице было нельзя: чтобы посчитать заработок, нужно
   * было выкачать каждую позицию, проделанную продавцом, и дотянуть статусы
   * всех её заказов. Список заказов уезжает в адрес запроса и обрезается на
   * сервере примерно после сотни заказов — страница переставала открываться
   * именно у продавца, у которого дела идут.
   */
  const { data: totals } = await supabase.rpc("seller_period_totals", { p_days: period.days ?? null });
  const summary = (totals ?? null) as PeriodTotals | null;

  const earnedByCurrency = (summary?.currencies ?? []).map((row) => ({
    amount: Number(row.amount_minor) / 100,
    currency: row.currency,
  }));
  const paidItems = (summary?.currencies ?? []).reduce((sum, row) => sum + Number(row.items), 0);
  const pendingCount = Number(summary?.pending_orders ?? 0);

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, buyer_email, created_at, paid_at, currency")
    .order("created_at", { ascending: false })
    .limit(ORDERS_LISTED);

  const allOrders = (orders ?? []) as OrderRow[];

  /*
   * Позиции достаются по частям: все идентификаторы разом не влезают в адрес
   * запроса. Порциями по сорок, зато страница не падает целиком.
   */
  const ids = allOrders.map((order) => order.id);

  const batches: string[][] = [];

  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    batches.push(ids.slice(start, start + ID_CHUNK));
  }

  const rows = (
    await Promise.all(
      batches.map(async (batch) => {
        const { data } = await supabase
          .from("order_items")
          .select("order_id, beat_id, beat_title, tier, seller_net_minor, currency")
          .eq("beat_owner_id", user.id)
          .in("order_id", batch);

        return (data ?? []) as ItemRow[];
      }),
    )
  ).flat();

  const itemsByOrder = new Map<string, ItemRow[]>();

  for (const row of rows) {
    const bucket = itemsByOrder.get(row.order_id);

    if (bucket) bucket.push(row);
    else itemsByOrder.set(row.order_id, [row]);
  }

  /*
   * Чужие покупки отсеиваются. Политика базы показывает человеку и заказы, где
   * он покупатель, а не продавец; без этой проверки такие заказы попадали в
   * список пустыми строками без единой позиции — выглядело как сбой.
   */
  const mine = allOrders
    .map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }))
    .filter((order) => order.items.length > 0);

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
              {formatMoneyByCurrency(earnedByCurrency) || formatMoney(0, DEFAULT_CURRENCY)}
            </span>
            <span className="text-xs text-mute">
              {t("cabinet.ordersPaid", { count: String(paidItems) })}
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
                  canConfirm={canConfirm}
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