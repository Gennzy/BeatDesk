import { NextResponse, type NextRequest } from "next/server";

import { MASTERS_BUCKET } from "@/lib/beats";
import { parseMidi } from "@/lib/pulse/midi";
import { createClient } from "@/lib/supabase/server";

/**
 * Ноты мелодии бита.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ РАЗБИРАЕТ СЕРВЕР, А НЕ БРАУЗЕР
 *
 * MIDI лежит в приватном баке мастеров: подписать ссылку может только
 * владелец бита, и в браузере такой ссылки нет. Значит файл забирает сервер,
 * разбирает и отдаёт уже готовые ноты.
 *
 * Разбор всё равно чистый и без базы: в src/lib/pulse/midi.ts он покрыт
 * тестами на настоящих байтах формата.
 *
 * ---------------------------------------------------------------------------
 * КТО МОЖЕТ ЗАБРАТЬ
 *
 * Только владелец бита. Мелодия — его материал, и раздавать её всем подряд
 * нельзя: это тот же файл, что лежит в мастерах.
 *
 * Ноты в ролике показываются, а сам файл отдаётся покупателю отдельно и по
 * правилам выдачи покупок — как мастер.
 */

const SIGN_TTL_SECONDS = 300;

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const beatId = request.nextUrl.searchParams.get("beatId") ?? "";

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });

  const { data: beat } = await supabase
    .from("beats")
    .select("owner_id, files")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Это не твой бит" }, { status: 403 });
  }

  const midi = (beat.files as { midi?: { path?: string; parts?: { path?: string }[] } } | null)?.midi;

  if (!midi) {
    // Нет мелодии — это не ошибка, а обычное состояние бита.
    return NextResponse.json({ notes: [], bpm: null }, { status: 200 });
  }

  const paths = [
    ...(midi.path ? [midi.path] : []),
    ...((midi.parts ?? []).map((part) => part.path).filter((path): path is string => Boolean(path))),
  ];

  if (paths.length === 0) {
    return NextResponse.json({ error: "Файл мелодии лежит в старом хранилище" }, { status: 404 });
  }

  const bytes: number[] = [];

  for (const path of paths) {
    const { data, error } = await supabase.storage.from(MASTERS_BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Файл мелодии недоступен" }, { status: 502 });
    }

    const response = await fetch(data.signedUrl);

    if (!response.ok) {
      return NextResponse.json({ error: "Файл мелодии не прочитан" }, { status: 502 });
    }

    const chunk = new Uint8Array(await response.arrayBuffer());

    for (const byte of chunk) bytes.push(byte);
  }

  try {
    const midi2 = parseMidi(new Uint8Array(bytes));

    return NextResponse.json({
      notes: midi2.notes,
      bpm: midi2.bpm,
      duration: midi2.duration,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Мелодия не читается" },
      { status: 400 },
    );
  }
}
