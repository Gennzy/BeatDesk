import type { Locale } from "@/lib/i18n/locale";

const RU_UNITS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [3600, "minute"],
  [86400, "hour"],
  [604800, "day"],
  [2629800, "week"],
  [31557600, "month"],
  [Infinity, "year"],
];

/** «5 минут назад». Для ленты важно расстояние, а не календарная дата. */
export function timeAgo(iso: string, locale: Locale): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const unitLocale = locale === "ru" ? "ru" : "en";

  for (const [limit, unit] of RU_UNITS) {
    if (seconds < limit) {
      const divisor = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3600 : unit === "day" ? 86400 : unit === "week" ? 604800 : unit === "month" ? 2629800 : 31557600;
      return new Intl.RelativeTimeFormat(unitLocale, { numeric: "auto" }).format(-Math.floor(seconds / divisor), unit);
    }
  }

  return new Intl.RelativeTimeFormat(unitLocale, { numeric: "auto" }).format(0, "year");
}