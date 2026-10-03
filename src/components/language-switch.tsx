"use client";

import { cn } from "@/lib/cn";

import { LOCALES } from "@/lib/i18n/locale";
import { useI18n } from "@/lib/i18n/provider";

const LABELS = { ru: "lang.ru", en: "lang.en" } as const;

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className={cn("flex items-center border border-line", className)}
    >
      {LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          aria-pressed={locale === item}
          className={cn(
            "label h-7 px-2 transition-colors duration-150",
            locale === item ? "bg-signal text-ink" : "text-mute hover:text-paper",
          )}
        >
          {t(LABELS[item])}
        </button>
      ))}
    </div>
  );
}