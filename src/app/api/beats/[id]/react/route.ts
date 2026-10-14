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
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  /*
   * Бит берём из адреса, а не из тела: иначе адрес врёт, а проверяется
   * другое. Тело со старым клиентом ещё шлёт beatId — требуем совпадения.
   */
  const beatId = id;
  const kind = body?.kind === "save" ? "save" : body?.kind === "like" ? "like" : null;

  if (!/^[0-9a-f-]{36}$/i.test(beatId) || !kind) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (typeof body?.beatId === "string" && body.beatId !== beatId) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  /*
   * Реакция переключается одной вставкой, без «прочитал — потом записал».
   *
   * Прежде здесь сначала выбиралась строка, и если её не было — вставлялась
   * новая. Между этими двумя запросами реакцию мог поставить второй вызов
   * того же человека: двойной клик, два открытых таба, кнопка лайка под
   * пальцем на медленной сети. Оба увидели «реакции нет» и оба вставили,
   * а второй получил ошибку уникальности — и человек, который просто
   * поставил лайк, видел «не удалось поставить реакцию».
   *
   * Теперь порядок обратный: сначала вставка. Если строка уже есть —
   * значит, реакция на месте, и это не ошибка, а нужное состояние, поэтому
   * переключаем её снятием и отвечаем как снятую.
   */
  const { error: insertError } = await supabase
    .from("beat_reactions")
    .insert({ beat_id: beatId, user_id: user.id, kind });

  if (!insertError) return NextResponse.json({ active: true }, { status: 201 });

  if (insertError.code !== "23505") {
    // Свой бит: сообщение из триггера объясняет причину, гостю она не нужна.
    if (insertError.message.includes("Свой бит")) {
      return NextResponse.json({ error: "Свой бит реагировать нельзя" }, { status: 400 });
    }
    console.error("beat reaction failed", insertError.code);
    return NextResponse.json({ error: "Не удалось поставить реакцию" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("beat_reactions")
    .delete()
    .eq("beat_id", beatId)
    .eq("user_id", user.id)
    .eq("kind", kind);

  if (deleteError) {
    console.error("beat reaction delete failed", deleteError.code);
    return NextResponse.json({ error: "Не удалось убрать реакцию" }, { status: 400 });
  }

  return NextResponse.json({ active: false });
}