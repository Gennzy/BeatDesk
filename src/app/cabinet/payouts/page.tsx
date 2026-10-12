import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PayoutRequestForm } from "@/components/sales/payout-request-form";
import { formatMoney } from "@/lib/currency";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Баланс продавца: начисления, комиссия и заявки на вывод.
 *
 * Страница отвечает на два вопроса, которые продавец задаёт первыми:
 * «сколько мне заработано» и «почему на балансе столько». Ответ на второй
 * — журнал, а не одно число: строка, где видно, из какой продажи взялась
 * сумма, снимает половину вопросов поддержки.
 *
 * Цифры не хранятся, а считаются из журнала seller_transactions. Поле
 * «баланс» в профиле дало бы то же самое число и ту же невозможность его
 * объяснить.
 */

export const metadata = { title: "Баланс" };

type LedgerRow = {
  id: string;
  kind: "sale" | "payout" | "payout_back" | "refund" | "adjustment";
  amount_minor: number;
  gross_minor: number;
  commission_minor: number;
  commission_bps: number | null;
  created_at: string;
  order_id: string | null;
};

type PayoutRow = {
  id: string;
  amount_minor: number;
  status: "pending" | "paid" | "failed";
  created_at: string;
  paid_at: string | null;
};

const KIND_LABEL = {
  sale: "Продажа",
  payout: "Вывод",
  payout_back: "Возврат вывода",
  refund: "Отзыв продажи",
  adjustment: "Правка",
} as const;

export default async function PayoutsPage() {
  const supabase = await createClient();
  const t = await getT();

  const {
    data: { user },
  } = await supabase?.auth.getUser() ?? { data: { user: null } };

  if (!user || !supabase) redirect("/login");

  const [{ data: rows }, { data: payouts }, { data: settings }] = await Promise.all([
    supabase
      .from("seller_transactions")
      .select("id, kind, amount_minor, gross_minor, commission_minor, commission_bps, created_at, order_id")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payouts")
      .select("id, amount_minor, status, created_at, paid_at")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("platform_settings").select("commission_bps").maybeSingle(),
  ]);

  const ledger = (rows ?? []) as LedgerRow[];
  const requests = (payouts ?? []) as PayoutRow[];

  const earned = ledger
    .filter((row) => row.kind === "sale")
    .reduce((sum, row) => sum + row.amount_minor, 0);

  const withdrawn = ledger
    .filter((row) => row.kind === "payout")
    .reduce((sum, row) => sum + Math.abs(row.amount_minor), 0);

  const pending = requests
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.amount_minor, 0);

  /*
   * Баланс — это сумма журнала, а не «заработано минус выведено»:
   * откаты возвратов и ручные правки тоже двигают баланс, и формула из
   * двух чисел их потеряла бы. Поэтому итог считаем по всем строкам,
   * а заработано и выведено показываем отдельно как понятные подписи.
   */
  const balance = ledger.reduce((sum, row) => sum + row.amount_minor, 0);

  const rate =
    typeof settings?.commission_bps === "number" && settings.commission_bps > 0
      ? `${(settings.commission_bps / 100).toFixed(0)}%`
      : "—";

  const date = (value: string) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(new Date(value));

  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-hero uppercase leading-none tracking-tight">
            {t("payouts.title")}
          </h1>
          <p className="max-w-[60ch] text-sub text-mute">{t("payouts.note")}</p>
        </div>
        <Link href="/cabinet/orders" className="chip chip-hover">
          {t("payouts.toOrders")}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("payouts.balance")} value={formatMoney(balance / 100, "RUB")} accent />
        <Tile label={t("payouts.earned")} value={formatMoney(earned / 100, "RUB")} />
        <Tile label={t("payouts.withdrawn")} value={formatMoney(withdrawn / 100, "RUB")} />
        <Tile label={t("payouts.pending")} value={formatMoney(pending / 100, "RUB")} />
      </div>

      <p className="max-w-[70ch] text-sm leading-relaxed text-mute">
        {t("payouts.commission", { rate })}
      </p>

      <section className="flex flex-col gap-4">
        <span className="label text-mute">{t("payouts.history")}</span>

        {ledger.length === 0 ? (
          <p className="border-l-2 border-line pl-3 text-sm leading-relaxed text-mute">
            {t("payouts.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-px overflow-hidden rounded-lg">
            {ledger.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink-2 px-4 py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-paper">
                    {row.order_id ? (
                      <Link
                        href={`/orders/${row.order_id}`}
                        className="transition-colors hover:text-signal"
                      >
                        {KIND_LABEL[row.kind]}
                      </Link>
                    ) : (
                      KIND_LABEL[row.kind]
                    )}
                  </span>
                  <span className="text-xs text-mute">{date(row.created_at)}</span>
                </span>

                <span className="flex items-baseline gap-4">
                  {row.commission_minor > 0 ? (
                    <span className="text-xs text-mute">
                      {t("payouts.commissionLine", {
                        amount: formatMoney(row.commission_minor / 100, "RUB"),
                      })}
                    </span>
                  ) : null}
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      row.amount_minor < 0 ? "text-amber" : "text-paper"
                    }`}
                  >
                    {row.amount_minor > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(row.amount_minor) / 100, "RUB")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {requests.length > 0 ? (
        <section className="flex flex-col gap-4">
          <span className="label text-mute">{t("payouts.requests")}</span>
          <ul className="flex flex-col gap-px overflow-hidden rounded-lg">
            {requests.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink-2 px-4 py-3"
              >
                <span className="text-sm text-mute">
                  {date(row.created_at)} ·{" "}
                  {row.status === "paid"
                    ? t("payouts.statusPaid")
                    : row.status === "failed"
                      ? t("payouts.statusFailed")
                      : t("payouts.statusPending")}
                </span>
                <span className="font-mono text-sm tabular-nums text-paper">
                  {formatMoney(row.amount_minor / 100, "RUB")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <span className="label text-mute">{t("payouts.requestTitle")}</span>
        <PayoutRequestForm balanceMinor={balance} />
      </section>
    </Container>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="panel flex flex-col gap-2 p-5">
      <span className="label text-mute">{label}</span>
      <span
        className={`font-mono text-2xl leading-none tabular-nums ${accent ? "text-signal" : "text-paper"}`}
      >
        {value}
      </span>
    </div>
  );
}