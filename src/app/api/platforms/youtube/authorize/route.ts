import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, freshState, isConfigured } from "@/lib/platforms/youtube-oauth";
import { isSecretConfigured } from "@/lib/crypto";

/**
 * Начало входа в YouTube.
 *
 * Раньше такой маршрут отсутствовал, и кнопка «Подключить» просто
 * спрашивала сервер о подключении. Теперь человек уходит в Google и
 * возвращается с кодом.
 */
export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "YouTube не настроен: задайте YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET" },
      { status: 503 },
    );
  }

  // Подпись состояния идёт тем же ключом, что и токены: секрет должен быть
  // один, иначе пришлось бы хранить второй ради одной подписи.
  if (!isSecretConfigured()) {
    return NextResponse.json({ error: "Сервер не настроен: не задан PLATFORM_TOKEN_SECRET" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `youtube-auth:${user.id}`), 10, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много попыток входа, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfter / 1000)) } },
    );
  }

  const siteUrl = await getSiteUrl();
  const state = freshState(user.id, process.env.PLATFORM_TOKEN_SECRET!);

  // Состояние кладём в подпись, а не в куку: ссылка из письма не должна
  // открываться повторно, а подпись живёт только десять минут.
  return NextResponse.redirect(authorizeUrl({ siteUrl, state }));
}
