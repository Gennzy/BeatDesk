import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { FeedBeat } from "@/lib/feed";

export const POSTS_PAGE_SIZE = 10;
export const REPLIES_PAGE_SIZE = 30;
export const POST_BODY_LIMIT = 500;

/** Сколько уровней вложенности рисуем. Дальше — свёрнутым списком. */
export const THREAD_RENDER_DEPTH = 3;

export type PostAuthor = {
  username: string;
  avatarUrl: string | null;
};

export type PostBeat = {
  id: string;
  title: string;
  bpm: number;
  musicalKey: string;
  tags: string[];
  coverUrl: string | null;
  mp3Url: string | null;
  prices: { mp3: number | null; bundle: number | null; exclusive: number | null };
};

/** Пост в ленте и в ветке. Ответы отличаются только наличием parentId. */
export type Post = {
  id: string;
  authorId: string;
  parentId: string | null;
  body: string;
  beat: PostBeat | null;
  author: PostAuthor;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  createdAt: string;
};

// Профиль приходится указывать явно: у posts на profiles две связи —
// напрямую через author_id и многие-ко-многим через post_likes.
// Без подсказки PostgREST отвечает PGRST201 и возвращает пустую выборку.
const POST_COLUMNS = `
  id, author_id, parent_id, body, like_count, reply_count, created_at,
  beats(id, title, bpm, key, tags, cover_url, mp3_url, prices),
  profiles!posts_author_id_fkey(username, avatar_url)
`;

type PostRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  like_count: number | null;
  reply_count: number | null;
  created_at: string;
  beats: PostRowBeat | PostRowBeat[] | null;
  profiles: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[] | null;
};

type PostRowBeat = {
  id: string;
  title: string;
  bpm: number;
  key: string;
  tags: string[] | null;
  cover_url: string | null;
  mp3_url: string | null;
  prices: PostBeat["prices"] | null;
};

/** Supabase отдаёт вложенные связи объектом или массивом — нормализуем в один раз. */
function one<T>(value: T | T[] | null): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toBeat(value: PostRowBeat | PostRowBeat[] | null): PostBeat | null {
  const beat = one(value);
  if (!beat) return null;

  return {
    id: beat.id,
    title: beat.title,
    bpm: beat.bpm,
    musicalKey: beat.key,
    tags: beat.tags ?? [],
    coverUrl: beat.cover_url,
    mp3Url: beat.mp3_url,
    prices: beat.prices ?? { mp3: null, bundle: null, exclusive: null },
  };
}

function toPost(row: PostRow, liked: Set<string>): Post {
  const author = one(row.profiles);

  return {
    id: row.id,
    authorId: row.author_id,
    parentId: row.parent_id,
    body: row.body,
    beat: toBeat(row.beats),
    author: { username: author?.username ?? "", avatarUrl: author?.avatar_url ?? null },
    likeCount: row.like_count ?? 0,
    replyCount: row.reply_count ?? 0,
    likedByMe: liked.has(row.id),
    createdAt: row.created_at,
  };
}

/** Какие из постов текущий пользователь уже лайкнул — одним запросом на страницу. */
async function likedIds(supabase: SupabaseServerClient, viewerId: string | null, postIds: string[]): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();

  const { data } = await supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds);

  return new Set((data ?? []).map((row) => row.post_id as string));
}

/**
 * Лента постов. Корень ветки стоит по времени последнего ответа, иначе
 * активная ветка уезжает вниз вслед за свежим ответом в глубоком ответе.
 * Внутри корня показываем только сам корень — ответы живут на странице ветки.
 */
export async function fetchPosts(
  supabase: SupabaseServerClient,
  options: { viewerId: string | null; offset?: number; limit?: number; followingOf?: string | null },
): Promise<Post[]> {
  const limit = options.limit ?? POSTS_PAGE_SIZE;
  const offset = options.offset ?? 0;

  let query = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .is("parent_id", null)
    .order("last_reply_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.followingOf) {
    const { data: followed } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", options.followingOf);

    const ids = Array.from(new Set([...(followed ?? []).map((row) => row.following_id as string), options.followingOf]));
    if (ids.length === 0) return [];
    query = query.in("author_id", ids);
  }

  const { data, error } = await query;

  if (error) {
    // Молчаливый пустой массив выглядел бы как «постов нет» и прятал бы
    // поломку запроса. Пусть причина будет видна в логах сервера.
    console.error("posts feed query failed", error);
    return [];
  }

  if (!data) return [];

  const rows = data as PostRow[];
  const liked = await likedIds(supabase, options.viewerId, rows.map((row) => row.id));

  return rows.map((row) => toPost(row, liked));
}

