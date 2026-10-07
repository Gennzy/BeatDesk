"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  orderId: string;
};

/**
 * Подтверждение оплаты продавцом.
 *
 * Деньги пока приходят битмейкеру напрямую: кнопка закрывает заказ и
 * выдаёт лицензию, без неё заказ оставался бы «ожидает оплаты» навсегда.
 */
export function SellerActions({ orderId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/paid`, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };

        setError(data.error ?? t("order.error"));
        return;
      }

      router.refresh();
    } catch {
      setError(t("order.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-8">
      <Button type="button" size="md" disabled={busy} onClick={() => void confirm()}>
        {busy ? t("order.confirming") : t("order.confirmPayment")}
      </Button>
      <span className="max-w-[52ch] text-xs leading-relaxed text-mute">{t("order.confirmHint")}</span>
      {error ? <span className="label text-amber">{error}</span> : null}
    </div>
  );
}
