"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/provider";
import type { PriceKey } from "@/lib/prices";

/**
 * Добавление бита в корзину.
 *
 * Сделано вторичной кнопкой рядом с покупкой, а не заменой ей. Чаще всего
 * покупают один бит и хотят сделать это за один клик; требование «сначала
 * в корзину, потом оформлять» добавляло бы шаг на путь, который и так
 * короткий.
 *
 * Состояние после нажатия — «в корзине», и это проверяется у сервера, а не
 * запоминается здесь: между открытием страницы и нажатием бит могли купить
 * или снять с продажи.
 */
export function CartButton({ beatId, tier, signedIn }: { beatId: string; tier: PriceKey | null; signedIn: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    // Гостю показываем вход, а не отказ: корзина серверная и без входа
    // не работает, но человек ещё может войти и продолжить.
    return (
      <Link
        href="/login"
        className="flex h-12 items-center rounded-control border border-line px-5 text-sm text-paper transition-colors hover:border-line-2 focusable"
      >
        {t("cart.signIn")}
      </Link>
    );
  }

  async function add() {
    if (!tier) return;

    setState("busy");
    setError(null);

    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ beatId, tier }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        setError(data?.error ?? t("cart.addError"));
        setState("idle");
        return;
      }

      setState("added");
      // Шапка читает число с сервера, поэтому сообщаем ей событием: после
      // refresh() счётчик всё равно остался бы старым до перезагрузки.
      window.dispatchEvent(new Event("beatdesk:cart"));
      router.refresh();
    } catch {
      setError(t("cart.addError"));
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void add()}
        disabled={!tier || state === "busy"}
        aria-live="polite"
        className="flex h-12 items-center gap-2 rounded-control border border-line px-5 text-sm text-paper transition-colors hover:border-line-2 disabled:cursor-not-allowed disabled:opacity-50 focusable"
      >
        <CartIcon filled={state === "added"} />
        <span>{state === "busy" ? t("cart.adding") : state === "added" ? t("cart.added") : t("cart.add")}</span>
      </button>

      {error ? <p className="label leading-relaxed text-amber">{error}</p> : null}
    </div>
  );
}

function CartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3h1.8l1.7 8.4h8.3l1.7-6H5.4" />
      <circle cx="7.5" cy="15" r="1.3" />
      <circle cx="14" cy="15" r="1.3" />
    </svg>
  );
}