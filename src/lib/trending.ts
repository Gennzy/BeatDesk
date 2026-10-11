import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Биты, которые слушали за последнее окно.
 *
 * Не «популярные за всё время» — этим уже занят сортировщик ленты. Здесь
 * другое: биты, у которых прослушивания набираются именно сейчас. Число
 * считает функция trending_beats в базе (миграция 0041), потому что
 * событий с каждым прослушиванием становится больше, и вытаскивать их в
 * приложение, чтобы сложить в кучу, — значит держать в памяти всё, что
 * накопилось за неделю.
 *
 * Пустой ответ — честный ответ. Раздел показывает, что за окно ничего не
 * слушали, и не добивает список битами, которые набрали прослушивания
 * месяц назад: это была бы вывеска без содержимого.
 */

/** Окно, за которое считаем набор. Неделя — достаточно, чтобы увидеть ход. */
export const TRENDING_DAYS = 7;

export type TrendingBeat = {
  id: string;
  title: string;
  coverUrl: string | null;
  ownerUsername: string | null;
  playsLast: number;
};

export async function fetchTrendingBeats(
  supabase: SupabaseClient | null,
  limit = 4,
): Promise<TrendingBeat[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("trending_beats", {
    p_days: TRENDING_DAYS,
    p_limit: limit,
  });

  if (error || !Array.isArray(data) || data.length === 0) return [];

  const ids = (data as Array<{ beat_id: string; plays_last: number }>).map((row) => row.beat_id);
  if (ids.length === 0) return [];

  // Ранги приходят из функции, а обложку и автора она не отдаёт: их
  // добираем одним запросом, чтобы не делать по одному на каждый бит.
  const { data: beats } = await supabase
    .from("beats")
    .select("id, title, cover_url, profiles!beats_owner_id_fkey(username)")
    .in("id", ids);

  const byId = new Map(
    ((beats ?? []) as Array<{
      id: string;
      title: string;
      cover_url: string | null;
      profiles: { username: string } | { username: string }[] | null;
    }>).map((row) => [
      row.id,
      {
        title: row.title,
        coverUrl: row.cover_url,
        ownerUsername: Array.isArray(row.profiles) ? row.profiles[0]?.username ?? null : row.profiles?.username ?? null,
      },
    ]),
  );

  const playsBy = new Map(
    (data as Array<{ beat_id: string; plays_last: number }>).map((row) => [row.beat_id, row.plays_last]),
  );

  // Порядок задаёт база: по числу прослушиваний за окно, затем по свежести.
  return ids
    .map((id) => {
      const beat = byId.get(id);
      if (!beat) return null;
      return {
        id,
        title: beat.title,
        coverUrl: beat.coverUrl,
        ownerUsername: beat.ownerUsername,
        playsLast: playsBy.get(id) ?? 0,
      } satisfies TrendingBeat;
    })
    .filter((item): item is TrendingBeat => item !== null);
}