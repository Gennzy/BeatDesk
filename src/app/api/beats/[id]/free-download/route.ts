import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Бесплатное скачивание бита.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ОНО НЕ АНОНИМНО
 *
 * Скачивание бесплатное, но без входа его нет: иначе журнал, который должен
 * сказать «чей это треп на площадке», не знал бы, кто брал. Гость видит
 * предложение войти — и это не бюрократия, а условие работы защиты.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ЗАПИСЫВАЕТСЯ
 *
 * Отпечаток выдаваемого файла. Не мастера: слитый треп отличается от бита
 * (вокал, аранжировка), и сверять с ним мастер бессмысленно. Сверка идёт с тем,
 * что мы отдали конкретному человеку, — и вот тогда совпадение означает «этот
 * файл у него».
 *
 * Отпечаток считает браузер и присылает: сервер файл не расшифровывает.
 */

/** Сколько символов отпечатка принимаем: больше не бывает. */
const MAX_ENVELOPE = 4000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Войди, чтобы скачать бит бесплатно" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { envelope?: unknown } | null;

  const envelope = typeof body?.envelope === "string" ? body.envelope.slice(0, MAX_ENVELOPE) : "";

  const { data, error } = await supabase.rpc("record_beat_download", {
    p_beat_id: id,
    p_envelope: envelope,
  });

  if (error) {
    // Текст из базы отдаём как есть: он уже написан по-человечески
    // («Бит нельзя скачать бесплатно»), и оборачивать его значит терять смысл.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: beat } = await supabase
    .from("beats")
    .select("mp3_url, title")
    .eq("id", id)
    .maybeSingle();

  if (!beat?.mp3_url) {
    return NextResponse.json({ error: "У бита нет превью" }, { status: 404 });
  }

  return NextResponse.json({ id: data, url: beat.mp3_url, title: beat.title });
}
