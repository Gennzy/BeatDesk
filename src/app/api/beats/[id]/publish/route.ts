import { NextResponse, type NextRequest } from "next/server";

import { decryptSecret } from "@/lib/crypto";
import { normalizePrices } from "@/lib/prices";
import type { PublishBeat } from "@/lib/platforms/payload";
import { isPlatformId } from "@/lib/platforms/registry";
import { notifySelf } from "@/lib/notifications/self";
import { loadConnections, publishBeat, recordPost } from "@/lib/platforms/publish";
import { getBotToken } from "@/lib/platforms/telegram-client";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

type Body = { platforms?: string[] };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  /*
   * Лимит стоит до разбора тела и до похода в базу: каждый вызов этой
   * маршрутизации ходит в Telegram или в другой внешний канал от имени
   * битмейкера, и квоту площадки расходует впустую. Простое «нажать ещё
   * раз» не должно превращаться в серию постов у людей в ленте.
   */
  const gate = rateLimit(clientKey(request, `beat-publish:${id}`), 10, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много публикаций, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;

  const platforms = (body?.platforms ?? []).filter((item): item is string => typeof item === "string");
  if (platforms.length === 0) {
    return NextResponse.json({ error: "Выбери канал" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, type_beat_artists, bpm, key, tags, genre, mp3_url, cover_url, prices, currency, owner_id, profiles!beats_owner_id_fkey(username)")
    .eq("id", id)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });
  if (beat.owner_id !== user.id) return NextResponse.json({ error: "Чужой бит" }, { status: 403 });

  const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;
  const siteUrl = await getSiteUrl();

  const distribution: PublishBeat = {
    id: beat.id,
    title: beat.title,
    artists: beat.type_beat_artists ?? [],
    bpm: beat.bpm,
    musicalKey: beat.key,
    // Жанр уезжает в пост: по нему фильтруют в канале, и без него тёмный бит
    // выглядит в ленте так же, как попсовый.
    genre: beat.genre,
    tags: beat.tags ?? [],
    /*
     * Цены нормализуются, а не кастуются.
     *
     * В базе уровень WAV лежит под ключом `bundle` — так он назывался
     * раньше, и переименование сломало бы старые записи. Дальше по коду
     * читается уже `wav`, и каст без нормализации приводил к тому, что
     * уровень MP3+WAV просто исчезал из поста: цена в базе есть, а в
     * сообщении её нет, и никто не может понять почему.
     */
    prices: normalizePrices(beat.prices),
    currency: beat.currency ?? "RUB",
    username: owner?.username ?? "",
    mp3Url: beat.mp3_url,
    coverUrl: beat.cover_url,
  };

  const connections = await loadConnections(supabase, user.id);
  const telegramToken = getBotToken();

  const results = [];

  for (const platform of platforms) {
    if (!isPlatformId(platform)) continue;

    const connection = connections.find((item) => item.platform === platform);

    const result = await publishBeat({
      platform,
      beat: distribution,
      connection,
      decrypt: decryptSecret,
      telegramToken,
      siteUrl,
    });

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

    results.push({ platform, ...result });
  }

  /*
   * Публикация на витрину — событие площадки, а не внешнего канала: о нём
   * полезно знать и тогда, когда внешние площадки отказали. Отдельным
   * уведомлением, а не в общем списке результатов, потому что человек
   * вернулся с вкладки и хочет понять, появился ли бит в ленте.
   *
   * Уведомление шлём только при успехе. Раньше оно уходило всегда, и в том
   * числе когда все каналы отказали: человек возвращался с вкладки, видел
   * «бит опубликован» и искал его в ленте, которой он туда не попал.
   */
  const published = results.some((item) => "ok" in item && item.ok);

  if (published) {
    await notifySelf(user.id, "beat_published", beat.id);
  }

  return NextResponse.json({ results, published });
}
