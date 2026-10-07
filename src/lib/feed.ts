import { normalizePrices } from "@/lib/prices";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Prices } from "@/lib/prices";

export const FEED_PAGE_SIZE = 12;

export type FeedSort = "new" | "popular";

export type FeedFilters = {
  sort?: FeedSort;
  query?: string;
  key?: string;
  bpmMin?: number;
  bpmMax?: number;
};

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
  plays: number;
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
  plays?: number;
  created_at: string;
  updated_at?: string | null;
  profiles: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[] | null;
};

const BEAT_COLUMNS =
  "id, title, bpm, key, tags, type_beat_artists, cover_url, mp3_url, prices, currency, is_public, plays, created_at, updated_at, profiles(username, avatar_url)";

/** Пока не применена миграция 0007, колонок plays и updated_at ещё нет в базе. */
const LEGACY_BEAT_COLUMNS =
  "id, title, bpm, key, tags, type_beat_artists, cover_url, mp3_url, prices, is_public, created_at, profiles(username, avatar_url)";

function serialize(row: BeatRow): FeedBeat {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

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
    plays: row.plays ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

type QueryOptions = {
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

  if (filters.key) query = query.eq("key", filters.key);
  if (typeof filters.bpmMin === "number" && Number.isFinite(filters.bpmMin)) query = query.gte("bpm", filters.bpmMin);
  if (typeof filters.bpmMax === "number" && Number.isFinite(filters.bpmMax)) query = query.lte("bpm", filters.bpmMax);

  const canSortByPlays = columns.includes("plays") && filters.sort === "popular";

  if (canSortByPlays) {
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
): Promise<{ beats: FeedBeat[]; nextOffset: number | null }> {
  let result = await queryBeats(supabase, BEAT_COLUMNS, { filters, offset, limit });

  if (result.error) {
    result = await queryBeats(supabase, LEGACY_BEAT_COLUMNS, { filters, offset, limit });
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  const rows = result.data ?? [];
  return { beats: rows.map(serialize), nextOffset: rows.length === limit ? offset + limit : null };
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

  return (result.data ?? []).map(serialize);
}