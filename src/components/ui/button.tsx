import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "signal" | "ink" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xs font-display uppercase tracking-[0.14em] whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  signal: "bg-signal text-ink hover:bg-paper",
  ink: "border border-line bg-ink-2 text-paper hover:border-line-2 hover:bg-ink-3",
  ghost: "text-mute hover:text-paper",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-11 px-5 text-xs",
  lg: "h-14 px-7 text-sm",
};

export function buttonClass({ variant = "signal", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  href?: string;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

export function Button({ variant, size, href, className, children, ...rest }: ButtonProps) {
  const classes = buttonClass({ variant, size, className });

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}