import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshTokens } from "@/lib/platforms/youtube-oauth";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Действующий токен YouTube для пользователя.
 *
 * Токен лежит зашифрованным и живёт час. Длинная загрузка видео идёт минуты,
 * и токен может протухнуть посреди неё — тогда YouTube отвечает 401 на
 * середине, куски уже приняты, а ролик не создан. Поэтому протухание
 * проверяется до старта, а не лечится повтором вслепую.
 */

/** За сколько секунд до истечения считаем токен протухшим. */
const SKEW_SECONDS = 120;

/** С запасом: при протухании во время загрузки успеем обновить и повторить. */
const MIN_VALID_MS = 10 * 60 * 1000;

type Connection = {
  access_token_cipher: string | null;
  refresh_token_cipher: string | null;
  expires_at: string | null;
};

export async function getAccessToken(userId: string): Promise<string | null> {
  const supabase = getAdminClient();

  const { data } = await supabase
    .from("platform_connections")
    .select("access_token_cipher, refresh_token_cipher, expires_at")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .maybeSingle();

  const connection = data as Connection | null;

  if (!connection?.access_token_cipher) return null;

  let access: string;

  try {
    access = decryptSecret(connection.access_token_cipher);
  } catch {
    // Зашифровано другим ключом: сервер сменил PLATFORM_TOKEN_SECRET.
    // Молча считать это «нет подключения» нельзя — человек увидит, что
    // канал отключился, и начнёт подключать заново по не той причине.
    throw new Error("YouTube подключён, но токен не расшифровывается: сервер сменил секрет.");
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;

  if (expiresAt - Date.now() > MIN_VALID_MS) return access;

  // Токен протух или вот-протухнет — обновляем.
  if (!connection.refresh_token_cipher) {
    throw new Error("Сессия YouTube истекла. Подключите канал заново.");
  }

  const refresh = decryptSecret(connection.refresh_token_cipher);
  const result = await refreshTokens(refresh);

  if ("error" in result) {
    throw new Error(`YouTube не обновил сессию: ${result.error}. Подключите канал заново.`);
  }

  // Refresh возвращает новый access, а refresh_token у Google не всегда
  // приходит в ответе: если его нет, старый остаётся действительным.
  await supabase
    .from("platform_connections")
    .update({
      access_token_cipher: encryptSecret(result.tokens.accessToken),
      ...(result.tokens.refreshToken
        ? { refresh_token_cipher: encryptSecret(result.tokens.refreshToken) }
        : {}),
      expires_at: new Date(result.tokens.expiresAt - SKEW_SECONDS * 1000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("platform", "youtube");

  return result.tokens.accessToken;
}