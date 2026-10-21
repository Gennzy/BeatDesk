import "server-only";

import { rankTagsByDemand, type DemandRow } from "@/lib/demand";
import { createClient } from "@/lib/supabase/server";

/**
 * Спрос площадки: что находят на самом деле.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ЭТО ОТДЕЛЬНО
 *
 * Модель знает, как ищут биты вообще. Она не знает, как ищут у нас, и это
 * единственное наше преимущество перед любым сервисом, который пользуется
 * той же моделью: собственные прослушивания.
 *
 * Спрос собирается здесь, на сервере: база доступна серверному клиенту, и
 * отдать модели можно уже отобранные теги, а не сырые строки битов.
 *
 * ---------------------------------------------------------------------------
 * ЧТО СЧИТАЕТСЯ
 *
 * Прослушивания, а не просмотры: человек дослушал до конца. И с затуханием по
 * времени — спрос меняется, и битмейкеру нужен сегодняшний язык.
 */

/** Сколько битов смотрим: больше не нужно, а запрос тяжелеет. */
const SCAN_LIMIT = 300;

/** Сколько тегов отдаём модели: больше она всё равно не вспомнит. */
const TAGS_LIMIT = 12;

/**
 * Теги по спросу в жанре.
 *
 * Жанр пустой — берём спрос по всей площадке: лучше общие теги, чем никаких.
 */
export async function demandTagsFor(genre: string | null | undefined): Promise<string[]> {
  const supabase = await createClient();

  let query = supabase
    .from("beats")
    .select("tags, plays, created_at")
    .not("tags", "is", null)
    .limit(SCAN_LIMIT);

  if (genre) query = query.eq("genre", genre);

  const { data, error } = await query;

  if (error || !data) return [];

  const rows: DemandRow[] = (data as { tags: string[] | null; plays: number; created_at: string }[]).map(
    (row) => ({ tags: row.tags, plays: row.plays ?? 0, createdAt: row.created_at }),
  );

  return rankTagsByDemand(rows, TAGS_LIMIT).map((item) => item.tag);
}
