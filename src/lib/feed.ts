import { normalizePrices } from "@/lib/prices";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Prices } from "@/lib/prices";

export const FEED_PAGE_SIZE = 12;

/*
 * Сортировки ленты.
 *
 * "top" — по скору, и это сортировка по умолчанию. Скор затухает, поэтому
 * новый бит с первыми прослушиваниями встаёт рядом со старым с тысячей: у
 * обоих есть шанс. Сортировка "new" была по умолчанию и делала вторую
 * половину площадки невидимой, а "popular" по голым прослушиваниям держал
 * верх ленты у тех, кто выложился первым.
 */
export type FeedSort = "top" | "new" | "popular";

export type FeedFilters = {
  scope?: FeedScope;
  sort?: FeedSort;
  query?: string;
  key?: string;
  bpmMin?: number;
  bpmMax?: number;
};

import type { SaleState } from "@/lib/sales/state";
import type { FeedScope } from "@/lib/feed-filters";

export type FeedBeat = {
  id: string;
  title: string;
  bpm: number;
  musicalKey: string;
  tags: string[];
  /** Чей это бит: тип-биты ищут по артистам, и это не то же самое, что теги. */
  typeBeatArtists: string[];
  coverUrl: string | null;
  mp3Url: string | null;
  prices: Prices;
  currency: string;
  username: string;
  avatarUrl: string | null;
  isPublic: boolean;
  /**
   * Состояние продажи. Отдельное от is_public: бит может лежать на витрине
   * публично, но быть уже продан или забронирован другим покупателем.
   */
  saleState: SaleState;
  plays: number;
  /** Скор ранжирования: показывается в кабинете, в ленте сортирует. */
  score: number;
  /** Уровень продавца 1..10: поднимает бит, но не перевешивает содержание. */
  sellerLevel: number;
  likes: number;
  saves: number;
  /** Наш выбор: без него кнопки мигали бы после каждой перезагрузки. */
  liked: boolean;
  saved: boolean;
  createdAt: string;
  updatedAt: string | null;
};

type BeatRow = {
  id: string;
  title: string;
  bpm: number;
  key: string;
  tags: string[] | null;
  type_beat_artists: string[] | null;
  cover_url: string | null;
  mp3_url: string | null;
  prices: FeedBeat["prices"] | null;
  currency: string | null;
  is_public: boolean;
  sale_state?: SaleState | null;
  plays?: number;
  score?: number | null;
  created_at: string;
  updated_at?: string | null;
  profiles:
    | { username: string; avatar_url: string | null; level?: number }
    | { username: string; avatar_url: string | null; level?: number }[]
    | null;
  beat_reactions?: { kind: string; user_id: string }[] | null;
};

const BEAT_COLUMNS =
  "id, title, bpm, key, tags, type_beat_artists, cover_url, mp3_url, prices, currency, is_public, sale_state, plays, score, created_at, updated_at, profiles!beats_owner_id_fkey(username, avatar_url, level), beat_reactions(kind, user_id)";

/** Пока не применена миграция 0007, колонок plays и updated_at ещё нет в базе. */
const LEGACY_BEAT_COLUMNS =
  "id, title, bpm, key, tags, type_beat_artists, cover_url, mp3_url, prices, is_public, created_at, profiles!beats_owner_id_fkey(username, avatar_url)";

