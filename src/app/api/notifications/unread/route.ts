import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Данные для шапки: счётчик непрочитанных и сами последние записи.
 *
 * Раньше отдавался только счётчик, из-за чего новое уведомление было видно
 * лишь цифрой у колокольчика. Теперь хватает одного запроса и на счётчик,
 * и на всплывашку.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ unread: 0, items: [] });

  const gate = rateLimit(clientKey(request, `notifications-unread:${user.id}`), 60, 60_000);
  if (!gate.ok) return NextResponse.json({ unread: 0, items: [] });

  const { data, count, error } = await supabase
    .from("notifications")
    .select("id, kind, created_at, actor_id, beats(title)")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) return NextResponse.json({ unread: count ?? 0, items: [] });

  const rows = (data ?? []) as {
    id: string;
    kind: string;
    created_at: string;
    actor_id: string | null;
    beats: { title: string } | { title: string }[] | null;
  }[];

  const actors = rows.filter((row) => row.actor_id).map((row) => row.actor_id);
  const { data: actorRows } = actors.length
    ? await supabase.from("profiles").select("id, username, avatar_url").in("id", actors)
    : { data: [] };

  const actorsById = new Map(
    ((actorRows ?? []) as { id: string; username: string; avatar_url: string | null }[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  // Свой ник нужен для ссылки на профиль в уведомлении о достижении:
  // маршрута /beatmakers/me не существует, а без ника ссылка была бы битой.
  const { data: viewer } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    unread: count ?? 0,
    username: viewer?.username ?? null,
    items: rows.map((row) => {
      const beat = Array.isArray(row.beats) ? row.beats[0] : row.beats;
      const actor = row.actor_id ? actorsById.get(row.actor_id) : undefined;

      return {
        id: row.id,
        kind: row.kind,
        actorUsername: actor?.username ?? null,
        actorAvatar: actor?.avatar_url ?? null,
        beatTitle: beat?.title ?? null,
        createdAt: row.created_at,
      };
    }),
  });
}
