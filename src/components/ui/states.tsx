import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-lg", className)} />;
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
    <div className="panel flex flex-col items-start gap-4 px-6 py-10">
      <span aria-hidden className="size-1.5 bg-mute/50" />
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
    <div className="flex flex-col items-start gap-4 rounded-lg border border-amber/30 bg-amber/5 px-6 py-10">
      <span className="label text-amber">Ошибка</span>
      <h3 className="font-display text-title uppercase text-paper">{title}</h3>
      <p className="max-w-[46ch] text-sm text-mute">{description}</p>
      {action}
    </div>
  );
}