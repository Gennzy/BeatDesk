import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { fetchPosts, POST_BODY_LIMIT, POSTS_PAGE_SIZE } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

/** Лента постов: «все» или «подписки». */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Лента закрыта: гостю показываем вход, а не пустоту.
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const raw = Number(params.get("offset") ?? 0);
  const offset = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const tab = params.get("tab") === "following" ? "following" : "all";

  const gate = rateLimit(clientKey(request, `posts-feed:${user.id}`), 120, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const posts = await fetchPosts(supabase, {
    viewerId: user.id,
    offset,
    limit: POSTS_PAGE_SIZE,
    followingOf: tab === "following" ? user.id : null,
  });

  return NextResponse.json({
    posts,
    nextOffset: posts.length === POSTS_PAGE_SIZE ? offset + POSTS_PAGE_SIZE : null,
  });
}

type Body = {
  body?: string;
  beatId?: string | null;
  parentId?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATE_POSTS_PER_HOUR = 10;
const RATE_REPLIES_PER_HOUR = 30;

/** Новый пост или ответ. Владение битом и публичность проверяет триггер в базе. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const body = String(payload.body ?? "").trim();
  const beatId = payload.beatId ? String(payload.beatId) : null;
  const parentId = payload.parentId ? String(payload.parentId) : null;

  if (body.length > POST_BODY_LIMIT) {
    return NextResponse.json({ error: `Не больше ${POST_BODY_LIMIT} символов` }, { status: 400 });
  }
  if (beatId && !UUID.test(beatId)) return NextResponse.json({ error: "Бит не найден" }, { status: 400 });
  if (parentId && !UUID.test(parentId)) return NextResponse.json({ error: "Пост не найден" }, { status: 400 });

  if (!body && !beatId) {
    return NextResponse.json({ error: "Напиши что-нибудь или приложи бит" }, { status: 400 });
  }

  const perHour = parentId ? RATE_REPLIES_PER_HOUR : RATE_POSTS_PER_HOUR;
  const gate = rateLimit(clientKey(request, `post:${user.id}`), perHour, 3_600_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: parentId ? "Слишком много ответов подряд, попробуй позже" : "Слишком много постов подряд, попробуй позже" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, body, beat_id: beatId, parent_id: parentId })
    .select("id, created_at")
    .single();

  if (error) {
    // Триггер отвечает за владение битом и публичность: его сообщение
    // и есть ответ пользователю, второй раз проверять здесь незачем.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id, parentId, createdAt: data.created_at }, { status: 201 });
}