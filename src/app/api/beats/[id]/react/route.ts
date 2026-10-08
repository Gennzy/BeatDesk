import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Лайк и сохранение бита.
 *
 * Один маршрут на оба действия: различаются только видом, и разносить их
 * по двум файлам незачем. Повторное нажатие снимает реакцию — как в обычной
 * кнопке «нравится», а не как в форме, где второй клик создал бы вторую
 * строку.
 *
 * Счётчик пересчитывает триггер в базе: забытый пересчёт скора оставил бы
 * бит в ленте на старой позиции, и это выглядело бы как «работает через раз».
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `beat-react:${user.id}`), 120, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много нажатий, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { beatId?: unknown; kind?: unknown } | null;

  const beatId = typeof body?.beatId === "string" ? body.beatId : "";
  const kind = body?.kind === "save" ? "save" : body?.kind === "like" ? "like" : null;

  if (!/^[0-9a-f-]{36}$/i.test(beatId) || !kind) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  // Свой бит реагировать нельзя: проверку делает триггер, чтобы правило не
  // разъехалось между клиентом и базой.
  const { data: existing } = await supabase
    .from("beat_reactions")
    .select("beat_id")
    .eq("beat_id", beatId)
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("beat_reactions")
      .delete()
      .eq("beat_id", beatId)
      .eq("user_id", user.id)
      .eq("kind", kind);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ active: false });
  }

  const { error } = await supabase.from("beat_reactions").insert({ beat_id: beatId, user_id: user.id, kind });

  if (error) {
    // Свой бит: сообщение из триггера объясняет причину, гостю она не нужна.
    if (error.message.includes("Свой бит")) {
      return NextResponse.json({ error: "Свой бит реагировать нельзя" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ active: true }, { status: 201 });
}