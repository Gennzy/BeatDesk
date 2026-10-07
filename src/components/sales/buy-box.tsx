"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/currency";
import { useI18n } from "@/lib/i18n/provider";
import type { PriceKey } from "@/lib/prices";

type Props = {
  beatId: string;
  tiers: { key: PriceKey; label: string; value: number }[];
  currency: string;
  isOwner: boolean;
};

/**
 * Покупка одного уровня: выбор уровня, почта для доставки, create_order.
 *
 * Цену не отправляем: её берёт create_order из строки бита.
 */
export function BuyBox({ beatId, tiers, currency, isOwner }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [tier, setTier] = useState<PriceKey | "">(tiers[0]?.key ?? "");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (isOwner || tiers.length === 0) return null;

  const selected = tiers.find((item) => item.key === tier);

  async function buy() {
    if (!tier || !email.trim()) {
      setError(t("order.needEmail"));
      return;
    }

    setStatus("busy");
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId, tier, email: email.trim() }),
      });

      // Без входа заказ создавать не даём: RLS всё равно не покажет его.
      if (response.status === 401) {
        router.push(`/login?next=/beats/${beatId}`);
        return;
      }

      const data = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !data.id) {
        setStatus("error");
        setError(data.error ?? t("order.error"));
        return;
      }

      router.push(`/orders/${data.id}`);
    } catch {
      setStatus("error");
      setError(t("order.error"));
    } finally {
      setStatus((current) => (current === "busy" ? "idle" : current));
    }
  }

  return (
    <div className="flex flex-col gap-4 border border-line bg-ink-2 p-5">
      <span className="label text-paper">{t("order.buy")}</span>

      <div className="flex flex-wrap gap-2">
        {tiers.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTier(item.key)}
            aria-pressed={tier === item.key}
            className={
              tier === item.key
                ? "label h-9 px-3 bg-signal text-ink"
                : "label h-9 px-3 border border-line text-mute transition-colors hover:text-paper"
            }
          >
            {item.label} · {formatMoney(item.value, currency)}
          </button>
        ))}
      </div>

      <Field label={t("order.email")} hint={t("order.emailHint")}>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@studio.ru"
          autoComplete="email"
        />
      </Field>

      {error ? <p className="label leading-relaxed text-amber">{error}</p> : null}

      <Button type="button" size="md" disabled={status === "busy" || !selected} onClick={() => void buy()}>
        {status === "busy"
          ? t("order.creating")
          : selected
            ? `${t("order.buy")} · ${formatMoney(selected.value, currency)}`
            : t("order.buy")}
      </Button>
    </div>
  );
}
