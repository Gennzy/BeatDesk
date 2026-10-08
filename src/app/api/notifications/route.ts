import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

/**
 * Виды уведомлений. Список закрыт миграцией 0028 проверкой на таблице:
 * новый вид обязан появиться и там, иначе вставка упадёт в базе.
 */
export type NotificationKind =
  | "reply"
  | "like"
  | "follow"
  | "sale"
  | "achievement"
  | "beat_uploaded"
  | "beat_failed"
  | "beat_published"
  | "review"
  | "order_ready";

export type Notification = {
  id: string;
  kind: NotificationKind;
  actorUsername: string;
  actorAvatar: string | null;
  postId: string | null;
  postExcerpt: string | null;
  /** Бит в уведомлении о продаже: без него непонятно, что именно купили. */
  beatId: string | null;
  beatTitle: string | null;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Уведомления видит только их владелец: политика на чтение в базе. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ notifications: [], unread: 0 });

  const limit = rateLimit(clientKey(request, `notifications:${user.id}`), 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  const raw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  const offset = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, post_id, beat_id, order_id, read_at, created_at, posts(body, parent_id), beats(title), profiles!notifications_actor_id_fkey(username, avatar_url)")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as {
    id: string;
    kind: NotificationKind;
    post_id: string | null;
    beat_id: string | null;
    order_id: string | null;
    read_at: string | null;
    created_at: string;
    posts: { body: string; parent_id: string | null } | { body: string; parent_id: string | null }[] | null;
    beats: { title: string } | { title: string }[] | null;
    profiles: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[] | null;
  }[];

  const notifications: Notification[] = rows.map((row) => {
    const actor = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    const beat = Array.isArray(row.beats) ? row.beats[0] : row.beats;

    return {
      id: row.id,
      kind: row.kind,
      actorUsername: actor?.username ?? "",
      actorAvatar: actor?.avatar_url ?? null,
      postId: row.post_id,
      postExcerpt: post?.body ? post.body.slice(0, 120) : null,
      beatId: row.beat_id,
      beatTitle: beat?.title ?? null,
      orderId: row.order_id,
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  });

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    notifications,
    unread: count ?? 0,
    nextOffset: notifications.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
  });
}

/** Отметить прочитанными. Пустое тело означает «всё прочитано». */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string").slice(0, 200) : [];

  const query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id);

  const { error } = ids.length > 0 ? await query.in("id", ids).is("read_at", null) : await query.is("read_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
