"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DiscountPrice } from "@/components/beat/discount-price";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatMoney } from "@/lib/currency";
import type { PriceKey } from "@/lib/prices";
import { PRICE_KEYS } from "@/lib/prices";

export type CartItem = {
  beatId: string;
  title: string;
  coverUrl: string | null;
  username: string;
  currency: string;
  tierKey: PriceKey | null;
  price: number | null;
  before: number | null;
  discountPercent: number;
  available: boolean;
  /** Уровни, которые этот бит действительно продаёт. */
  tiers: PriceKey[];
};

type Props = {
  items: CartItem[];
  total: number;
  label: Record<string, string>;
  priceNames: Record<string, string>;
};

/**
 * Корзина: список позиций, итог и оформление.
 *
 * Уровень в позиции не хранится списком один раз, а меняется на месте:
 * набор уровней у каждого бита свой, и общий выпадающий список показал бы
 * человеку то, чего этот бит не продаёт.
 */
export function CartList({ items, total, label, priceNames }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <EmptyState title={label.emptyTitle} description={label.emptyNote} action={{ label: label.toCatalog, href: "/#feed" }} />;
  }

  const payable = items.filter((item) => item.available);

  async function remove(beatId: string) {
    setBusy(beatId);

    try {
      await fetch(`/api/cart/${beatId}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function setTier(beatId: string, tier: PriceKey) {
    setBusy(beatId);

    try {
      const response = await fetch(`/api/cart/${beatId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        window.alert(data?.error ?? "Не удалось сменить уровень");
        return;
      }

      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-title uppercase tracking-tight text-paper">{label.title}</h1>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.beatId}
            className={
              item.available
                ? "flex flex-wrap items-center gap-5 rounded-panel border border-line p-4"
                : "flex flex-wrap items-center gap-5 rounded-panel border border-line bg-ink-2/40 p-4 opacity-70"
            }
          >
            <Link href={`/beats/${item.beatId}`} className="focusable shrink-0">
              <img
                src={item.coverUrl ?? ""}
                alt=""
                width={64}
                height={64}
                className="size-16 rounded-lg object-cover"
              />
            </Link>

            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Link href={`/beats/${item.beatId}`} className="font-display text-lg uppercase leading-tight text-paper hover:underline focusable">
                {item.title}
              </Link>
              {item.username ? <span className="label text-mute">@{item.username}</span> : null}

              {/*
                Уровни берутся из цен самого бита: набор у каждого свой, и
                общий список предлагал бы купить MP3 у бита, который его не
                продаёт. Уровень без цены не показываем вовсе — выбрать его
                нельзя, а пустой пункт в списке выглядит как ошибка.
              */}
              <label className="mt-1 flex w-fit flex-col gap-1">
                <span className="label text-mute">{label.tierLabel}</span>
                <select
                  value={item.tierKey ?? ""}
                  disabled={!item.available || item.tiers.length < 2 || busy === item.beatId}
                  onChange={(event) => void setTier(item.beatId, event.target.value as PriceKey)}
                  className="control h-9 w-full cursor-pointer text-sm disabled:cursor-not-allowed sm:w-56"
                >
                  {item.tiers.map((key) => (
                    <option key={key} value={key}>
                      {priceNames[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-5">
              {item.available && item.price !== null ? (
                <DiscountPrice
                  price={item.price}
                  before={item.before}
                  percent={item.discountPercent}
                  currency={item.currency}
                />
              ) : (
                <span className="label text-amber">{label.unavailable}</span>
              )}

              <button
                type="button"
                onClick={() => void remove(item.beatId)}
                disabled={busy === item.beatId}
                className="label text-mute underline-offset-4 hover:text-paper hover:underline disabled:opacity-50 focusable"
              >
                {label.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-line pt-6">
        <span className="label text-mute">
          {label.total} · {items.length}
        </span>

        <span className="font-mono text-xl text-paper tabular-nums">
          {payable.length > 0 ? formatMoney(total, payable[0].currency) : "—"}
        </span>

        <Button href={payable.length > 0 ? `/checkout` : undefined} disabled={payable.length === 0} size="lg">
          {label.checkout}
        </Button>
      </div>
    </div>
  );
}