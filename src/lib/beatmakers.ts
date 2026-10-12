import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Список продавцов для индекса /beatmakers.
 *
 * До этого страницы не существовало: продавца можно было найти только
 * кликом с карточки бита. Это плохо работает обеим сторонам: покупатель
 * не может посмотреть, кто вообще продаёт, а продавец не попадает в
 * трафик, пока кто-то не соизволит нажать на его ник.
 *
 * Здесь только те, у кого есть что купить. Профиль без битов в продаже
 * в индекс не попадает: пустая витрина продавца — это не витрина, и в
 * списке она выглядит битой, а не недоступной.
 */

export type Beatmaker = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  level: number;
  /** Сколько битов продаётся. */
  beatsOnSale: number;
  /** Прослушивания по всем битам продавца. */
  plays: number;
  followerCount: number;
};

export const BEATMAKERS_LIMIT = 48;

/** Сколько битов перебираем, чтобы собрать индекс. */
const BEATS_FOR_INDEX = 500;

/**
 * Считается ли цена выставленной.
 *
 * То же правило, что в форме загрузки и в карточке: уровень продаётся,
 * если цена больше нуля. Бит без цены покупатель не купит, и в индексе
 * он был бы пустым местом.
 */
const onSale = (prices: unknown): boolean => {
  if (!prices || typeof prices !== "object") return false;
  return Object.values(prices as Record<string, unknown>).some(
    (value) => typeof value === "number" && value > 0,
  );
};

export async function fetchPublicBeatmakers(supabase: SupabaseClient | null): Promise<Beatmaker[]> {
  if (!supabase) return [];

  /*
   * Запрос идёт со стороны битов, а не профилей, и это не стилистическое
   * предпочтение. Обратный порядок — взять все профили и отбросить тех, у
   * кого нет битов, — на деле означал limit() до фильтра: база отдавала
   * первые двести строк по алфавиту, а это сплошные тестовые учётки без
   * единого бита, и страница показывала «никто не выставил биты», хотя на
   * витрине их лежали оба.
   */
  const { data, error } = await supabase
    .from("beats")
    .select(
      "id, plays, prices, owner_id, sale_state, profiles!beats_owner_id_fkey(id, username, avatar_url, bio, level)",
    )
    .eq("is_public", true)
    /*
     * sale_state обязателен рядом с is_public. У черновика is_public бывает
     * включён — он уже загружен, но ещё не выставлен, — и без этой проверки
     * индекс показывал «3 бита» там, где профиль того же продавца писал
     * «2 бита». Два числа об одном на двух страницах площадки — это не
     * косметика: человек видит, что одно из них врёт, и перестаёт верить
     * обоим.
     */
    .eq("sale_state", "on_sale")
    .limit(BEATS_FOR_INDEX);

  if (error || !data) return [];

  const rows = data as unknown as Array<{
    id: string;
    plays: number | null;
    prices: unknown;
    owner_id: string;
    profiles: {
      id: string;
      username: string;
      avatar_url: string | null;
      bio: string | null;
      level: number | null;
    } | null;
  }>;

  // Собираем продавцов по битам: в выборку попадает ровно тот, у кого есть
  // что купить, и ни одной пустой строки.
  const byOwner = new Map<string, Beatmaker>();

  for (const beat of rows) {
    const profile = beat.profiles;
    if (!profile || !onSale(beat.prices)) continue;

    const existing = byOwner.get(profile.id);
    if (existing) {
      existing.beatsOnSale += 1;
      existing.plays += beat.plays ?? 0;
      continue;
    }

    byOwner.set(profile.id, {
      id: profile.id,
      username: profile.username,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      level: profile.level ?? 1,
      beatsOnSale: 1,
      plays: beat.plays ?? 0,
      followerCount: 0,
    });
  }

  const beatmakers = [...byOwner.values()];
  const counts = await countFollowers(
    supabase,
    beatmakers.map((maker) => maker.id),
  );

  for (const maker of beatmakers) {
    maker.followerCount = counts.get(maker.id) ?? 0;
  }

  // Порядок — сначала те, кого слушали, потом подписчики, потом имя.
  // Прослушивания стоят первыми: это единственный сигнал, который честно
  // говорит, что человека уже слушали и к нему возвращаются.
  beatmakers.sort((a, b) => {
    if (b.plays !== a.plays) return b.plays - a.plays;
    if (b.followerCount !== a.followerCount) return b.followerCount - a.followerCount;
    return a.username.localeCompare(b.username, "ru");
  });

  return beatmakers.slice(0, BEATMAKERS_LIMIT);
}

/**
 * Сколько человек подписано на каждого из продавцов.
 */
async function countFollowers(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .in("following_id", ids);

  for (const row of (data ?? []) as Array<{ following_id: string }>) {
    counts.set(row.following_id, (counts.get(row.following_id) ?? 0) + 1);
  }

  return counts;
}