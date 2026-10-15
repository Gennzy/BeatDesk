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
  /**
   * Смысл сообщения, а не его цвет.
   *
   * Раньше тон был один на все случаи, и «ссылка скопирована» выглядело
   * ровно так же, как «свой бит реагировать нельзя». Человек успевал
   * прочитать и не понять, что произошло: успех и отказ требуют разного
   * внимания.
   */
  tone: ToastTone;
  /** Сколько лежит. Отказ держим дольше успеха: его надо успеть прочесть. */
  duration: number;
};

type ToastTone = "info" | "success" | "error";

type ToastInput = Omit<Toast, "id" | "tone" | "duration"> & { tone?: ToastTone; duration?: number };

type ToastApi = {
  show: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 5_000;
/** Отказ не прячется через пять секунд: к этому времени его уже прочитали. */
const ERROR_MS = 9_000;
const EXIT_MS = 220;

const TONE_DURATION: Record<ToastTone, number> = {
  info: VISIBLE_MS,
  success: VISIBLE_MS,
  error: ERROR_MS,
};

/**
 * Оформление по смыслу.
 *
 * Цвет идёт на рамку, иконку и значок закрытия — то есть на всё, что видно
 * боковым зрением. Заливка остаётся тёмной: светлая плашка поверх чёрной
 * страницы выглядит как чужое окно и спорит с карточками битов.
 */
const TONE_STYLE: Record<ToastTone, { border: string; badge: string; accent: string }> = {
  info: { border: "border-line-2", badge: "border-line-2", accent: "text-paper" },
  success: { border: "border-signal/45", badge: "border-signal/70 bg-signal/10", accent: "text-signal" },
  error: { border: "border-danger/50", badge: "border-danger/70 bg-danger/10", accent: "text-danger" },
};

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
      const tone = input.tone ?? "info";

      setToasts((prev) => [
        ...prev.slice(-2),
        { ...input, id, tone, duration: input.duration ?? TONE_DURATION[tone] },
      ]);

      const timer = window.setTimeout(() => dismiss(id), input.duration ?? TONE_DURATION[tone]);
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
          // Отступ сверху равен высоте шапки: уведомление выезжало из-под самой
          // шапки и накрывало переключатель языка.
          "pointer-events-none fixed inset-x-0 top-[4.5rem] z-100 flex flex-col items-center gap-2 px-4",
          // На телефоне во всю ширину, на широком экране — колонкой у края,
          // чтобы не закрывать центр страницы.
          "sm:items-end sm:pr-6",
        )}
      >
        {toasts.map((toast) => {
          const tone = TONE_STYLE[toast.tone];

          const inner = (
            <>
              {/*
                Иконка в круге с рамкой по смыслу: успех и отказ читаются
                боковым зрением, не вчитываясь в текст.
              */}
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full border bg-ink",
                  tone.badge,
                  tone.accent,
                )}
              >
                {toast.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={toast.avatar} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <Icon name={toast.icon} className="size-[1.15rem]" />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/*
                  Две строки, а не одна: отказ почти всегда длиннее
                  заголовка, а обрезанное посередине сообщение не читается
                  вообще — человек гадает, что же произошло.
                */}
                <span className="line-clamp-2 text-sm font-semibold text-paper">{toast.title}</span>
                {toast.body ? <span className="line-clamp-2 text-xs text-mute">{toast.body}</span> : null}
              </span>

              {toast.href ? (
                <Icon name="chevronRight" className="size-4 shrink-0 text-mute" />
              ) : (
                <Icon name="close" className={cn("size-4 shrink-0", tone.accent)} />
              )}
            </>
          );

          const className = cn(
            /*
             * Плашка поднята над страницей: светлее фона, с размытием
             * подложки, рамкой и настоящей тенью. Раньше это был тёмный
             * прямоугольник без углов на почти чёрном фоне — уведомление
             * было видно только потому, что человек знал, что оно там.
             */
            "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-panel border bg-ink-3/95 px-3.5 py-3 text-left backdrop-blur-sm",
            "shadow-[var(--shadow-3)]",
            tone.border,
            "transition duration-base ease-out motion-safe:transition-transform",
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