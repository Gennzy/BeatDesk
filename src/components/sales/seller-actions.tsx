"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Подтверждение поступления денег по заказу.
 *
 * Кнопка есть только у оператора площадки.
 *
 * Раньше её нажимал продавец: деньги приходили ему на счёт, он их видел и
 * подтверждал. После смены модели деньги приходят на счёт площадки, и
 * продавец подтвердить поступление не может — только оператор, чей это
 * счёт.
 *
 * Если бы кнопка осталась у продавца, он нажимал бы её по неоплаченному
 * заказу: заказ становился оплаченным, выдавалась лицензия, а на баланс
 * падало начисление, которое можно было вывести. Кнопка печатала бы деньги.
 *
 * Проверка прав стоит в маршруте и в функции mark_order_paid. Здесь она же
 * третьим слоем — чтобы кнопка просто не рисовалась там, где нажатие всё
 * равно было бы отклонено.
 */
export function SellerActions({ orderId }: { orderId: string }) {
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
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        setError(data?.error ?? t("order.error"));
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
      <span className="max-w-[52ch] text-xs leading-relaxed text-mute">{t("order.operatorHint")}</span>
      {error ? <span className="label text-amber">{error}</span> : null}
    </div>
  );
}