import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const RATE_PER_HOUR = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Подписаться на битмейкера. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { followingId?: string };
  const followingId = String(body.followingId ?? "");

  if (!UUID.test(followingId)) return NextResponse.json({ error: "Профиль не найден" }, { status: 400 });
  if (followingId === user.id) return NextResponse.json({ error: "Нельзя подписаться на себя" }, { status: 400 });

  const gate = rateLimit(clientKey(request, `follow:${user.id}`), RATE_PER_HOUR, 3_600_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много подписок подряд" }, { status: 429 });
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", followingId).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const { error } = await supabase.from("follows").upsert(
    { follower_id: user.id, following_id: followingId },
    { onConflict: "follower_id,following_id", ignoreDuplicates: true },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, following: true });
}

/** Отписаться. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { followingId?: string };
  const followingId = String(body.followingId ?? "");

  if (!UUID.test(followingId)) return NextResponse.json({ error: "Профиль не найден" }, { status: 400 });

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", followingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, following: false });
}
