import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Закрепление бита на витрине профиля.
 *
 * Один бит на продавца, всегда сверху. Смысл не в украшении, а в том,
 * чтобы витрина не переставлялась сама: бит, залитый в четверг, в пятницу
 * уезжал вниз по дате, и продавцу приходилось заливать его заново.
 *
 * Закрепить можно только свой бит, и проверка тут не одна. Сервер сверяет
 * владельца перед записью — иначе чужим битом можно было бы подменить
 * свой. Триггер в базе проверяет то же самое вторым слоем: колонка это
 * просто uuid, и серверный код не является границей доверия.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { beatId?: unknown } | null;
  const beatId = typeof body?.beatId === "string" ? body.beatId : null;

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });

  const { data: beat } = await supabase.from("beats").select("id, owner_id, sale_state").eq("id", beatId).maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (beat.owner_id !== user.id) {
    // Ровно то, что человек и пытается сделать, но молча уводить его в
    // «ошибку» незачем: чужой бит нельзя поставить наверх своего профиля.
    return NextResponse.json({ error: "Закрепить можно только свой бит" }, { status: 403 });
  }

  /*
   * Черновик закрепить можно, а вот выложенный бит без превью — нельзя:
   * он стоял бы наверху витрины покупателя и вёл в пустоту. Само закрепление
   * не проверяем на это — закреплённый бит может быть снят с продажи уже
   * после, и профиль обязан это пережить.
   */
  const { error } = await supabase.from("profiles").update({ pinned_beat_id: beatId }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ pinnedBeatId: beatId });
}

/** Снять закрепление: витрина возвращается к порядку по свежести. */
export async function DELETE() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { error } = await supabase.from("profiles").update({ pinned_beat_id: null }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ pinnedBeatId: null });
}