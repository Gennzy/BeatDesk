import { createClient } from "@supabase/supabase-js";

import { isCode, isSafeTarget, newCode, normalizeTarget, shortUrl } from "./short-links";

/**
 * Хранение коротких ссылок.
 *
 * Счётчик кликов растёт по служебному ключу: переход делает гость без сессии,
 * и политика RLS его бы не пустила. Это единственное место в проекте, где
 * строка меняется без участия владельца.
 */

export type ShortLink = { code: string; path: string; clicks: number };

const client = () => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!secret || !url) return null;

  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const isAvailable = () => Boolean(client());

/**
 * Завести ссылку.
 *
 * Повторяем попытку со свежим кодом: код мог занять кто-то между проверкой
 * и вставкой, и это не повод отказывать человеку.
 */
export async function createLink(userId: string, path: string): Promise<{ code: string } | { error: string }> {
  if (!isSafeTarget(path)) return { error: "Ссылка должна вести внутрь сайта" };

  const supabase = client();
  if (!supabase) return { error: "Сервер не настроен: не задан SUPABASE_SERVICE_ROLE_KEY" };

  const target = normalizeTarget(path);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    const { error } = await supabase.from("short_links").insert({ code, user_id: userId, target_path: target });

    // Дубль кода — единственная ожидаемая неудача, повторяем.
    if (!error) return { code };
    if (error.code !== "23505") return { error: error.message };
  }

  return { error: "Не удалось занять код, попробуй ещё раз" };
}

/**
 * Найти цель и посчитать переход.
 *
 * Счётчик увеличиваем после того, как цель найдена: иначе переходы по
 * несуществующим кодам раздували бы статистику чужих ссылок.
 */
export async function resolve(code: string): Promise<{ path: string } | { error: "notFound" | "unavailable" }> {
  const supabase = client();
  if (!supabase) return { error: "unavailable" };
  if (!isCode(code)) return { error: "notFound" };

  const { data } = await supabase.from("short_links").select("target_path").eq("code", code).maybeSingle();

  const path = (data as { target_path?: string } | null)?.target_path;
  if (!path || !isSafeTarget(path)) return { error: "notFound" };

  // Инкремент на стороне базы: иначе гонка двух переходов теряла бы клик.
  void supabase.rpc("bump_short_link", { link_code: code });

  return { path };
}

/** Ссылки человека для интерфейса. */
export async function listLinks(userId: string): Promise<ShortLink[]> {
  const supabase = client();
  if (!supabase) return [];

  const { data } = await supabase
    .from("short_links")
    .select("code, target_path, clicks")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => ({
    code: String(row.code),
    path: String(row.target_path),
    clicks: Number(row.clicks ?? 0),
  }));
}

/** Удалить ссылку: после этого адрес перестаёт работать. */
export async function deleteLink(userId: string, code: string): Promise<boolean> {
  const supabase = client();
  if (!supabase || !isCode(code)) return false;

  const { data } = await supabase.from("short_links").delete().eq("code", code).eq("user_id", userId).select("code");

  return Boolean((data as unknown[] | null)?.length);
}

export { shortUrl };