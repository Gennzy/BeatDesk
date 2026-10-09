import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-lg", className)} />;
}

/**
 * Пустое состояние.
 *
 * Раньше это была панель, выровненная по левому краю, с точкой вместо
 * знака. Читалось как приписка внизу страницы: человек, у которого ничего
 * не нашлось, оставался с ощущением, что площадка недоделана.
 *
 * Теперь это самостоятельный блок по центру — рисунок, заголовок,
 * объяснение и действие. Именно так выглядит пустое состояние там, куда
 * человек приходит за каталогом: сначала что видит, потом что делать.
 *
 * Рисунок не декоративный: волна в рамке означает «здесь должен быть звук».
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-panel border border-line px-6 py-16 text-center lg:py-20">
      <EmptyArt />

      <div className="flex max-w-[46ch] flex-col gap-2">
        <h3 className="text-balance font-display text-title uppercase leading-tight text-paper">{title}</h3>
        <p className="text-sub text-mute">{description}</p>
      </div>

      {action ? (
        <Button href={action.href} size="sm" className="mt-1">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/** Волна в рамке: «здесь должен быть звук». Обводка тонкая, как у иконок каталога. */
function EmptyArt() {
  return (
    <span aria-hidden className="relative flex size-16 items-center justify-center lg:size-20">
      <span className="absolute inset-0 rounded-panel border border-line" />

      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" strokeLinecap="round" className="relative size-8 text-accent lg:size-9">
        <defs>
          <linearGradient id="empty-art" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#eaff7a" />
            <stop offset="100%" stopColor="#7ad7ff" />
          </linearGradient>
        </defs>
        <g stroke="url(#empty-art)">
          <path d="M4 10.5v3M8 7.5v9M12 5v14M16 9v6M20 10.5v3" />
        </g>
      </svg>
    </span>
  );
}

export function ErrorState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-amber/30 bg-amber/5 px-6 py-10">
      <span className="label text-amber">Ошибка</span>
      <h3 className="font-display text-title uppercase text-paper">{title}</h3>
      <p className="max-w-[46ch] text-sm text-mute">{description}</p>
      {action}
    </div>
  );
}