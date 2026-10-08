import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "signal" | "dim" | "outline" | "amber";

const tones: Record<Tone, string> = {
  signal: "bg-signal text-ink",
  dim: "bg-ink-3 text-mute",
  outline: "border border-line text-mute",
  amber: "bg-amber/10 text-amber border border-amber/30",
};

export function Badge({ tone = "dim", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("label inline-flex h-6 items-center rounded-full px-2", tones[tone], className)}>{children}</span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-ink-2 shadow-[var(--shadow-1)]", className)}>{children}</div>;
}