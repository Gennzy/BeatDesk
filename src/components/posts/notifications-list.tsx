"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import type { Notification, NotificationKind } from "@/app/api/notifications/route";

/**
 * Вид уведомления: иконка, подпись и куда ведёт нажатие.
 *
 * Ключи подписей заданы явно, потому что t() принимает только строковые
 * литералы из словаря.
 */
type Row = {
  icon: IconName;
  label: "notifications.reply" | "notifications.like" | "notifications.follow" | "notifications.sale" | "notifications.achievement";
  href: (item: Notification) => string;
};

const KINDS: Record<NotificationKind, Row> = {
  reply: {
    icon: "reply",
    label: "notifications.reply",
    href: (item) => (item.postId ? `/posts/${item.postId}` : "/notifications"),
  },
  like: {
    icon: "heart",
    label: "notifications.like",
    href: (item) => (item.postId ? `/posts/${item.postId}` : "/notifications"),
  },
  follow: {
    icon: "follow",
    label: "notifications.follow",
    href: (item) => `/beatmakers/${item.actorUsername}`,
  },
  sale: {
    icon: "sale",
    label: "notifications.sale",
    // Продажа ведёт в заказ: человеку нужно проверить оплату и отдать
    // файл, а не просто посмотреть, кто именно купил.
    href: (item) => (item.orderId ? `/orders/${item.orderId}` : "/notifications"),
  },
  achievement: {
    icon: "achievement",
    label: "notifications.achievement",
    // Ник подставляет страница: маршрута /beatmakers/me нет, а достижения
    // живут на публичном профиле.
    href: () => "/profile",
  },
};

export function NotificationsList({ initial }: { initial: Notification[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  const unread = items.filter((item) => !item.readAt).length;

  async function markRead(ids?: string[]) {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids ?? [] }),
      });
      if (!response.ok) return;

      const stamp = new Date().toISOString();
      setItems((prev) =>
        prev.map((item) => (!item.readAt && (!ids || ids.includes(item.id)) ? { ...item, readAt: stamp } : item)),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 border border-line bg-ink-2 p-8">
        <Icon name="bell" className="size-6 text-mute" />
        <p className="text-sub text-mute">{t("notifications.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {unread > 0 ? (
        <Button variant="ink" size="sm" disabled={busy} onClick={() => void markRead()} className="w-fit">
          {t("notifications.markAll")}
        </Button>
      ) : null}

      <ul className="flex flex-col gap-px bg-line">
        {items.map((item) => {
          const row = KINDS[item.kind] ?? KINDS.reply;
          const who = item.actorUsername ? `@${item.actorUsername}` : t("notifications.system");
          const label = t(row.label);
          const body = item.beatTitle ? label.replace("{beat}", item.beatTitle) : label.replace("{beat}", "");
          const link = item.beatId ? `/beats/${item.beatId}` : null;

          const inner = (
            <>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center",
                  item.readAt ? "bg-ink-3 text-mute" : "bg-signal/15 text-signal",
                )}
              >
                {item.actorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.actorAvatar} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <Icon name={row.icon} className="size-4" />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm text-paper">
                  <span className="font-semibold">{who}</span>{" "}
                  <span className="text-mute">{body}</span>
                </span>

                {item.beatTitle ? (
                  <span className="truncate text-xs text-mute">{item.beatTitle}</span>
                ) : item.postExcerpt ? (
                  <span className="truncate text-xs text-mute">{item.postExcerpt}</span>
                ) : null}

                <TimeAgo iso={item.createdAt} locale={locale} className="label text-mute/70" />
              </span>

              {!item.readAt ? (
                <span aria-label={t("notifications.unreadOnly")} className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" />
              ) : null}
            </>
          );

          return (
            <li key={item.id} className={cn("transition-colors", item.readAt ? "bg-ink-2" : "bg-ink-2 hover:bg-ink-3")}>
              <Link
                href={row.href(item)}
                onClick={() => void markRead([item.id])}
                className="flex items-start gap-3 px-4 py-3.5"
              >
                {inner}
              </Link>

              {/* Уведомление о продаже ведёт в заказ, а покупателю интересен
                  сам бит: даём второй путь, не заменяя первый. */}
              {link && item.kind === "sale" ? (
                <Link
                  href={link}
                  onClick={() => void markRead([item.id])}
                  className="flex items-center gap-1.5 px-4 pb-3.5 text-xs text-mute hover:text-paper"
                >
                  <Icon name="chevronRight" className="size-3" />
                  {item.beatTitle}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}