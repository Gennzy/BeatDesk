"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Значок корзины со счётчиком.
 *
 * Число берётся с сервера и обновляется по событию браузера, которое
 * рассылается после добавления в корзину. Иначе счётчик оставался бы старым
 * до перезагрузки, и человек решил бы, что кнопка не сработала.
 *
 * Показывается только вошедшим: корзина серверная, гостю счётчик показал бы
 * чужое число.
 */
export function CartLink() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch("/api/cart");

        if (!response.ok) return;

        const data = (await response.json()) as { items?: unknown[] };

        if (alive) setCount(Array.isArray(data.items) ? data.items.length : 0);
      } catch {
        // Сеть недоступна или человек вышел из аккаунта: тихо оставляем
        // прошлое число, значок без счётчика всё равно работает.
      }
    }

    void load();

    function refresh() {
      void load();
    }

    // Событие после добавления в корзину.
    window.addEventListener("beatdesk:cart", refresh);
    // Возврат на страницу после оформления: корзина уже пуста.
    window.addEventListener("focus", refresh);

    return () => {
      alive = false;
      window.removeEventListener("beatdesk:cart", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname]);

  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? t("cart.countWith", { count: String(count) }) : t("cart.title")}
      className="relative flex size-9 items-center justify-center rounded-pill border border-line text-mute transition-colors hover:border-line-2 hover:text-paper focusable"
    >
      <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 3h1.8l1.7 8.4h8.3l1.7-6H5.4" />
        <circle cx="7.5" cy="15" r="1.3" />
        <circle cx="14" cy="15" r="1.3" />
      </svg>

      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 font-mono text-[10px] font-semibold text-ink tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  );
}