/** Корень ветки со всеми потомками до maxDepth уровней. */
export async function fetchThread(
  supabase: SupabaseServerClient,
  rootId: string,
  viewerId: string | null,
  maxDepth = THREAD_RENDER_DEPTH,
): Promise<{ root: Post | null; replies: Post[]; totalReplies: number }> {
  const { data, error } = await supabase.from("posts").select(POST_COLUMNS).eq("id", rootId).maybeSingle();

  if (error) {
    console.error("thread query failed", error);
    return { root: null, replies: [], totalReplies: 0 };
  }

  if (!data) return { root: null, replies: [], totalReplies: 0 };

  const rootRow = data as PostRow;

  // Собираем потомков по уровням: один запрос на глубину вместо рекурсии в SQL
  const replyRows: PostRow[] = [];
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  let total = 0;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const { data: level } = await supabase
      .from("posts")
      .select(POST_COLUMNS)
      .in("parent_id", frontier)
      .order("created_at", { ascending: true });

    const rows = ((level ?? []) as PostRow[]).filter((row) => !seen.has(row.id));
    if (rows.length === 0) break;

    for (const row of rows) seen.add(row.id);
    replyRows.push(...rows);
    total += rows.length;
    frontier = rows.map((row) => row.id);
  }

  const liked = await likedIds(supabase, viewerId, [rootRow.id, ...replyRows.map((row) => row.id)]);

  return {
    root: toPost(rootRow, liked),
    replies: replyRows.map((row) => toPost(row, liked)),
    totalReplies: rootRow.reply_count ?? total,
  };
}

/** Ответы к посту пачками — для кнопки «показать ещё». */
export async function fetchReplies(
  supabase: SupabaseServerClient,
  parentId: string,
  viewerId: string | null,
  offset: number,
  limit: number,
): Promise<Post[]> {
  const { data } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  const rows = (data ?? []) as PostRow[];
  const liked = await likedIds(supabase, viewerId, rows.map((row) => row.id));

  return rows.map((row) => toPost(row, liked));
}

/** Кто подписан на кого — нужно для кнопки и для отсечения своих подписок. */
export async function loadFollowState(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  profileId: string,
): Promise<{ isFollowing: boolean; followerCount: number; followingCount: number }> {
  const { count: followerCount } = await supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", profileId);

  const { count: followingCount } = await supabase
    .from("follows")
    .select("following_id", { count: "exact", head: true })
    .eq("follower_id", profileId);

  let isFollowing = false;
  if (viewerId && viewerId !== profileId) {
    const { data } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", viewerId)
      .eq("following_id", profileId)
      .maybeSingle();
    isFollowing = Boolean(data);
  }

  return { isFollowing, followerCount: followerCount ?? 0, followingCount: followingCount ?? 0 };
}

/** Только id постов, на которые этот пользователь уже лайкнул. */
export async function loadLikedPostIds(supabase: SupabaseServerClient, viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const { data } = await supabase.from("post_likes").select("post_id").eq("user_id", viewerId);
  return new Set((data ?? []).map((row) => row.post_id as string));
}

/**
 * Посты профиля для страницы битмейкера. Ответы пропускаем: профиль
 * показывает верхнеуровневые посты, ветка живёт на своей странице.
 */
export async function fetchProfilePosts(
  supabase: SupabaseServerClient,
  profileId: string,
  isOwner: boolean,
  limit = 10,
): Promise<Post[]> {
  const { data } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("author_id", profileId)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as PostRow[];
  // Лайки автора на своих постах гостя не показываем: их всё равно не увидеть
  // в интерфейсе без подписки, а лишний запрос на каждый пост дорог.
  const liked = isOwner ? await likedIds(supabase, profileId, rows.map((row) => row.id)) : new Set<string>();

  return rows.map((row) => toPost(row, liked));
}

/** Кусок FeedBeat для карточки бита внутри поста. */
export function beatToFeedCard(beat: PostBeat, author: PostAuthor): FeedBeat {
  return {
    id: beat.id,
    title: beat.title,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    tags: beat.tags,
    coverUrl: beat.coverUrl,
    mp3Url: beat.mp3Url,
    prices: beat.prices,
    username: author.username,
    avatarUrl: author.avatarUrl,
    isPublic: true,
    plays: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
  };
}