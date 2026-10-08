"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { useToast } from "@/components/ui/toast";

type Mode = "buyer" | "seller";

/**
 * Выбор роли: продавец или покупатель.
 *
 * Сделан двумя крупными карточками, а не селектом и не переключателем. Это
 * не настройка из списка, а выбор того, что человек увидит при входе, — и он
 * должен понимать разницу до нажатия, а не после. Поэтому у каждой стороны
 * написано, что она даёт.
 *
 * Роль ничего не запрещает: продавец покупает, покупатель выкладывает биты.
 * Как только это превратится в запрет, переключатель станет ловушкой.
 */
export function ModeSwitch({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [current, setCurrent] = useState<Mode>(mode);
  const [busy, setBusy] = useState(false);

  const options: { key: Mode; icon: IconName; title: "mode.seller" | "mode.buyer"; hint: "mode.sellerHint" | "mode.buyerHint" }[] = [
    { key: "seller", icon: "waveform", title: "mode.seller", hint: "mode.sellerHint" },
    { key: "buyer", icon: "search", title: "mode.buyer", hint: "mode.buyerHint" },
  ];

  async function choose(next: Mode) {
    if (busy || next === current) return;
    setBusy(true);

    // Ставим выбор сразу: переключатель должен отвечать на нажатие, а не
    // через круг до сервера. При ошибке вернём назад.
    const previous = current;
    setCurrent(next);

    try {
      const response = await fetch("/api/profile/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });

      if (!response.ok) {
        setCurrent(previous);
        toast.show({ icon: "close", title: t("mode.failed") });
        return;
      }

      // Навигация и подписи зависят от роли, поэтому страницу перечитываем.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="label text-mute">{t("mode.title")}</span>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = current === option.key;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => void choose(option.key)}
              aria-pressed={active}
              disabled={busy}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                active
                  ? "border-signal bg-signal/10"
                  : "border-line bg-ink-2 hover:border-line-2",
              )}
            >
              <span className={cn("mt-0.5", active ? "text-signal" : "text-mute")}>
                <Icon name={option.icon} className="size-4" />
              </span>

              <span className="flex min-w-0 flex-col gap-1">
                <span className={cn("label", active ? "text-paper" : "text-mute")}>{t(option.title)}</span>
                <span className="text-xs leading-relaxed text-mute">{t(option.hint)}</span>
              </span>

              {active ? (
                <span className="ml-auto shrink-0 text-signal">
                  <Icon name="check" className="size-4" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-mute">{t("mode.note")}</p>
    </div>
  );
}