function serialize(row: BeatRow, viewerId?: string | null): FeedBeat {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const reactions = row.beat_reactions ?? [];

  return {
    id: row.id,
    title: row.title,
    bpm: row.bpm,
    musicalKey: row.key,
    tags: row.tags ?? [],
    typeBeatArtists: row.type_beat_artists ?? [],
    coverUrl: row.cover_url,
    mp3Url: row.mp3_url,
    prices: normalizePrices(row.prices),
    currency: row.currency ?? "RUB",
    username: profile?.username ?? "unknown",
    avatarUrl: profile?.avatar_url ?? null,
    isPublic: row.is_public,
    saleState: (row.sale_state ?? "draft") as SaleState,
    plays: row.plays ?? 0,
    score: Number(row.score ?? 0),
    sellerLevel: profile?.level ?? 1,
    likes: reactions.filter((reaction) => reaction.kind === "like").length,
    saves: reactions.filter((reaction) => reaction.kind === "save").length,
    liked: viewerId !== null && viewerId !== undefined
      ? reactions.some((reaction) => reaction.kind === "like" && reaction.user_id === viewerId)
      : false,
    saved: viewerId !== null && viewerId !== undefined
      ? reactions.some((reaction) => reaction.kind === "save" && reaction.user_id === viewerId)
      : false,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

type QueryOptions = {
  /** Кто смотрит ленту: его реакции помечаются, чужие считаются. */
  viewerId?: string | null;
  /** Авторы, чьи биты попадают в личную вкладку «подписки». */
  ownerIds?: string[] | null;
  /** Ограничение по конкретным битам: вкладка «понравившиеся». */
  beatIds?: string[] | null;
  filters?: FeedFilters;
  ownerId?: string;
  isOwner?: boolean;
  offset?: number;
  limit?: number;
};

type QueryResult = { data: BeatRow[] | null; error: { message: string } | null };

/**
 * Поиск идёт по названию и по тегу. Теги в базе хранятся без решётки,
 * поэтому в фильтр уходит чистое слово: # и запятые разрывают or-фильтр PostgREST.
 */
export function normalizeSearch(input: string): string {
  return input
    .replace(/^[#\s]+/, "")
    .replace(/[#%,()'"\\]/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 60);
}

/**
 * Подборка под личную вкладку.
 *
 * Список авторов и битов берётся отдельным запросом: PostgREST умеет фильтровать
 * по вложенным строкам, но через !inner он меняет и форму ответа, из-за чего
 * пришлось бы дублировать разбор коллекций ради одной вкладки.
 */
async function resolveScope(
  supabase: SupabaseServerClient,
  scope: FeedScope,
  viewerId: string | null,
): Promise<{ options: { ownerIds?: string[]; beatIds?: string[] } } | { unavailable: true }> {
  if (scope === "all") return { options: {} };
  if (!viewerId) return { unavailable: true };

  if (scope === "following") {
    const { data } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId);
    return { options: { ownerIds: [...new Set((data ?? []).map((row) => row.following_id as string))] } };
  }

  const { data } = await supabase
    .from("beat_reactions")
    .select("beat_id")
    .eq("user_id", viewerId)
    .eq("kind", "like")
    .order("created_at", { ascending: false })
    .limit(200);

  return { options: { beatIds: (data ?? []).map((row) => row.beat_id as string) } };
}

/** Пустой успешный ответ: лента без битов и без следующей страницы. */
function emptyResult() {
  return { data: [], error: null } as unknown as QueryResult;
}

async function queryBeats(supabase: SupabaseServerClient, columns: string, options: QueryOptions): Promise<QueryResult> {
  const filters = options.filters ?? {};
  const limit = options.limit ?? FEED_PAGE_SIZE;
  const offset = options.offset ?? 0;

  let query = supabase.from("beats").select(columns);

  if (options.ownerId) {
    query = query.eq("owner_id", options.ownerId);
    if (!options.isOwner) query = query.eq("is_public", true);
  } else {
    query = query.eq("is_public", true);
  }

  if (filters.query) {
    const clean = normalizeSearch(filters.query);
    if (clean) query = query.or(`title.ilike.%${clean}%,tags.cs.{${clean}}`);
  }

  /*
   * Личные вкладки сужают выборку до конкретных авторов или битов. Пустой
   * список — это «ничего не показывать», а не «показать всё»: без проверки
   * .in с пустым массивом PostgREST отвечал бы без ограничений, и вкладка
   * подписок показывала бы витрину.
   */
  if (options.ownerIds) {
    if (options.ownerIds.length === 0) return emptyResult();
    query = query.in("owner_id", options.ownerIds);
  }

  if (options.beatIds) {
    if (options.beatIds.length === 0) return emptyResult();
    query = query.in("id", options.beatIds);
  }

  if (filters.key) query = query.eq("key", filters.key);
  if (typeof filters.bpmMin === "number" && Number.isFinite(filters.bpmMin)) query = query.gte("bpm", filters.bpmMin);
  if (typeof filters.bpmMax === "number" && Number.isFinite(filters.bpmMax)) query = query.lte("bpm", filters.bpmMax);

  /*
   * Порядок трёх сортировок.
   *
   * Скор может отсутствовать: до миграции 0029 колонки не было, и запрос с
   * ней упал бы целиком вместе с лентой. Поэтому выбор идёт по наличию
   * колонки в перечне, а не по флажку.
   */
  if (columns.includes("score") && filters.sort === "top") {
    // created_at вторым порядком: при равном скоре свежий выше, и страница
    // не дрожит при пересчёте.
    query = query.order("score", { ascending: false }).order("created_at", { ascending: false });
  } else if (columns.includes("plays") && filters.sort === "popular") {
    query = query.order("plays", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const result = await query.range(offset, offset + limit - 1);
  return result as QueryResult;
}

/** Публичная лента: сортировка, поиск, фильтры, постранично через offset. */
export async function fetchPublicBeats(
  supabase: SupabaseServerClient,
  offset = 0,
  limit = FEED_PAGE_SIZE,
  filters: FeedFilters = {},
  viewerId: string | null = null,
): Promise<{ beats: FeedBeat[]; nextOffset: number | null }> {
  const scope = await resolveScope(supabase, filters.scope ?? "all", viewerId);

  // Без входа личные вкладки показывают пустоту, а не витрину.
  if ("unavailable" in scope) return { beats: [], nextOffset: null };

  let result = await queryBeats(supabase, BEAT_COLUMNS, { filters, offset, limit, viewerId, ...scope.options });

  if (result.error) {
    result = await queryBeats(supabase, LEGACY_BEAT_COLUMNS, { filters, offset, limit, viewerId, ...scope.options });
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  const rows = result.data ?? [];
  return { beats: rows.map((row) => serialize(row, viewerId)), nextOffset: rows.length === limit ? offset + limit : null };
}

/** Биты одного битмейкера. Чужие показываем только публичные, свои все. */
export async function fetchBeatsByOwner(
  supabase: SupabaseServerClient,
  ownerId: string,
  isOwner: boolean,
): Promise<FeedBeat[]> {
  let result = await queryBeats(supabase, BEAT_COLUMNS, { ownerId, isOwner, limit: 60 });

  if (result.error) {
    result = await queryBeats(supabase, LEGACY_BEAT_COLUMNS, { ownerId, isOwner, limit: 60 });
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((row) => serialize(row as BeatRow));
}