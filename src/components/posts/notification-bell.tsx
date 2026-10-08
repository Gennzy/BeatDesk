"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { useRealtime } from "@/lib/realtime";

type UnreadNotification = {
  id: string;
  kind: string;
  actorUsername: string | null;
  actorAvatar: string | null;
  beatTitle: string | null;
  createdAt: string;
};

/**
 * Виды уведомлений для всплывашки: иконка, ключ подписи и адрес, куда
 * ведёт нажатие.
 *
 * Тип ключа задан явно: `t()` принимает объединение строковых литералов,
 * и шаблонный `notifications.${string}` в него не попадает.
 */
/**
 * Уже показанные события живут на уровне модуля, а не компонента.
 * Колокольчик отрисован в двух шапках — на широком экране и на узком, обе
 * подписаны на одни и те же события, и счётчик внутри компонента показал бы
 * две всплывашки на один ответ.
 */
const announced = new Set<string>();

/**
 * Множество живёт всё время жизни вкладки и без границы росло бы на каждом
 * событии. Держим последние: всё, что старше, давно показано и повторно прийти
 * не может.
 */
const ANNOUNCED_LIMIT = 50;

function remember(id: string): boolean {
  if (announced.has(id)) return false;

  announced.add(id);

  if (announced.size > ANNOUNCED_LIMIT) {
    const oldest = announced.values().next().value;
    if (oldest !== undefined) announced.delete(oldest);
  }

  return true;
}

type ToastKind = {
  icon: IconName;
  label:
    | "notifications.reply"
    | "notifications.like"
    | "notifications.follow"
    | "notifications.sale"
    | "notifications.achievement"
    | "notifications.beatUploaded"
    | "notifications.beatFailed"
    | "notifications.beatPublished"
    | "notifications.review"
    | "notifications.orderReady";
  href?: string;
};

const TOAST_KINDS: Record<string, ToastKind> = {
  reply: { icon: "reply", label: "notifications.reply" },
  like: { icon: "heart", label: "notifications.like" },
  follow: { icon: "follow", label: "notifications.follow" },
  sale: { icon: "sale", label: "notifications.sale", href: "/notifications" },
  achievement: { icon: "achievement", label: "notifications.achievement" },
  beat_uploaded: { icon: "upload", label: "notifications.beatUploaded", href: "/cabinet/beats" },
  beat_failed: { icon: "close", label: "notifications.beatFailed", href: "/cabinet/upload" },
  beat_published: { icon: "check", label: "notifications.beatPublished", href: "/cabinet/beats" },
  review: { icon: "heart", label: "notifications.review", href: "/notifications" },
  order_ready: { icon: "download", label: "notifications.orderReady", href: "/notifications" },
};

/**
 * Колокольчик со счётчиком непрочитанных и всплывашкой на каждое новое
 * событие.
 *
 * Счётчик по-прежнему опрашивается раз в минуту: подписка на таблицу
 * notifications приходит с задержкой, а человек должен видеть цифру сразу,
 * а не после следующего кадра страницы.
 */
export function NotificationBell() {
  const { t } = useI18n();
  const pathname = usePathname();
  const toast = useToast();

  const [unread, setUnread] = useState(0);
  // Ник владельца для ссылки на его профиль: достижения живут там.
  const [username, setUsername] = useState<string | null>(null);

  const fetchUnread = useCallback(async (): Promise<number | null> => {
    try {
      const response = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { unread?: number; items?: UnreadNotification[] };
      return typeof data.unread === "number" ? data.unread : null;
    } catch {
      // сеть недоступна: это не повод ломать шапку
      return null;
    }
  }, []);

  const fetchLatest = useCallback(async (): Promise<UnreadNotification[]> => {
    try {
      const response = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: UnreadNotification[]; username?: string | null };
      if (typeof data.username === "string") setUsername(data.username);
      return Array.isArray(data.items) ? data.items : [];
    } catch {
      return [];
    }
  }, []);

  // Всплывашка показывается только на настоящих страницах: на самой
  // странице уведомлений человек уже смотрит на список, и баннер поверх
  // него только мешает.
  const onPage = pathname.startsWith("/notifications");

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

  useRealtime("notifications", () => {
    void fetchUnread().then((value) => {
      if (value !== null) setUnread(value);
    });

    if (onPage) return;

    void fetchLatest().then((items) => {
      for (const item of items.slice(0, 2)) {
        // Подписка на таблицу срабатывает и на своей же записи, поэтому
        // одно и то же событие всплывало бы повторно.
        if (!remember(item.id)) continue;

        const kind = TOAST_KINDS[item.kind];
        const who = item.actorUsername ? `@${item.actorUsername}` : t("notifications.system");
        const text = kind ? t(kind.label) : t("notifications.system");
        // Подпись хранит плейсхолдер {beat}, поэтому бит подставляется
        // строкой: уведомление о посте бита не содержит.
        const body = item.beatTitle ? text.replace("{beat}", `«${item.beatTitle}»`) : text.replace("{beat}", "");

        toast.show({
          icon: kind?.icon ?? "bell",
          avatar: item.actorAvatar,
          // Имя сверху, событие под ним — так строка читается как фраза,
          // а не как «@nick» и отдельное слово без конца.
          title: `${who} ${body}`,
          href: kind?.href ?? (item.kind === "achievement" && username ? `/beatmakers/${username}` : undefined),
        });
      }
    });
  });

  return (
    <Link
      href="/notifications"
      aria-label={t("notifications.title")}
      className={cn(
        "label relative flex h-8 w-8 items-center justify-center border transition-colors",
        unread > 0 ? "border-signal text-signal" : "border-line text-mute hover:text-paper",
      )}
    >
      {/* Раньше здесь стоял символ «◔», который рисовался как кружок с
          чертой и ни с чем не был похож на колокольчик. */}
      <Icon name="bell" className="size-4" />
      {unread > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] leading-none font-semibold text-ink">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}