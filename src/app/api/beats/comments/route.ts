import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Комментарий под битом.
 *
 * Ответ на ответ отправляется тем же маршрутом с parent_id: отдельные
 * маршруты разошлись бы проверками, а различие только в одном поле.
 *
 * Проверки «тот же бит», «не глубже одного уровня» и «автор» живут в базе.
 * Здесь только вход, частота и длина текста.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `beat-comment:${user.id}`), 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много комментариев, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    parentId?: unknown;
    body?: unknown;
  } | null;

  const beatId = typeof body?.beatId === "string" ? body.beatId : "";
  const parentId = typeof body?.parentId === "string" ? body.parentId : null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!/^[0-9a-f-]{36}$/i.test(beatId)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (text.length === 0) {
    return NextResponse.json({ error: "Пустой комментарий" }, { status: 400 });
  }

  if (text.length > 1000) {
    return NextResponse.json({ error: "Слишком длинный комментарий" }, { status: 400 });
  }

  const { error } = await supabase.from("beat_comments").insert({
    beat_id: beatId,
    author_id: user.id,
    parent_id: parentId,
    body: text,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ты уже ответил на этот комментарий" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "created" }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  // Удалять может только автор: политика RLS проверяет это сама, и чужая
  // строка вернёт пустой результат, а не ошибку.
  const { error } = await supabase.from("beat_comments").delete().eq("id", id).eq("author_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ status: "deleted" });
}