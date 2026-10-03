import type { SupabaseServerClient } from "@/lib/supabase/server";

import { publishToDiscord } from "./adapters/discord";
import { publishToTelegram } from "./adapters/telegram";
import { publishToVk } from "./adapters/vk";
import type { PlatformConnection } from "./adapters/vk";
import { PLATFORM_MAP, type PlatformId } from "./registry";
import { buildPayload, type PublishBeat, type PublishResult } from "./payload";

export type StoredConnection = {
  id: string;
  platform: string;
  label: string | null;
  accessTokenCipher: string | null;
  refreshTokenCipher: string | null;
  expiresAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export async function loadConnections(supabase: SupabaseServerClient, userId: string): Promise<StoredConnection[]> {
  const { data } = await supabase.from("platform_connections").select("*").eq("user_id", userId);

  // Supabase отдаёт колонки в snake_case, а тип и расшифровка ждут camelCase.
  // Без переноса токен читался как undefined и автопост молча падал.
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      platform: String(record.platform),
      label: (record.label as string | null) ?? null,
      accessTokenCipher: (record.access_token_cipher as string | null) ?? null,
      refreshTokenCipher: (record.refresh_token_cipher as string | null) ?? null,
      expiresAt: (record.expires_at as string | null) ?? null,
      meta: (record.meta ?? {}) as Record<string, unknown>,
      createdAt: String(record.created_at ?? ""),
    };
  });
}

function toConnection(connection: StoredConnection | undefined): PlatformConnection {
  return {
    accessToken: null,
    meta: (connection?.meta ?? {}) as Record<string, string | number | null>,
  };
}

/** Одна попытка публикации. Ручные площадки отдают ссылку для открытия. */
export async function publishBeat(input: {
  platform: PlatformId;
  beat: PublishBeat;
  connection?: StoredConnection;
  decrypt?: (payload: string) => string;
  telegramToken?: string | null;
  siteUrl: string;
}): Promise<PublishResult> {
  const platform = PLATFORM_MAP[input.platform];
  const payload = buildPayload(input.beat, input.siteUrl);

  // токен площадки лежит только в зашифрованной колонке, в meta его больше нет
  const decrypt = (connection: StoredConnection | undefined): string | null => {
    if (!connection?.accessTokenCipher || !input.decrypt) return null;
    try {
      return input.decrypt(connection.accessTokenCipher);
    } catch {
      return null;
    }
  };

  if (platform.kind === "manual") {
    return {
      ok: false,
      error: platform.note ?? "Ручная публикация: открой площадку и вставь готовый блок",
      detail: { openUrl: platform.openUrl ?? null },
    };
  }

  if (input.platform === "telegram") {
    const token = input.telegramToken;
    if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN не задан на сервере" };

    return publishToTelegram(toConnection(input.connection), payload, token, input.siteUrl);
  }

  if (input.platform === "vk") {
    const decrypted = decrypt(input.connection);
    const meta = (input.connection?.meta ?? {}) as Record<string, string | number | null>;

    return publishToVk({ accessToken: decrypted, meta }, payload);
  }

  if (input.platform === "discord") {
    return publishToDiscord(
      {
        accessToken: decrypt(input.connection),
        meta: (input.connection?.meta ?? {}) as Record<string, string | number | null>,
      },
      payload,
    );
  }

  if (input.platform === "soundcloud" || input.platform === "youtube") {
    return {
      ok: false,
      error:
        input.platform === "youtube"
          ? "Для YouTube нужен видеофайл: подключи OAuth и приложи видео"
          : "Подключи SoundCloud через OAuth, чтобы выкладывать треки",
    };
  }

  return { ok: false, error: "Площадка пока не поддерживается" };
}

export async function recordPost(input: {
  supabase: SupabaseServerClient;
  userId: string;
  beatId: string;
  platform: string;
  connectionId: string | null;
  status: "published" | "failed";
  externalUrl?: string | null;
  error?: string | null;
}) {
  await input.supabase.from("platform_posts").insert({
    beat_id: input.beatId,
    user_id: input.userId,
    platform: input.platform,
    connection_id: input.connectionId,
    status: input.status,
    external_url: input.externalUrl ?? null,
    error: input.error ?? null,
  });
}
