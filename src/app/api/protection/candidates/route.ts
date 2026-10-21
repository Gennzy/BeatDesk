import { NextResponse, type NextRequest } from "next/server";

import { findCandidates } from "@/lib/protection/search-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Кандидаты для сканирования.
 *
 * Сервер ходит на площадки своими ключами и отдаёт браузеру список кандидатов.
 * Браузер только качает превью и считает отпечатки — звук площадок он не
 * расшифровывает, да и незачем.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { beatId?: unknown; title?: unknown; artists?: unknown; producer?: unknown }
    | null;

  const beatId = typeof body?.beatId === "string" ? body.beatId : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!beatId || !title) {
    return NextResponse.json({ error: "Нужны бит и его название" }, { status: 400 });
  }

  const artists = Array.isArray(body?.artists)
    ? body.artists.filter((item): item is string => typeof item === "string")
    : [];

  const producer = typeof body?.producer === "string" ? body.producer : undefined;

  try {
    const { candidates, failed } = await findCandidates({ title, artists, producer });

    return NextResponse.json({ candidates, failed });
  } catch {
    return NextResponse.json({ error: "Площадки не ответили" }, { status: 502 });
  }
}
