"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { useI18n } from "@/lib/i18n/provider";

type Status = "pending" | "paid" | "failed" | "refunded" | "cancelled";

type Item = { id: string; title: string; tier: string; net: number; currency: string };

const STATUS_LABEL: Record<Status, "order.pending" | "order.paid" | "order.failed" | "order.refunded" | "order.cancelled"> = {
  pending: "order.pending",
  paid: "order.paid",
  failed: "order.failed",
  refunded: "order.refunded",
  cancelled: "order.cancelled",
};

/**
 * Заказ в списке продавца.
 *
 * Подтвердить оплату отсюда может только оператор: деньги приходят на счёт
 * площадки, и продавец поступления не видит. Продавцу видна ссылка на заказ,
 * где написано, что подтверждение — за оператором.
 */
export function SellerOrderRow({
  orderId,
  status,
  buyerEmail,
  createdAt,
  items,
  canConfirm = false,
}: {
  orderId: string;
  status: Status;
  buyerEmail: string;
  createdAt: string;
  items: Item[];
  canConfirm?: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [current, setCurrent] = useState<Status>(status);
  const [busy, setBusy] = useState(false);

  const total = items.reduce((sum, item) => sum + item.net, 0);
  const currency = items[0]?.currency ?? "RUB";

  async function cancel() {
    if (busy) return;
    setBusy(true);

    /*
     * Отмена висящего заказа освобождает бит из придержания: пока заказ
     * висит, бит никому не продаётся, и тянуть с отменой — значит держать
     * витрину закрытой. Денег здесь нет, поэтому продавец делает это сам.
     */
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.show({ icon: "close", title: data?.error ?? t("order.error") });
        return;
      }

      setCurrent("cancelled");
      toast.show({ icon: "check", title: t("order.cancelledDone") });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "manual" }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.show({ icon: "close", title: data?.error ?? t("order.error") });
        return;
      }

      setCurrent("paid");
      toast.show({ icon: "check", title: t("cabinet.orderConfirmed") });
    } finally {
      setBusy(false);
    }
  }

  const tone =
    current === "paid"
      ? "text-signal"
      : current === "pending"
        ? "text-amber"
        : "text-mute";

  return (
    <article className="panel flex flex-col gap-3 p-4 transition-colors hover:border-line-2 sm:flex-row sm:items-start sm:gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn("label", tone)}>{t(STATUS_LABEL[current])}</span>
          <TimeAgo iso={createdAt} locale={locale} className="label text-mute" />
        </div>

        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span className="truncate text-sm text-paper">{item.title}</span>
              <span className="label text-mute">{tierLabel(item.tier)}</span>
            </li>
          ))}
        </ul>

        {/* Почта — единственный контакт с покупателем: имени в заказе нет. */}
        <span className="truncate text-xs text-mute">{buyerEmail}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
        <span className="font-mono text-sm text-paper tabular-nums">{formatMoney(total / 100, currency)}</span>

        {current === "pending" && canConfirm ? (
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="label flex h-8 items-center gap-1.5 rounded-pill bg-signal px-3 text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="check" className="size-3.5" />
            {busy ? t("order.confirming") : t("order.confirmPayment")}
          </button>
        ) : current === "pending" ? (
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={busy}
            className="label flex h-8 items-center rounded-pill border border-line px-3 text-mute transition-colors hover:border-line-2 hover:text-paper disabled:opacity-50"
          >
            {busy ? t("order.confirming") : t("order.cancel")}
          </button>
        ) : (
          <a href={`/orders/${orderId}`} className="chip chip-hover">
            {t("cabinet.openOrder")}
            <Icon name="chevronRight" className="size-3" />
          </a>
        )}
      </div>
    </article>
  );
}

/** Названия уровней одинаковы на двух языках: это ключи тарифов. */
function tierLabel(tier: string): string {
  return tier === "mp3" ? "MP3" : tier === "bundle" ? "MP3 + WAV" : tier === "trackout" ? "Track Out" : "Эксклюзив";
}