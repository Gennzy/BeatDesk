import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Запуск сканирования.
 *
 * Сканирование создаётся здесь, а проверяет звук браузер: сервер аудио не
 * расшифровывает. Поэтому отчёт собирается в два захода — сначала кандидаты,
 * потом результаты.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { beatId?: unknown; envelope?: unknown } | null;

  const beatId = typeof body?.beatId === "string" ? body.beatId : "";
  const envelope = typeof body?.envelope === "string" ? body.envelope : "";

  if (!beatId || !envelope) {
    return NextResponse.json({ error: "Нужны бит и отпечаток" }, { status: 400 });
  }

  const { data: beat } = await supabase
    .from("beats")
    .select("id, title, type_beat_artists, owner_id")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Это не твой бит" }, { status: 403 });
  }

  /*
   * Отпечаток мастера кладётся в реестр защиты.
   *
   * Он нужен потом, когда битмейкер принесёт найденный слитый треп: без
   * эталонного отпечатка нечем отличить наш бит от чужого при разборе.
   */
  const { error: protectionError } = await supabase.from("beat_protections").upsert(
    {
      beat_id: beatId,
      owner_id: user.id,
      envelope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "beat_id" },
  );

  if (protectionError) {
    return NextResponse.json({ error: "Не удалось зарегистрировать бит" }, { status: 500 });
  }

  const { data: scan, error } = await supabase
    .from("protection_scans")
    .insert({ beat_id: beatId, owner_id: user.id, status: "running" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Не удалось начать сканирование" }, { status: 500 });
  }

  return NextResponse.json({ id: scan.id }, { status: 201 });
}
