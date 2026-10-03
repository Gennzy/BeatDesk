import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xs border border-line bg-ink-2 px-3 text-paper transition-colors duration-150 hover:border-line-2 focus:border-signal focus-visible:border-signal focus-visible:ring-2 focus-visible:ring-signal/25 focus-visible:outline-none disabled:opacity-50";

export function Input({ className, ...rest }: ComponentPropsWithoutRef<"input">) {
  return <input className={cn(control, "h-12 text-base sm:text-sm", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(control, "min-h-32 resize-y py-3 text-sm leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentPropsWithoutRef<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-12 cursor-pointer pr-10 text-sm", className)} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 10 6"
        className="pointer-events-none absolute top-1/2 right-4 h-1.5 w-2.5 -translate-y-1/2 fill-mute"
      >
        <path d="M0 0h10L5 6z" />
      </svg>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="label text-paper">{label}</span>
        {optional ? <span className="label text-mute">{optional}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="label text-amber">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-mute">{hint}</p>
      ) : null}
    </div>
  );
}