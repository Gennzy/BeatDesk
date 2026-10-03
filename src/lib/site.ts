import { headers } from "next/headers";

/** Название и описание сайта для метаданных. */
export const SITE_NAME = "BeatDesk";

export const SITE_DESCRIPTION =
  "BeatDesk ведёт бит от загрузки до публикации: имена файлов, тексты для постов и данные для маркетплейсов, автопост в Telegram, ВК и Discord. Мастера и стемы остаются приватными.";

/**
 * Адрес сайта для canonical, og-тегов, sitemap и ссылок в постах.
 * Переменная окружения приоритетна, но если в ней localhost или она
 * не задана, адрес берётся из заголовков запроса: на Vercel это
 * работает и для продакшена, и для превью-деплоев.
 */
export async function getSiteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (fromEnv && !fromEnv.includes("localhost") && fromEnv.includes(".")) {
    return fromEnv.replace(/\/+$/, "");
  }

  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");

  if (!host) {
    return (fromEnv ?? "http://localhost:3000").replace(/\/+$/, "");
  }

  const proto = store.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}