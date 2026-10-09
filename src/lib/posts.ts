import type { SaleState } from "@/lib/sales/state";
import { normalizePrices } from "@/lib/prices";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { FeedBeat } from "@/lib/feed";
import type { Prices } from "@/lib/prices";

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
  /** Чей это бит: в посте показывается так же, как в ленте. */
  typeBeatArtists: string[];
  saleState: SaleState;
  coverUrl: string | null;
  mp3Url: string | null;
  plays: number;
  score: number;
  sellerLevel: number;
  discountPercent: number;
  pricesBefore: Prices | null;
  likes: number;
  saves: number;
  prices: Prices;
  currency: string;
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
  beats!posts_beat_id_fkey(id, title, bpm, key, tags, type_beat_artists, cover_url, mp3_url, plays, score, discount_percent, prices_before, prices, currency, is_public, sale_state, beat_reactions(kind, user_id)),
  profiles!posts_author_id_fkey(username, avatar_url, level)
`;

/*
 * Набор колонок без полей из миграции 0029.
 *
 * score и level появляются вместе с миграцией, а PostgREST отвечает ошибкой на
 * любую несуществующую колонку — и запрос падал целиком. Лента битов давно
 * умеет откатываться на старый набор колонок, постам такой откатки не было:
 * вкладка «посты» просто оставалась пустой.
 */
/**
 * Пока не применена миграция 0035, в битах нет колонок скидки. Скидка живёт
 * внутри вложенной выборки бита, и её отсутствие убивало бы весь запрос
 * вместе с лентой постов — поэтому она убирается из набора, а не из кода.
 */
const POST_COLUMNS_PRE_DISCOUNT = POST_COLUMNS.replace(
  "discount_percent, prices_before, ",
  "",
);

const POST_COLUMNS_LEGACY = `
  id, author_id, parent_id, body, like_count, reply_count, created_at,
  beats(id, title, bpm, key, tags, type_beat_artists, cover_url, mp3_url, plays, prices, currency, is_public, sale_state),
  profiles!posts_author_id_fkey(username, avatar_url)
