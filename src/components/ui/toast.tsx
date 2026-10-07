"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Всплывающие уведомления в духе iOS: баннер выезжает сверху, держится
 * несколько секунд, уходит сам и уводит по нажатию туда, где произошло
 * событие.
 *
 * Раньше реакция на новое уведомление была только счётчиком у колокольчика:
 * человек узнавал об ответе или продаже, только если сам догадался открыть
 * страницу. Здесь событие само приходит и уходит.
 */

type Toast = {
  id: number;
  title: string;
  body?: string;
  href?: string;
  icon: IconName;
  avatar?: string | null;
};

type ToastInput = Omit<Toast, "id">;

type ToastApi = {
  show: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 5_000;
const EXIT_MS = 260;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [leaving, setLeaving] = useState<number[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setLeaving((prev) => (prev.includes(id) ? prev : [...prev, id]));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      setLeaving((prev) => prev.filter((value) => value !== id));
    }, EXIT_MS);
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { ...input, id }]);
      const timer = window.setTimeout(() => dismiss(id), VISIBLE_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  // Таймеры живут в ref: смена провайдера не должна оставлять висящие таймауты.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/*
        Объявление для скринридера: сами баннеры живут 5 секунд, человек
        мог уснуть за это время и пропустить единственное уведомление.
      */}
      <p aria-live="polite" className="sr-only">
        {toasts.length > 0 ? toasts[toasts.length - 1].title : ""}
      </p>

      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-100 flex flex-col items-center gap-2 px-4",
          // На телефоне - во всю ширину, на широком экране - колонкой у края,
          // чтобы не закрывать центр страницы.
          "sm:items-end sm:pr-6",
        )}
      >
        {toasts.map((toast) => {
          const inner = (
            <>
              <span className="flex size-9 shrink-0 items-center justify-center bg-ink-3 text-paper">
                {toast.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={toast.avatar} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <Icon name={toast.icon} className="size-4" />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-paper">{toast.title}</span>
                {toast.body ? <span className="line-clamp-2 text-xs text-mute">{toast.body}</span> : null}
              </span>

              {toast.href ? <Icon name="chevronRight" className="size-4 text-mute" /> : null}
            </>
          );

          const className = cn(
            "pointer-events-auto flex w-full max-w-sm items-center gap-3 border border-line bg-ink-2 px-3 py-2.5 text-left shadow-lg shadow-black/40",
            "transition duration-200 ease-out motion-safe:transition-transform",
            leaving.includes(toast.id) ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0",
          );

          return toast.href ? (
            <Link key={toast.id} href={toast.href} className={className} onClick={() => dismiss(toast.id)}>
              {inner}
            </Link>
          ) : (
            <button key={toast.id} type="button" className={className} onClick={() => dismiss(toast.id)}>
              {inner}
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Показать уведомление из любого места клиентского дерева. Вне провайдера
 * вызов безвреден и ничего не делает: серверные компоненты и тесты сюда не
 * попадают.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => {}, dismiss: () => {} };
}