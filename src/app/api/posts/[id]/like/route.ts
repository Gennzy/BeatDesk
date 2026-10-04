import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const RATE_PER_MINUTE = 60;

/** Лайк и снятие лайка. like_count пересчитывает триггер. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `like:${user.id}`), RATE_PER_MINUTE, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много лайков подряд" }, { status: 429 });
  }

  // Повторный лайк не должен падать и не должен слать второе уведомление:
  // на (post_id, user_id) стоит первичный ключ, а уникальный индекс
  // уведомлений делает вставку идемпотентной.
  const { error } = await supabase.from("post_likes").upsert(
    { post_id: id, user_id: user.id },
    { onConflict: "post_id,user_id", ignoreDuplicates: true },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, liked: true });
}

/** Убрать лайк: повторный DELETE тоже безопасен, уведомление при этом не шлётся. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, liked: false });
}
