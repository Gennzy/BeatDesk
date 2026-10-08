"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatTime } from "@/components/player/player-provider";
import { cn } from "@/lib/cn";

type Props = {
  value: number;
  max: number;
  onSeek: (seconds: number) => void;
  /** Полоска одинаково выглядит в панели и в полноэкранном режиме. */
  className?: string;
  /** Крупный вариант для полноэкранного плеера. */
  size?: "sm" | "lg";
};

/**
 * Полоса воспроизведения с перемоткой.
 *
 * Раньше это была кнопка с одним onClick: перемотать можно было только
 * щелчком по нужной точке, а тянуть — нельзя. На длинном бите попасть в
 * секунду щелчком невозможно, и это читалось как «ползунок не двигается».
 *
 * Теперь это настоящий ползунок: тянется мышью и пальцем, слушается стрелок
 * на клавиатуре, а во время перетаскивания время не дёргается от
 * воспроизведения — иначе ползунок уводило бы из-под пальца.
 */
export function Progress({ value, max, onSeek, className, size = "sm" }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  // Во время перетаскивания показываем положение пальца, а не то, где сейчас
  // играет трек.
  const shown = dragging ? dragValue : value;
  const ratio = max > 0 ? Math.min(1, Math.max(0, shown / max)) : 0;

  const secondsAt = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || max <= 0) return 0;

      const rect = track.getBoundingClientRect();
      const share = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

      return share * max;
    },
    [max],
  );

  // Слушатели вешаются на окно: при быстром движении курсор уходит за
  // пределы полосы, и на самой полосе pointermove перестал бы приходить.
  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => setDragValue(secondsAt(event.clientX));
    const up = (event: PointerEvent) => {
      setDragging(false);
      onSeek(secondsAt(event.clientX));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, onSeek, secondsAt]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (max <= 0) return;

    // Шаг в пять секунд — привычный для плееров, в секунду слишком мелко.
    const step = event.shiftKey ? 15 : 5;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onSeek(Math.min(max, value + step));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onSeek(Math.max(0, value - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onSeek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onSeek(max);
    }
  }

  const big = size === "lg";
  const barHeight = big ? "h-1.5" : "h-1";
  const handleSize = big ? "size-4" : "size-3";

  return (
    <div className={cn("flex flex-1 items-center gap-3", className)}>
      <span className={cn("label w-10 text-right tabular-nums text-mute", big && "text-xs")}>{formatTime(shown)}</span>

      {/*
        Область захвата выше видимой полосы: на тонкой линии в четыре
        пикселя не попасть ни мышью, ни пальцем. Дорожка при наведении
        подсвечивается, ползунок растёт — видно, что сюда можно тянуть.
      */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Перемотка"
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatTime(shown)} из ${formatTime(max)}`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragValue(secondsAt(event.clientX));
          setDragging(true);
        }}
        className={cn(
          "group relative flex touch-none items-center",
          big ? "h-8" : "h-6",
          "flex-1 cursor-pointer rounded-pill focus-visible:outline-none",
          // Кольцо фокуса рисуем на дорожке, а не на прозрачной области:
          // иначе оно очерчивает пустое место вокруг.
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-pill bg-line transition-colors group-hover:bg-line-2",
            barHeight,
          )}
        >
          <span className="absolute inset-y-0 left-0 rounded-pill bg-signal" style={{ width: `${ratio * 100}%` }} />
        </span>

        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_12px_var(--color-signal)] transition-transform",
            handleSize,
            dragging ? "scale-110" : "group-hover:scale-110",
            // На телефоне ползунок виден всегда: подсказки наведения там нет.
            "opacity-100",
          )}
          style={{ left: `${ratio * 100}%` }}
        />

        <span className="sr-only">{formatTime(shown)}</span>
      </div>

      <span className={cn("label w-10 tabular-nums text-mute", big && "text-xs")}>{formatTime(max)}</span>
    </div>
  );
}
