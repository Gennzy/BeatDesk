"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Регулятор громкости.
 *
 * Кнопка отключения и ползунок живут вместе: человек приглушил бит,
 * вернулся через минуту и хочет вернуть ту же громкость одним нажатием,
 * а не искать, где стоял ползунок.
 *
 * На телефоне ползунок спрятан под кнопкой: панель и без него впритык,
 * а на узком экране две ручки рядом не помещаются. Кнопка остаётся —
 * отключить звук можно всегда и одним касанием.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ПОЛЗУНОК НАРИСОВАН, А НЕ input[range]
 *
 * Родной ползунок выглядит как чужеродная деталь: у него своя дорожка, свой
 * бегунок и своя толщина, и рядом с остальными элементами панели он читается
 * как вставка из другой программы. Прогресс в плеере нарисован вручную —
 * дорожка, лаймовая заливка, круглая ручка, — и громкость теперь сделана так
 * же. Один язык вместо двух.
 *
 * Заодно появилось то, чего у input[range] не бывает: ручка и заливка
 * показывают уровень крупно, на наведении ручка подрастает, а при
 * перетаскивании тянется за пальцем.
 */
export function VolumeControl({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { t } = useI18n();
  const { volume, muted, setVolume, toggleMute } = usePlayer();

  // Приглушённым считаем и явное отключение, и нулевой ползунок: иначе
  // кнопка показывала бы «звук есть», а звука не было бы.
  const silent = muted || volume === 0;

  const big = size === "lg";

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  // Во время перетаскивания показываем положение пальца, а не то, где сейчас
  // стоит громкость.
  const shown = dragging ? dragValue : volume;
  const ratio = Math.min(1, Math.max(0, shown));

  const levelAt = useCallback((clientX: number) => {
    const track = trackRef.current;

    if (!track) return 0;

    const rect = track.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

    return share;
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => setDragValue(levelAt(event.clientX));
    const up = (event: PointerEvent) => {
      setDragging(false);
      setVolume(levelAt(event.clientX));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, levelAt, setVolume]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={silent}
        aria-label={silent ? t("player.unmute") : t("player.mute")}
        title={silent ? t("player.unmute") : t("player.mute")}
        className={cn(
          "grid shrink-0 place-items-center rounded-full transition-colors",
          big ? "size-11" : "size-9",
          silent ? "text-signal" : "text-mute hover:text-paper",
        )}
      >
        <Icon name={silent ? "mute" : "volume"} className={big ? "size-6" : "size-5"} />
      </button>

      {/*
       * Ползунок виден от среднего экрана: на телефоне рядом с ним больше
       * нечего поставить.
       */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t("player.volume")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={silent ? t("player.muted") : `${Math.round(ratio * 100)}%`}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragValue(levelAt(event.clientX));
          setDragging(true);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.05;

          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            setVolume(Math.min(1, volume + step));
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            setVolume(Math.max(0, volume - step));
          }
        }}
        className={cn(
          "group relative hidden touch-none items-center sm:flex",
          big ? "h-8 w-40" : "h-6 w-24",
          "cursor-pointer rounded-pill focus-visible:outline-none",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-pill bg-line transition-colors group-hover:bg-line-2",
            big ? "h-1.5" : "h-1",
          )}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-pill bg-signal transition-[width]"
            style={{ width: `${ratio * 100}%` }}
          />
        </span>

        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-signal shadow-[0_0_12px_var(--color-signal)] transition-transform",
            big ? "size-3.5" : "size-3",
            dragging ? "scale-110" : "group-hover:scale-110",
          )}
          style={{ left: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
