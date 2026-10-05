import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto";
import { channelOf, exchangeCode, verifyState } from "@/lib/platforms/youtube-oauth";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Возврат из Google с кодом.
 *
 * Код одноразовый и живёт минуту, поэтому повторный заход с той же ссылкой
 * честно скажет об ошибке, а не молча создаст второе подключение.
 */

const stateSecret = () => process.env.PLATFORM_TOKEN_SECRET ?? "";

/** Человеку показываем страницу, а не JSON: он пришёл из браузера. */
function back(siteUrl: string, query: Record<string, string>) {
  const url = new URL("/settings/connections", siteUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const siteUrl = await getSiteUrl();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  // Человек нажал «Отмена» в окне Google — это не поломка.
  if (denied) return back(siteUrl, { youtube: "denied" });

  if (!code) return back(siteUrl, { youtube: "error", detail: "Google не вернул код" });

  const payload = verifyState(state, stateSecret());

  // Подпись не сошлась: значит код пришёл не из нашего входа, и привязывать
  // канал по такому запросу нельзя.
  if (!payload) return back(siteUrl, { youtube: "error", detail: "Сессия входа устарела, попробуй ещё раз" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Сессия могла закончиться, пока человек согласовывал доступ.
  if (!user || user.id !== payload.userId) {
    return back(siteUrl, { youtube: "error", detail: "Войди заново и повтори подключение" });
  }

  const exchanged = await exchangeCode({ code, siteUrl });

  if ("error" in exchanged) {
    return back(siteUrl, { youtube: "error", detail: exchanged.error.slice(0, 160) });
  }

  const { tokens } = exchanged;
  const channel = await channelOf(tokens.accessToken);

  // Токен есть, а канал не читается — публикация всё равно упадёт, поэтому
  // сохраняем как «требует настройки», а не как «подключено».
  if (!channel) {
    return back(siteUrl, { youtube: "error", detail: "Канал не читается: проверь, что доступ к нему открыт" });
  }

  const { data: previous } = await supabase
    .from("platform_connections")
    .select("refresh_token_cipher")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .maybeSingle();

  // Google отдаёт refresh_token только при первом согласии. Сохраняем
  // старый, иначе повторный вход тихо убивает автоматическое продление.
  const refreshCipher = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;

  const { error } = await supabase.from("platform_connections").upsert(
    {
      user_id: user.id,
      platform: "youtube",
      label: channel.title,
      access_token_cipher: encryptSecret(tokens.accessToken),
      refresh_token_cipher: refreshCipher ?? previous?.refresh_token_cipher ?? null,
      expires_at: new Date(tokens.expiresAt).toISOString(),
      meta: {
        channelId: channel.id,
        channelUrl: channel.url,
        ...(refreshCipher ?? previous?.refresh_token_cipher ? { hasRefresh: true } : {}),
      },
    },
    { onConflict: "user_id,platform" },
  );

  if (error) return back(siteUrl, { youtube: "error", detail: "Не удалось сохранить подключение" });

  return back(siteUrl, { youtube: "ok", channel: channel.title });
}
