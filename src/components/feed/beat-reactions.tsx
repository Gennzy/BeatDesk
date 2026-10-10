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
  isOwn = false,
}: {
  beatId: string;
  initialLikes: number;
  initialSaves: number;
  initialLiked: boolean;
  initialSaved: boolean;
  signedIn: boolean;
  /** Свой бит: кнопки гасятся, потому что лайк самому себе ничего не даёт. */
  isOwn?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [likes, setLikes] = useState(initialLikes);
  const [saves, setSaves] = useState(initialSaves);
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function react(kind: "like" | "save") {
    /*
     * Свой бит реагировать нельзя, и раньше об этом сообщала ошибка от
     * сервера: человек нажимал, оптимистичный счётчик менялся и тут же
     * откатывался. Кнопки просто гасятся — это честнее и не пугает ошибкой.
     */
    if (isOwn) return;

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

  /*
   * Разбор значков разберён на два контрола, потому что раньше они были
   * двумя почти одинаковыми кнопками, и расхождение между ними пришлось
   * держать в голове.
   *
   * Что было не так: у активной кнопки появлялась заливка и скругление,
   * то есть она становилась пилюлей, а у неактивной ничего не было — значок
   * голый. Рядом это читалось как два разных элемента, а не как один
   * переключатель.
   *
   * Второе: счётчик показывался только при ненулевом числе, и от этого
   * менялась ширина кнопки. Две кнопки прыгали по карточке при каждом
   * нажатии, а цена справа от них сдвигалась вместе с ними. Слот под
   * число теперь резервируется всегда.
   */
  return (
    <div className="flex items-center gap-5">
      <Reaction
        icon="heart"
        count={likes}
        active={liked}
        disabled={isOwn}
        label={t("react.like")}
        hint={isOwn ? t("react.own") : t("react.like")}
        onClick={() => void react("like")}
      />

      <Reaction
        icon="bookmark"
        count={saves}
        active={saved}
        disabled={isOwn}
        label={t("react.save")}
        hint={isOwn ? t("react.own") : t("react.save")}
        onClick={() => void react("save")}
      />
    </div>
  );
}

/**
 * Один контрол реакции: значок и счётчик.
 *
 * Активное состояние — цвет, а не заливка. Заливка превращала кнопку в
 * кружок, и рядом с голым значком рядом смотрелся стопкой разных
 * элементов.
 */
function Reaction({
  icon,
  count,
  active,
  disabled,
  label,
  hint,
  onClick,
}: {
  icon: "heart" | "bookmark";
  count: number;
  active: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={count > 0 ? `${label}: ${count}` : label}
      title={hint}
      className={cn(
        "group flex items-center gap-1.5 transition-colors focusable",
        active ? "text-signal" : "text-mute hover:text-paper",
        disabled && "cursor-default opacity-40 hover:text-mute",
      )}
    >
      <Icon name={icon} className="size-4 transition-transform group-active:scale-90" filled={active} />

      {/* Слот зарезервирован: иначе соседний контрол прыгает по сетке. */}
      <span className="min-w-3 text-right font-mono text-xs tabular-nums">{count > 0 ? count : ""}</span>

    </button>
  );
}
