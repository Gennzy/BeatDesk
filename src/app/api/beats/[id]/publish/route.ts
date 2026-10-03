import { NextResponse } from "next/server";

import { decryptSecret } from "@/lib/crypto";
import type { PublishBeat } from "@/lib/platforms/payload";
import { isPlatformId } from "@/lib/platforms/registry";
import { loadConnections, publishBeat, recordPost } from "@/lib/platforms/publish";
import { getBotToken } from "@/lib/platforms/telegram-client";
import { createClient } from "@/lib/supabase/server";

type Body = { platforms?: string[] };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as Body;

  const platforms = (body.platforms ?? []).filter((item): item is string => typeof item === "string");
  if (platforms.length === 0) {
    return NextResponse.json({ error: "Выбери площадку" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, type_beat_artists, bpm, key, tags, mp3_url, cover_url, prices, owner_id, profiles(username)")
    .eq("id", id)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });
  if (beat.owner_id !== user.id) return NextResponse.json({ error: "Это не твой бит" }, { status: 403 });

  const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;

  const distribution: PublishBeat = {
    id: beat.id,
    title: beat.title,
    artists: beat.type_beat_artists ?? [],
    bpm: beat.bpm,
    musicalKey: beat.key,
    tags: beat.tags ?? [],
    prices: (beat.prices ?? { mp3: null, bundle: null, exclusive: null }) as PublishBeat["prices"],
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

  return NextResponse.json({ results });
}
