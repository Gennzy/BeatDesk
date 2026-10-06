"use client";

import { formatTime } from "@/components/player/player-provider";
import { cn } from "@/lib/cn";

type Props = {
  value: number;
  max: number;
  onSeek: (seconds: number) => void;
  /** Полоска одинаково выглядит в панели и в полноэкранном режиме. */
  className?: string;
};

/** Полоса воспроизведения с перемоткой по клику. */
export function Progress({ value, max, onSeek, className }: Props) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const position = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * max;
  };

  return (
    <div className={cn("flex flex-1 items-center gap-3", className)}>
      <span className="label w-10 text-right text-mute">{formatTime(value)}</span>

      <button
        type="button"
        aria-label="Перемотка"
        onClick={(event) => onSeek(position(event))}
        className="group relative h-6 flex-1"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-line" />
        <span aria-hidden className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 bg-signal" style={{ width: `${ratio * 100}%` }} />
        <span
          aria-hidden
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 bg-signal opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: `${ratio * 100}%` }}
        />
      </button>

      <span className="label w-10 text-mute">{formatTime(max)}</span>
    </div>
  );
}