import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { decryptSecret } from "@/lib/crypto";
import type { PublishBeat } from "@/lib/platforms/payload";
import { isPlatformId } from "@/lib/platforms/registry";
import { getBotToken } from "@/lib/platforms/telegram-client";
import { loadConnections, publishBeat, recordPost } from "@/lib/platforms/publish";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

type Body = { beatIds?: string[]; platforms?: string[] };

const MAX_BEATS = 25;
const MAX_PLATFORMS = 4;

function readList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))].slice(0, limit);
}

/**
 * Массовая публикация: один запрос вместо десятков. Перебирает биты
 * по очереди, чтобы не ловить лимиты площадок, и пишет историю по
 * каждой паре бит-канал.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const limit = rateLimit(clientKey(request, `publish:${user.id}`), 6, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Подожди минуту перед следующей пачкой" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const beatIds = readList(body.beatIds, MAX_BEATS);
  const platforms = readList(body.platforms, MAX_PLATFORMS).filter(isPlatformId);

  if (beatIds.length === 0) return NextResponse.json({ error: "Выбери биты" }, { status: 400 });
  if (platforms.length === 0) return NextResponse.json({ error: "Выбери каналы" }, { status: 400 });

  const { data: beats } = await supabase
    .from("beats")
    .select("id, title, type_beat_artists, bpm, key, tags, mp3_url, cover_url, prices, currency, profiles(username)")
    .in("id", beatIds)
    .eq("owner_id", user.id);

  if (!beats || beats.length === 0) {
    return NextResponse.json({ error: "Эти биты не твои или не найдены" }, { status: 403 });
  }

  const [siteUrl, allConnections, telegramToken] = await Promise.all([
    getSiteUrl(),
    loadConnections(supabase, user.id),
    Promise.resolve(getBotToken()),
  ]);

  const results: {
    beatId: string;
    title: string;
    platform: string;
    ok: boolean;
    externalUrl?: string | null;
    error?: string;
  }[] = [];

  for (const beat of beats) {
    const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;

    const payload: PublishBeat = {
      id: beat.id,
      title: beat.title,
      artists: beat.type_beat_artists ?? [],
      bpm: beat.bpm,
      musicalKey: beat.key,
      tags: beat.tags ?? [],
      prices: (beat.prices ?? { mp3: null, bundle: null, exclusive: null }) as PublishBeat["prices"],
      currency: beat.currency ?? "RUB",
      username: owner?.username ?? "",
      mp3Url: beat.mp3_url,
      coverUrl: beat.cover_url,
    };

    for (const platform of platforms) {
      const connection = allConnections.find((item) => item.platform === platform);

      const result = beat.mp3_url
        ? await publishBeat({
            platform,
            beat: payload,
            connection,
            decrypt: decryptSecret,
            telegramToken,
            siteUrl,
          })
        : { ok: false, error: "У бита нет аудиофайла" };

      await recordPost({
        supabase,
        userId: user.id,
        beatId: beat.id,
        platform,
        connectionId: connection?.id ?? null,
        status: result.ok ? "published" : "failed",
        externalUrl: result.externalUrl ?? null,
        error: result.error ?? null,
      });

      results.push({
        beatId: beat.id,
        title: beat.title,
        platform,
        ok: result.ok,
        externalUrl: result.externalUrl ?? null,
        error: result.error,
      });
    }
  }

  const failed = results.filter((item) => !item.ok).length;

  return NextResponse.json({ results, done: results.length - failed, failed });
}
