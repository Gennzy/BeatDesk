"use client";

import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

/**
 * Полоска прогресса.
 *
 * Один компонент на весь плеер: карточка бита, полноэкранный плеер и шапка
 * показывают одно и то же положение, и раньше каждый рисовал её сам —
 * копипастой, которая разъезжалась по высоте и цвету.
 */
export function Progress({
  value,
  className,
  tone = "signal",
  label,
}: {
  /** Доля проигранного, 0..1. */
  value: number;
  className?: string;
  tone?: "signal" | "mute";
  label?: string;
}) {
  const safe = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe * 100)}
      className={cn("h-[2px] w-full overflow-hidden bg-line", className)}
    >
      <div
        className={cn("h-full transition-[width] duration-150 ease-linear", tone === "signal" ? "bg-signal" : "bg-mute")}
        style={{ width: `${safe * 100}%` }}
      />
    </div>
  );
}

/**
 * Карточка-скелет.
 *
 * Пока грузится следующая страница ленты, под карточками стоят такие же
 * рамки, а не пустота: сетка не прыгает, когда данные приходят.
 */
export function BeatCardSkeleton() {
  return (
    <div className="surface flex flex-col">
      <Skeleton className="aspect-square w-full" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-auto h-6 w-1/3" />
      </div>
    </div>
  );
}