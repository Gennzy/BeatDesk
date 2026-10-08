"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import type { Notification, NotificationKind } from "@/app/api/notifications/route";

/**
 * Вид уведомления.
 *
 * Ключи подписей заданы явно: t() принимает строковые литералы из словаря, и
 * шаблонный `notifications.${kind}` в него не попадает.
 */
type Row = {
  icon: IconName;
  /** Кто прислал: 0 — система, 1 — человек. Меняет вид значка. */
  from: "person" | "system";
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
    | "notifications.orderReady"
    | "notifications.beatComment";
  href: (item: Notification) => string;
};

const KINDS: Record<NotificationKind, Row> = {
  reply: { icon: "reply", from: "person", label: "notifications.reply", href: (item) => (item.postId ? `/posts/${item.postId}` : "/notifications") },
  like: { icon: "heart", from: "person", label: "notifications.like", href: (item) => (item.postId ? `/posts/${item.postId}` : "/notifications") },
  follow: { icon: "follow", from: "person", label: "notifications.follow", href: (item) => `/beatmakers/${item.actorUsername}` },
  sale: { icon: "sale", from: "person", label: "notifications.sale", href: (item) => (item.orderId ? `/orders/${item.orderId}` : "/notifications") },
  achievement: { icon: "achievement", from: "system", label: "notifications.achievement", href: () => "/profile" },
  beat_uploaded: { icon: "upload", from: "system", label: "notifications.beatUploaded", href: (item) => (item.beatId ? `/beats/${item.beatId}` : "/cabinet/beats") },
  beat_failed: { icon: "close", from: "system", label: "notifications.beatFailed", href: () => "/cabinet/upload" },
  beat_published: { icon: "check", from: "system", label: "notifications.beatPublished", href: (item) => (item.beatId ? `/beats/${item.beatId}` : "/cabinet/beats") },
  review: { icon: "heart", from: "person", label: "notifications.review", href: (item) => (item.beatId ? `/beats/${item.beatId}` : "/notifications") },
  order_ready: { icon: "download", from: "system", label: "notifications.orderReady", href: (item) => (item.orderId ? `/orders/${item.orderId}` : "/notifications") },
  beat_comment: { icon: "reply", from: "person", label: "notifications.beatComment", href: (item) => (item.beatId ? `/beats/${item.beatId}#comments` : "/notifications") },
};

type Filter = "all" | "sales" | "social";

const FILTERS: { key: Filter; label: "notifications.filterAll" | "notifications.filterSales" | "notifications.filterSocial" }[] = [
  { key: "all", label: "notifications.filterAll" },
  { key: "sales", label: "notifications.filterSales" },
  { key: "social", label: "notifications.filterSocial" },
];

const SALES: NotificationKind[] = ["sale", "order_ready", "review"];

/**
 * Уведомления.
 *
 * Разделены на группы по времени — сегодня, вчера, неделя. Сплошной список
 * с датами не читается: за неделю в нём копятся десятки строк, и человек
 * перестаёт их открывать.
 *
 * Фильтр по смыслу, а не по виду значка: «продажи» — это деньги, «общение» —
 * это люди. Иконки в списке разные, а вопрос всегда один.
 */
export function NotificationsList({ initial }: { initial: Notification[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const unread = items.filter((item) => !item.readAt).length;
  const unreadIn = (list: Notification[]) => list.filter((item) => !item.readAt).length;

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => (filter === "sales" ? SALES : !SALES.includes(item.kind)))),
    [filter, items],
  );

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

  const groups = groupByDay(visible, locale);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((entry) => {
          const count = entry.key === "all" ? items.length : entry.key === "sales" ? items.filter((i) => SALES.includes(i.kind)).length : items.filter((i) => !SALES.includes(i.kind)).length;

          return (
            <button key={entry.key} type="button" onClick={() => setFilter(entry.key)} aria-pressed={filter === entry.key} className="tab">
              {t(entry.label)}
              {count > 0 ? <span className="ml-1.5 font-mono opacity-60">{count}</span> : null}
            </button>
          );
        })}

        <div className="ml-auto">
          {unread > 0 ? (
            <Button variant="ink" size="sm" disabled={busy} onClick={() => void markRead()}>
              <Icon name="check" className="size-3.5" />
              {t("notifications.markAll")}
              <span className="font-mono opacity-60">{unread}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-ink-2 p-8">
          <Icon name="bell" className="size-5 text-mute" />
          <p className="text-sm text-mute">{t("notifications.empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4 px-1">
                <h2 className="label text-mute">{t(group.key as "notifications.dayToday")}</h2>
                {unreadIn(group.items) > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markRead(group.items.map((item) => item.id))}
                    className="label text-mute/70 transition-colors hover:text-paper"
                  >
                    {t("notifications.markReadGroup")}
                  </button>
                ) : null}
              </div>

              <ul className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <NotificationRow key={item.id} item={item} onRead={() => void markRead([item.id])} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: Notification; onRead: () => void }) {
  const { t, locale } = useI18n();

  const row = KINDS[item.kind] ?? KINDS.reply;
  const who = item.actorUsername ? `@${item.actorUsername}` : t("notifications.system");
  const text = t(row.label);
  const body = item.beatTitle ? text.replace("{beat}", `«${item.beatTitle}»`) : text.replace("{beat}", "");
  const unread = !item.readAt;

  return (
    <li>
      <Link
        href={row.href(item)}
        onClick={onRead}
        className={cn(
          "group flex items-start gap-3 rounded-lg border p-3.5 transition-all duration-200",
          unread
            ? "border-line-2 bg-ink-2 hover:border-signal/40"
            : "border-line bg-ink-2/60 hover:border-line-2",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            unread ? "bg-signal/15 text-signal" : "bg-ink-3 text-mute",
          )}
        >
          {row.from === "person" && item.actorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.actorAvatar} alt="" loading="lazy" decoding="async" className="size-full rounded-full object-cover" />
          ) : (
            <Icon name={row.icon} className="size-4" />
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm leading-snug text-mute">
            {row.from === "person" ? (
              <>
                <span className={cn("font-semibold", unread ? "text-paper" : "text-mute")}>{who}</span> {body}
              </>
            ) : (
              <span className={cn("font-semibold", unread ? "text-paper" : "text-mute")}>{text}</span>
            )}
          </span>

          {item.beatTitle ? <span className="truncate text-xs text-mute/70">{item.beatTitle}</span> : null}

          <TimeAgo iso={item.createdAt} locale={locale} className="label text-mute/60" />
        </span>

        {unread ? (
          <span aria-label={t("notifications.unreadOnly")} className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" />
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Группировка по дням: сегодня, вчера, неделя, дальше — по дате.
 *
 * Ключ группы и её заголовок различаются: сегодня, вчера и неделя — это
 * готовые подписи, а всё остальное приходится форматировать датой.
 */
function groupByDay(items: Notification[], locale: string) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const format = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });

  const relative: Record<string, "notifications.dayToday" | "notifications.dayYesterday" | "notifications.dayWeek"> = {
    today: "notifications.dayToday",
    yesterday: "notifications.dayYesterday",
    week: "notifications.dayWeek",
  };

  const buckets = new Map<string, Notification[]>();

  for (const item of items) {
    const days = Math.floor((midnight - new Date(item.createdAt).getTime()) / 86_400_000);

    const key =
      days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? "week" : format.format(new Date(item.createdAt));

    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return [...buckets.entries()].map(([key, list]) => ({
    key: relative[key] ?? key,
    items: list,
  }));
}
