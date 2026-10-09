"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { DiscountPrice, beforePrice } from "@/components/beat/discount-price";
import { formatMoney } from "@/lib/currency";
import { useI18n } from "@/lib/i18n/provider";
import { tierContents } from "@/lib/sales/delivery";
import { priceLabel, type PriceKey, type Prices } from "@/lib/prices";

type Props = {
  beatId: string;
  tiers: { key: PriceKey; value: number }[];
  /** Цены до скидки: null, если скидки нет. */
  pricesBefore: Prices | null;
  discountPercent: number;
  currency: string;
  isOwner: boolean;
};

/**
 * Витрина уровней: цена, что входит, и кнопка покупки.
 *
 * Раньше цены показывались в шапке бита, а покупка — отдельным блоком под
 * ней. Один и тот же список дважды: человеку приходилось сопоставлять
 * «MP3 + WAV за 1 500 ₽» в шапке с кнопкой рядом. Теперь список один,
 * и кнопка стоит на своём уровне.
 */
export function BeatOffer({ beatId, tiers, pricesBefore, discountPercent, currency, isOwner }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [tier, setTier] = useState<PriceKey | null>(tiers[0]?.key ?? null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (tiers.length === 0) {
    return isOwner ? (
      <p className="max-w-[62ch] border-t border-line pt-6 text-sub text-mute">{t("share.noPrices")}</p>
    ) : null;
  }

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
    <div className="flex flex-col gap-4 border-t border-line pt-6">
      <span className="label text-mute">{isOwner ? t("share.pricesOwner") : t("share.pricesBuyer")}</span>

      <ul className="flex flex-col gap-2">
        {tiers.map((item) => {
          const chosen = item.key === tier;

          return (
            <li
              key={item.key}
              className={
                isOwner
                  ? "flex items-baseline justify-between gap-4 rounded-lg border border-line bg-ink-2 px-4 py-3"
                  : cnTier(chosen)
              }
            >
              <span className="flex flex-col gap-1">
                <span className="label text-paper">{priceLabel[item.key]}</span>
                <span className="text-xs leading-snug text-mute">{tierContents(dbTier(item.key), locale).join(" · ")}</span>
              </span>

              <span className="flex items-baseline gap-3">
                <DiscountPrice
                  price={item.value}
                  before={beforePrice(pricesBefore, item.key)}
                  percent={discountPercent}
                  currency={currency}
                />
                {isOwner ? null : (
                  <button
                    type="button"
                    onClick={() => setTier(item.key)}
                    aria-pressed={chosen}
                    className={cn(
                      "label h-9 rounded-pill px-3.5 transition-colors",
                      chosen
                        ? "bg-signal text-ink"
                        : "border border-line text-mute hover:border-line-2 hover:text-paper",
                    )}
                  >
                    {chosen ? t("order.selected") : t("order.choose")}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {isOwner ? null : (
        <div className="flex flex-col gap-4">
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

          <Button type="button" size="lg" className="sm:min-w-64 sm:self-start" disabled={status === "busy" || !selected} onClick={() => void buy()}>
            {status === "busy"
              ? t("order.creating")
              : selected
                ? `${t("order.buy")} · ${formatMoney(selected.value, currency)}`
                : t("order.buy")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Перевод ключа уровня из интерфейса в правила выдачи. */
const dbTier = (key: PriceKey): string => (key === "wav" ? "bundle" : key);

/** Выбранный уровень подсвечиваем: кнопка «Купить» относится к нему. */
function cnTier(chosen: boolean): string {
  return chosen
    ? "flex items-baseline justify-between gap-4 rounded-lg border border-signal bg-signal/10 px-4 py-3"
    : "flex items-baseline justify-between gap-4 rounded-lg border border-line bg-ink-2 px-4 py-3 transition-colors hover:border-line-2";
}