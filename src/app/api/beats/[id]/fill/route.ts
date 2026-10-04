import { NextResponse } from "next/server";

import {
  fileNames,
  hashtagList,
  keyShort,
  priceLine,
  translit,
  typeBeatLine,
  type DistributionBeat,
} from "@/lib/distribution";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getSupabase } from "@/lib/supabase/user";

export const revalidate = 60;

/**
 * Готовые данные бита для формы маркетплейса. Открытый, но только для публичных битов:
 * расширение подставляет их в форму BeatStars или BeatChain и не нажимает «Опубликовать».
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Открытый маршрут: ограничиваем, чтобы его не перебирали в цикле.
  const gate = rateLimit(clientKey(request, "fill"), 60, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  const { id } = await params;
  const supabase = await getSupabase();

  if (!supabase) return NextResponse.json({ error: "Сервер не настроен" }, { status: 503 });

  const { data: beat, error } = await supabase
    .from("beats")
    // wav_url/zip_url/rar_url миграция 0005 удалила: файлы лежат в jsonb
    // files. Ошибка запроса здесь раньше маскировалась под «бит не найден».
    .select("id, title, type_beat_artists, bpm, key, tags, prices, currency, is_public, mp3_url, files, profiles(username)")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (beat === null) return NextResponse.json({ error: "Бит не найден или не публичный" }, { status: 404 });

  if (!beat) {
    console.error("fill query failed", error);
    return NextResponse.json({ error: "Не удалось получить данные бита" }, { status: 500 });
  }

  const owner = Array.isArray(beat.profiles) ? beat.profiles[0] : beat.profiles;

  const distributionBeat: DistributionBeat = {
    id: beat.id,
    title: beat.title,
    artists: beat.type_beat_artists ?? [],
    bpm: beat.bpm,
    musicalKey: beat.key,
    tags: beat.tags ?? [],
    prices: (beat.prices ?? { mp3: null, bundle: null, exclusive: null }) as DistributionBeat["prices"],
    currency: beat.currency ?? "RUB",
    audioUrl: null,
    ownerUsername: owner?.username ?? "",
  };

  const stored = (beat.files ?? {}) as Record<string, unknown>;
  const files = fileNames(distributionBeat, {
    wav: Boolean(stored.wav),
    zip: Boolean(stored.zip),
    rar: Boolean(stored.rar),
  });

  const description = [
    `${typeBeatLine(distributionBeat)} · ${beat.bpm} BPM · ${beat.key}`,
    priceLine(distributionBeat) ? `Продажа: ${priceLine(distributionBeat)}` : null,
    beat.tags.length > 0 ? hashtagList(distributionBeat) : null,
    `BeatDesk: /${owner?.username ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  return NextResponse.json({
    id: beat.id,
    title: beat.title,
    owner: owner?.username ?? "",
    artists: beat.type_beat_artists ?? [],
    bpm: beat.bpm,
    key: beat.key,
    keyShort: keyShort(beat.key),
    type: typeBeatLine(distributionBeat),
    tags: beat.tags ?? [],
    hashtags: hashtagList(distributionBeat),
    prices: beat.prices ?? { mp3: null, bundle: null, exclusive: null },
    currency: beat.currency ?? "RUB",
    priceLine: priceLine(distributionBeat),
    description,
    fileBase: translit(beat.title),
    files: files.map((file) => ({ label: file.label, name: file.name })),
  });
}
