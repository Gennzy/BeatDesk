import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Поля ввода.
 *
 * Стиль поля живёт в globals.css как .control: семь компонентов рисовали поля
 * сами и делали это по-разному — высотой, рамкой, поведением при фокусе.
 * Здесь только размеры: крупный для форм, компактный для панелей и подборок.
 */
export function Input({
  className,
  scale = "md",
  ...rest
}: /*
 * `size` у нативного input уже означает ширину в символах, поэтому размер
 * примитива назван scale: иначе пересечение типов даёт never, и любая
 * передача размера ломает сборку.
 */
Omit<ComponentPropsWithoutRef<"input">, "size"> & { scale?: "sm" | "md" }) {
  return <input className={cn("control", scale === "sm" ? "control-sm" : "h-12 text-base sm:text-sm", className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn("control min-h-32 resize-y py-3 text-sm leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentPropsWithoutRef<"select">) {
  return (
    <div className="relative">
      <select className={cn("control h-12 cursor-pointer pr-10 text-sm", className)} {...rest}>
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
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
  children: ReactNode;
  className?: string;
  /**
   * Связь подписи с полем.
   *
   * Без неё клик по подписи не ставит курсор, а программа чтения с экрана
   * читает «поле» вместо названия. Проставить id в разметке забывают
   * почти всегда, поэтому связь передаётся явно.
   */
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={htmlFor} className="label text-paper">
          {label}
        </label>
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