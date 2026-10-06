import { redirect } from "next/navigation";

import { resolve } from "@/lib/short-links-store";

/**
 * Переход по короткой ссылке.
 *
 * Адрес живёт ровно столько, сколько нужен человеку: он не раскрывает, чей
 * это бит, потому что хранит только код, а цель достаётся по нему.
 */
export default async function ShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await resolve(code);

  // Несуществующий код показываем как «ссылка не работает», а не как 404:
  // человеку важно, что делать, а не как устроен сервер.
  if ("error" in result) redirect("/?shortlink=notfound");

  redirect(result.path);
}