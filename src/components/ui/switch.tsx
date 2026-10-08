"use client";

import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

type SwitchProps = {
  label: string;
  hint?: string;
} & Omit<ComponentPropsWithoutRef<"input">, "type">;

export function Switch({ label, hint, className, ...rest }: SwitchProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-4 rounded-lg border border-line-2 bg-ink-2 bg-ink-2 p-4 transition-colors hover:border-line-2",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input type="checkbox" className="peer sr-only" {...rest} />
        <span className="absolute inset-0 rounded-lg border border-line-2 bg-ink-2-2 bg-ink transition-colors peer-checked:border-signal peer-checked:bg-signal/15" />
        <span className="absolute top-1/2 left-1 size-3 -translate-y-1/2 bg-mute transition-all peer-checked:left-5 peer-checked:bg-signal" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="label text-paper">{label}</span>
        {hint ? <span className="text-xs leading-relaxed text-mute">{hint}</span> : null}
      </span>
    </label>
  );
}