`;

/** Минимум формы ошибки PostgREST: в логе нужен код и текст, не вся структура. */
type PostgrestErrorLike = { message: string; code?: string; details?: string | null };

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
  type_beat_artists: string[] | null;
  sale_state?: SaleState | null;
  cover_url: string | null;
  mp3_url: string | null;
  plays: number | null;
  score?: number | null;
  discount_percent?: number | null;
  prices_before?: Record<string, number | null> | null;
  beat_reactions?: { kind: string; user_id: string }[] | null;
  prices: PostBeat["prices"] | null;
  currency: string | null;
  is_public: boolean | null;
};

/** Supabase отдаёт вложенные связи объектом или массивом — нормализуем в один раз. */
function one<T>(value: T | T[] | null): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toBeat(value: PostRowBeat | PostRowBeat[] | null): PostBeat | null {
  const beat = one(value);
  if (!beat) return null;

  // Триггер проверяет публичность бита только при вставке поста. Если позже
  // сделать бит приватным, встроенный объект всё равно придёт из базы —
  // и пост продолжит показывать название, BPM и обложку скрытого бита.
  if (beat.is_public === false) return null;

  return {
    id: beat.id,
    title: beat.title,
    bpm: beat.bpm,
    musicalKey: beat.key,
    tags: beat.tags ?? [],
    typeBeatArtists: beat.type_beat_artists ?? [],
    saleState: (beat.sale_state ?? "draft") as SaleState,
    coverUrl: beat.cover_url,
    mp3Url: beat.mp3_url,
    plays: beat.plays ?? 0,
    score: beat.score ?? 0,
    sellerLevel: 1,
    discountPercent: beat.discount_percent ?? 0,
    pricesBefore: beat.prices_before ? normalizePrices(beat.prices_before) : null,
    likes: (beat.beat_reactions ?? []).filter((r) => r.kind === "like").length,
    saves: (beat.beat_reactions ?? []).filter((r) => r.kind === "save").length,
    prices: normalizePrices(beat.prices),
    currency: beat.currency ?? "RUB",
  };
}

function toPost(row: PostRow, liked: Set<string>, branchTotal?: number): Post {
  const author = one(row.profiles);

  return {
    id: row.id,
    authorId: row.author_id,
    parentId: row.parent_id,
    body: row.body,
    beat: toBeat(row.beats),
    author: { username: author?.username ?? "", avatarUrl: author?.avatar_url ?? null },
    likeCount: row.like_count ?? 0,
    // Колонка reply_count в базе растёт только у непосредственного родителя,
    // поэтому для корня ветки она не равна числу ответов, которые видит
    // читатель. Сверху приходит итог по всей ветке.
    replyCount: branchTotal ?? row.reply_count ?? 0,
    likedByMe: liked.has(row.id),
    createdAt: row.created_at,
  };
}

/**
 * Сколько ответов в ветке целиком, а не только прямых.
 *
 * Триггер в базе увеличивает счётчик у непосредственного родителя, поэтому
 * на глубоком ответе он показывал «0», хотя под ним была целая переписка.
 * Считаем здесь по карте (id → parent_id): запрос забирает две колонки
 * вместо обхода поддерева на каждую карточку, а результат один на страницу.
 *
 * Возвращает число только для запрошенных id: у корня это размер ветки,
 * у вложенного поста — число ответов под ним.
 */
export async function branchCounts(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const { data, error } = await supabase.from("posts").select("id, parent_id").limit(20_000);

  if (error) {
    console.error("branch counts query failed", error);
    return counts;
  }

  const children = new Map<string, string[]>();
  for (const row of data ?? []) {
    const { id, parent_id: parentId } = row as { id: string; parent_id: string | null };
    if (!parentId) continue;
    const list = children.get(parentId);
    if (list) list.push(id);
    else children.set(parentId, [id]);
  }

  // Обход в ширину с защитой от повторов: при испорченных данных цикл
  // не должен превращаться в бесконечный цикл на странице.
  for (const rootId of ids) {
    const seen = new Set<string>([rootId]);
    const queue = [rootId];
    let total = 0;

    while (queue.length > 0) {
      const next: string[] = [];
      for (const id of queue) {
        for (const child of children.get(id) ?? []) {
          if (seen.has(child)) continue;
          seen.add(child);
          total += 1;
          next.push(child);
        }
      }
      queue.length = 0;
      queue.push(...next);
    }

    counts.set(rootId, total);
  }

  return counts;
}

/** Какие из постов текущий пользователь уже лайкнул — одним запросом на страницу. */
async function likedIds(supabase: SupabaseServerClient, viewerId: string | null, postIds: string[]): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();

  const { data } = await supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds);

  return new Set((data ?? []).map((row) => row.post_id as string));
}

/*
 * Выбор набора колонок.
 *
 * score и level появляются с миграцией 0029, а PostgREST отвечает ошибкой на
 * несуществующую колонку. Раньше откат был только в ленте, и страница ветки
 * или профиль молча оставались пустыми. Теперь набор выбирается один раз, и
 * все запросы постов ведут себя одинаково.
 */
async function withPostColumns<T>(supabase: SupabaseServerClient, run: (columns: string) => PromiseLike<T>): Promise<T> {
  const first = await run(POST_COLUMNS);

  if (!(first as { error?: unknown } | null)?.error) return first;

  return run(POST_COLUMNS_LEGACY);
}

/**
 * Лента постов. Корень ветки стоит по времени последнего ответа, иначе
 * активная ветка уезжает вниз вслед за свежим ответом в глубоком ответе.
 * Внутри корня показываем только сам корень — ответы живут на странице ветки.
 */
export async function fetchPosts(
  supabase: SupabaseServerClient,
  options: {
    viewerId: string | null;
    offset?: number;
    limit?: number;
    followingOf?: string | null;
    /** Уже вычисленные авторы подписок: тот же список для обоих запросов. */
    followingIds?: string[] | null;
  },
): Promise<Post[]> {
  const limit = options.limit ?? POSTS_PAGE_SIZE;
  const offset = options.offset ?? 0;

  /*
   * Один и тот же запрос строится дважды: с новыми колонками и с откатом.
   * Фильтр по подпискам и сортировка по времени ответа должны быть в обоих
   * одинаковыми, иначе откат тихо показал бы другую ленту.
   */
  const build = (columns: string) => {
    const base = supabase
      .from("posts")
      .select(columns)
      .is("parent_id", null)
      /*
       * Первый ключ — активность ветки, второй — время создания. Без второго
       * пост без ответов (у него last_reply_at пустой до миграции 0033)
       * уезжал в конец списка, и свежая запись выглядела пропавшей.
       */
      .order("last_reply_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const scoped = options.followingIds ? base.in("author_id", options.followingIds) : base;
    return scoped as unknown as PromiseLike<{ data: PostRow[] | null; error: PostgrestErrorLike | null }>;
  };

  if (options.followingOf && !options.followingIds) return [];

  const { data, error } = await build(POST_COLUMNS);

  if (error) {
    /*
     * Откат на набор колонок без score и level. Ошибку логируем: если дело
     * не в миграции, а в чём-то ещё, по молчанию это не разглядеть.
     */
    const preDiscount = await build(POST_COLUMNS_PRE_DISCOUNT);

    if (!preDiscount.error) {
      return decorate(supabase, (preDiscount.data ?? []) as PostRow[], options.viewerId);
    }

    const fallback = await build(POST_COLUMNS_LEGACY);

    if (fallback.error) {
      // Молчаливый пустой массив выглядел бы как «постов нет» и прятал бы
      // поломку запроса. Пусть причина будет видна в логах сервера.
      console.error("posts feed query failed", fallback.error);
      return [];
    }

    return decorate(supabase, (fallback.data ?? []) as PostRow[], options.viewerId);
  }

  if (!data) return [];

  return decorate(supabase, data as PostRow[], options.viewerId);
}

/** Лайки и счётчики веток собираются одинаково для обоих наборов колонок. */
async function decorate(
  supabase: SupabaseServerClient,
  rows: PostRow[],
  viewerId: string | null,
): Promise<Post[]> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [liked, totals] = await Promise.all([
    likedIds(supabase, viewerId, ids),
    branchCounts(supabase, ids),
  ]);

  return rows.map((row) => toPost(row, liked, totals.get(row.id)));
}

/** Корень ветки со всеми потомками до maxDepth уровней. */
export async function fetchThread(
  supabase: SupabaseServerClient,
  rootId: string,
  viewerId: string | null,
  maxDepth = THREAD_RENDER_DEPTH,
): Promise<{ root: Post | null; replies: Post[] }> {
  const root = await withPostColumns(supabase, (columns) =>
    supabase.from("posts").select(columns).eq("id", rootId).maybeSingle(),
  );
  const { data, error } = root as { data: unknown; error: PostgrestErrorLike | null };

  if (error) {
    console.error("thread query failed", error);
    return { root: null, replies: [] };
  }

  if (!data) return { root: null, replies: [] };

  const rootRow = data as PostRow;

  // Собираем потомков по уровням: один запрос на глубину вместо рекурсии в SQL
  const replyRows: PostRow[] = [];
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const level = await withPostColumns(supabase, (columns) =>
      supabase.from("posts").select(columns).in("parent_id", frontier).order("created_at", { ascending: true }),
    );

    const rows = (((level as { data: PostRow[] | null }).data ?? []) as PostRow[]).filter(
      (row) => !seen.has(row.id),
    );
    if (rows.length === 0) break;

    for (const row of rows) seen.add(row.id);
    replyRows.push(...rows);
    frontier = rows.map((row) => row.id);
  }

  const ids = [rootRow.id, ...replyRows.map((row) => row.id)];

  const [liked, totals] = await Promise.all([
    likedIds(supabase, viewerId, ids),
    // Внутри ветки счётчик тоже нужен: у вложенного ответа он показывал
    // только прямых детей, хотя глубже была переписка.
    branchCounts(supabase, ids),
  ]);

  return {
    root: toPost(rootRow, liked, totals.get(rootRow.id)),
    replies: replyRows.map((row) => toPost(row, liked, totals.get(row.id))),
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
  const result = await withPostColumns(supabase, (columns) =>
    supabase
      .from("posts")
      .select(columns)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1),
  );

  const rows = ((result as { data: PostRow[] | null }).data ?? []) as PostRow[];
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
  const result = await withPostColumns(supabase, (columns) =>
    supabase
      .from("posts")
      .select(columns)
      .eq("author_id", profileId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  const data = (result as { data: PostRow[] | null }).data;

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
    typeBeatArtists: beat.typeBeatArtists,
    saleState: beat.saleState,
    coverUrl: beat.coverUrl,
    mp3Url: beat.mp3Url,
    prices: beat.prices,
    username: author.username,
    avatarUrl: author.avatarUrl,
    isPublic: true,
    currency: beat.currency,
    plays: beat.plays,
    score: beat.score,
    sellerLevel: beat.sellerLevel,
    discountPercent: beat.discountPercent,
    pricesBefore: beat.pricesBefore,
    likes: beat.likes,
    saves: beat.saves,
    liked: false,
    saved: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
  };
}