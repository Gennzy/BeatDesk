import { NextResponse } from "next/server";

import { decryptSecret, encryptSecret, isSecretConfigured } from "@/lib/crypto";
import { channelOf, isConfigured, refreshTokens } from "@/lib/platforms/youtube-oauth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Проверка подключения YouTube.
 *
 * Кнопка «Проверить» раньше честно отвечала «данные подключения не
 * сохранены», и это был весь её смысл. Теперь здесь видно, какой канал
 * подключён и живой ли токен.
 *
 * Заодно обновляем токен, если он истёк: иначе проверка была бы приговором
 * часу после подключения, хотя refresh_token ещё рабочий.
 */
export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "YouTube не настроен на сервере" }, { status: 503 });
  }

  if (!isSecretConfigured()) {
    return NextResponse.json({ error: "Сервер не настроен: не задан PLATFORM_TOKEN_SECRET" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `youtube-check:${user.id}`), 15, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много проверок, подожди минуту" }, { status: 429 });
  }

  const { data: row } = await supabase
    .from("platform_connections")
    .select("access_token_cipher, refresh_token_cipher, expires_at, meta")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .maybeSingle();

  if (!row?.access_token_cipher) {
    // Строки нет вовсе: это «не подключено», а не «сломано».
    return NextResponse.json({ ok: false, problem: "none" }, { status: 404 });
  }

  let token: string;
  try {
    token = decryptSecret(row.access_token_cipher);
  } catch {
    return NextResponse.json({ ok: false, problem: "noToken" }, { status: 200 });
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;

  // За минуту до истечения считаем токен уже негодным: сеть и часы расходятся.
  if (expiresAt && expiresAt - Date.now() < 60_000 && row.refresh_token_cipher) {
    let refreshed: string | null = null;

    try {
      refreshed = decryptSecret(row.refresh_token_cipher);
    } catch {
      refreshed = null;
    }

    if (refreshed) {
      const result = await refreshTokens(refreshed);

      if ("tokens" in result) {
        token = result.tokens.accessToken;

        await supabase
          .from("platform_connections")
          .update({ access_token_cipher: encryptSecret(token), expires_at: new Date(result.tokens.expiresAt).toISOString() })
          .eq("user_id", user.id)
          .eq("platform", "youtube");
      }
    }
  }

  const channel = await channelOf(token);

  if (!channel) {
    return NextResponse.json({ ok: false, problem: "noToken", detail: "Токен не читает канал — войди заново" }, { status: 200 });
  }

  return NextResponse.json({ ok: true, label: channel.title, meta: { channelId: channel.id, channelUrl: channel.url } });
}
