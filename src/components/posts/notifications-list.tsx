"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/provider";
import type { Notification, NotificationKind } from "@/app/api/notifications/route";

const KIND_LABELS: Record<NotificationKind, "notifications.reply" | "notifications.like" | "notifications.follow"> = {
  reply: "notifications.reply",
  like: "notifications.like",
  follow: "notifications.follow",
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

  return (
    <div className="flex flex-col gap-5">
      {unread > 0 ? (
        <Button variant="ink" size="sm" disabled={busy} onClick={() => void markRead()} className="w-fit">
          {t("notifications.markAll")}
        </Button>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sub text-mute">{t("notifications.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const body = (
              <div className="flex items-start gap-3">
                {item.actorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.actorAvatar} alt="" loading="lazy" decoding="async" className="size-8 shrink-0 object-cover" />
                ) : (
                  <span aria-hidden className="size-8 shrink-0 bg-ink-3" />
                )}

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm text-paper">
                    <span className="label">@{item.actorUsername}</span>{" "}
                    <span className="text-mute">{t(KIND_LABELS[item.kind])}</span>
                  </p>
                  {item.postExcerpt ? (
                    <p className="truncate text-xs text-mute">{item.postExcerpt}</p>
                  ) : null}
                  <time dateTime={item.createdAt} className="label text-mute">
                    {timeAgo(item.createdAt, locale)}
                  </time>
                </div>

                {!item.readAt ? (
                  <span aria-label={t("notifications.unreadOnly")} className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />
                ) : null}
              </div>
            );

            return (
              <li key={item.id} className={cn("border p-3", item.readAt ? "border-line bg-ink-2" : "border-signal/40 bg-ink-2")}>
                {item.postId ? (
                  <Link href={`/posts/${item.postId}`} onClick={() => void markRead([item.id])} className="block">
                    {body}
                  </Link>
                ) : (
                  <Link href={`/beatmakers/${item.actorUsername}`} onClick={() => void markRead([item.id])} className="block">
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}