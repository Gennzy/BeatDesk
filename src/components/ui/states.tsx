import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-xs", className)} />;
}

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
    <div className="signal-rail flex flex-col items-start gap-4 py-14 pl-6">
      <span aria-hidden className="size-2 bg-signal" />
      <h3 className="font-display text-title uppercase text-paper">{title}</h3>
      <p className="max-w-[46ch] text-sub text-mute">{description}</p>
      {action ? (
        <Button href={action.href} size="sm">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border border-amber/30 bg-amber/5 py-10 px-6">
      <span className="label text-amber">Ошибка / error</span>
      <h3 className="font-display text-title uppercase text-paper">{title}</h3>
      <p className="max-w-[46ch] text-sm text-mute">{description}</p>
      {action}
    </div>
  );
}