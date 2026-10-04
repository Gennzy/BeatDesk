import { NextResponse } from "next/server";

import { validateBeat, type Prices } from "@/lib/beat-validation";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

type Body = {
  title?: unknown;
  type_beat_artists?: unknown;
  bpm?: unknown;
  key?: unknown;
  tags?: unknown;
  prices?: unknown;
  mp3_url?: unknown;
  cover_url?: unknown;
  files?: unknown;
  is_public?: unknown;
};

function text(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Создание бита идёт через сервер: браузер отвечает только за файлы,
 * а нормализацию и проверки делает сервер.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const limit = rateLimit(clientKey(request, `beat:${user.id}`), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много битов подряд" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const validated = validateBeat({
    title: body.title,
    typeBeatArtists: body.type_beat_artists,
    bpm: body.bpm,
    musicalKey: body.key,
    tags: body.tags,
    prices: body.prices,
  });

  if (!validated.ok) {
    return NextResponse.json({ error: validated.errors.join("; ") }, { status: 400 });
  }

  const mp3Url = text(body.mp3_url, 500);
  const coverUrl = text(body.cover_url, 500);

  if (!mp3Url) {
    return NextResponse.json({ error: "Нужен аудиофайл" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("beats")
    .insert({
      owner_id: user.id,
      title: validated.value.title,
      type_beat_artists: validated.value.type_beat_artists,
      bpm: validated.value.bpm,
      key: validated.value.key,
      tags: validated.value.tags,
      prices: validated.value.prices satisfies Prices,
      currency: validated.value.currency,
      mp3_url: mp3Url,
      cover_url: coverUrl,
      files: typeof body.files === "object" && body.files !== null ? body.files : {},
      is_public: Boolean(body.is_public),
    })
    .select("id, title")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}