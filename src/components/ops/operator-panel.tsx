"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

type Order = {
  id: string;
  totalMinor: number;
  currency: string;
  buyerEmail: string | null;
  createdAt: string;
  formattedTotal: string;
};

type Payout = {
  id: string;
  seller: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  formattedAmount: string;
};

/**
 * Рабочее место оператора: подтвердить оплату и закрыть выплату.
 *
 * Обе кнопки двигают деньги, поэтому обе показывают, что именно
 * произойдёт, до нажатия: сумму и кому она уйдёт. Подтверждение без
 * суммы — это «нажмите и верьте», а здесь человек решает, переводить ли
 * реальные деньги.
 *
 * После действия страница перечитывается: заказ уходит из очереди,
 * баланс продавца меняется, и список без перезагрузки показывал бы
 * уже сделанную работу как ожидающую.
 */
export function OperatorPanel({ orders, payouts }: { orders: Order[]; payouts: Payout[] }) {
  const { t } = useI18n();
  const router = useRouter();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, url: string, body: unknown) {
    setBusyId(id);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("ops.failed"));
        return;
      }

      router.refresh();
    } catch {
      setError(t("ops.failed"));
    } finally {
      setBusyId(null);
    }
  }

  const date = (value: string) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
      new Date(value),
    );

  return (
    <div className="flex flex-col gap-12">
      {error ? <p className="label text-amber">{error}</p> : null}

      <section className="flex flex-col gap-4">
        <span className="label text-mute">{t("ops.pendingOrders")}</span>

        {orders.length === 0 ? (
          <p className="border-l-2 border-line pl-3 text-sm leading-relaxed text-mute">
            {t("ops.noOrders")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md bg-ink-2 px-4 py-3"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-sm text-paper">{order.formattedTotal}</span>
                  <span className="truncate text-xs text-mute">
                    {order.buyerEmail ?? "—"} · {date(order.createdAt)}
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  <a
                    href={`/orders/${order.id}`}
                    className="chip chip-hover text-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("ops.open")}
                  </a>
                  <Button
                    type="button"
                    size="md"
                    disabled={busyId === order.id}
                    onClick={() => void act(order.id, `/api/orders/${order.id}/paid`, {})}
                  >
                    {busyId === order.id ? t("ops.working") : t("ops.confirm")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <span className="label text-mute">{t("ops.pendingPayouts")}</span>

        {payouts.length === 0 ? (
          <p className="border-l-2 border-line pl-3 text-sm leading-relaxed text-mute">
            {t("ops.noPayouts")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md bg-ink-2 px-4 py-3"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-sm text-paper">{payout.formattedAmount}</span>
                  <span className="truncate text-xs text-mute">
                    {payout.seller} · {date(payout.createdAt)}
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="md"
                    variant="ghost"
                    disabled={busyId === payout.id}
                    onClick={() => void act(payout.id, "/api/payouts/complete", { id: payout.id, paid: false })}
                  >
                    {t("ops.payoutFailed")}
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    disabled={busyId === payout.id}
                    onClick={() => void act(payout.id, "/api/payouts/complete", { id: payout.id, paid: true })}
                  >
                    {busyId === payout.id ? t("ops.working") : t("ops.payoutDone")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}