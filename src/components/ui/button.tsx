import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "signal" | "ink" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * Кнопка.
 *
 * Форма одинаковая на всех трёх размерах: раньше скругление задавалось здесь
 * как rounded-xs, а в разметке дописывались rounded-pill, и две кнопки рядом
 * выглядели разными инструментами.
 *
 * Нажатие слегка приседает — на чёрном без этого кнопка кажется неотзывчивой,
 * потому что цвет мгновенно не меняется.
 */
const base =
  "inline-flex items-center justify-center gap-2 font-display uppercase tracking-[0.14em] whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 select-none " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  // Главное действие. Светлая заливка даёт глубину и поднимает кнопку над
  // тёмным фоном без всякой тени.
  signal: "rounded-pill bg-signal text-ink hover:bg-paper",
  // Обычное действие: та же форма, но рамка и подложка отделяют её от фона.
  ink: "rounded-pill border border-line-2 bg-ink-2 text-paper hover:border-line-2 hover:bg-ink-3",
  ghost: "rounded-pill text-mute hover:bg-ink-2 hover:text-paper",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[11px]",
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
    // Внешний адрес через next/link открывается в той же вкладке и без rel,
    // а площадки публикации открывают в новой: так человек не теряет
    // страницу, с которой ушёл.
    if (/^https?:\/\//.test(href)) {
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className={classes}>
          {children}
        </a>
      );
    }

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