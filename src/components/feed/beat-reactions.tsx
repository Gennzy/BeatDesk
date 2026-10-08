"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { useToast } from "@/components/ui/toast";

/**
 * Лайк и сохранение бита.
 *
 * Лайк — «послушал», сохранение — «вернусь и куплю». Скор считает сохранение
 * вдвое весомее, поэтому кнопки здесь разные, а не одна с сердечком.
 *
 * Состояние приходит с сервера, и после нажатия меняется сразу: ждать ответа
 * означало бы, что кнопка не реагирует, а человек жмёт второй раз.
 */
export function BeatReactions({
  beatId,
  initialLikes,
  initialSaves,
  initialLiked,
  initialSaved,
  signedIn,
  compact = false,
}: {
  beatId: string;
  initialLikes: number;
  initialSaves: number;
  initialLiked: boolean;
  initialSaved: boolean;
  signedIn: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [likes, setLikes] = useState(initialLikes);
  const [saves, setSaves] = useState(initialSaves);
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function react(kind: "like" | "save") {
    if (!signedIn) {
      // Гостю нажатие не откатывается молча: понятно, что нужно войти.
      toast.show({ icon: "bell", title: t("react.signInTitle"), body: t("react.signInBody"), href: "/login" });
      return;
    }

    if (busy) return;
    setBusy(true);

    const wasActive = kind === "like" ? liked : saved;
    const delta = wasActive ? -1 : 1;

    // Оптимистичное обновление: откат делаем только по факту ошибки.
    if (kind === "like") {
      setLiked(!wasActive);
      setLikes((count) => Math.max(0, count + delta));
    } else {
      setSaved(!wasActive);
      setSaves((count) => Math.max(0, count + delta));
    }

    try {
      const response = await fetch("/api/beats/" + beatId + "/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId, kind }),
      });

      if (response.ok) return;

      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      const message = data?.error;

      // Откат меняет счётчик, но не сообщение: причина объяснена человеку.
      if (kind === "like") {
        setLiked(wasActive);
        setLikes((count) => Math.max(0, count - delta));
      } else {
        setSaved(wasActive);
        setSaves((count) => Math.max(0, count - delta));
      }

      if (message) toast.show({ icon: "close", title: message });
    } catch {
      if (kind === "like") {
        setLiked(wasActive);
        setLikes((count) => Math.max(0, count - delta));
      } else {
        setSaved(wasActive);
        setSaves((count) => Math.max(0, count - delta));
      }
    } finally {
      setBusy(false);
    }
  }

  const size = compact ? "size-7 text-[11px]" : "size-8 text-xs";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void react("like")}
        aria-pressed={liked}
        aria-label={t("react.like")}
        title={t("react.like")}
        className={cn(
          "flex items-center gap-1.5 rounded-pill px-2 transition-colors",
          size,
          liked ? "bg-signal/15 text-signal" : "text-mute hover:text-paper",
        )}
      >
        <Icon name="heart" className="size-3.5" filled={liked} />
        {likes > 0 ? <span className="font-mono tabular-nums">{likes}</span> : null}
      </button>

      <button
        type="button"
        onClick={() => void react("save")}
        aria-pressed={saved}
        aria-label={t("react.save")}
        title={t("react.save")}
        className={cn(
          "flex items-center gap-1.5 rounded-pill px-2 transition-colors",
          size,
          saved ? "bg-signal/15 text-signal" : "text-mute hover:text-paper",
        )}
      >
        <Icon name="bookmark" className="size-3.5" filled={saved} />
        {saves > 0 ? <span className="font-mono tabular-nums">{saves}</span> : null}
      </button>
    </div>
  );
}