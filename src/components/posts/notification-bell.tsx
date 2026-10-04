"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Колокольчик со счётчиком непрочитанных. Считает раз в минуту и сразу
 * после перехода на страницу уведомлений, а не по таймеру каждую секунду.
 */
export function NotificationBell() {
  const { t } = useI18n();
  const pathname = usePathname();

  const [unread, setUnread] = useState(0);

  // Возвращаем значение, а не меняем состояние: иначе setState внутри
  // вызова из эффекта ловит правило react-hooks про каскадные рендеры.
  const fetchUnread = useCallback(async (): Promise<number | null> => {
    try {
      const response = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { unread?: number };
      return typeof data.unread === "number" ? data.unread : null;
    } catch {
      // сеть недоступна: это не повод ломать шапку
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;

    void fetchUnread().then((value) => {
      if (alive && value !== null) setUnread(value);
    });

    const timer = window.setInterval(() => {
      void fetchUnread().then((value) => {
        if (value !== null) setUnread(value);
      });
    }, 60_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [fetchUnread, pathname]);

  return (
    <Link
      href="/notifications"
      aria-label={t("notifications.title")}
      className={cn(
        "label relative flex h-8 w-8 items-center justify-center border transition-colors",
        unread > 0 ? "border-signal text-signal" : "border-line text-mute hover:text-paper",
      )}
    >
      <span aria-hidden>◔</span>
      {unread > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] leading-none text-ink">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}