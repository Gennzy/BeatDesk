import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY } from "./config";
import type { SupabaseServerClient } from "./server";
import { createClient } from "./server";

export type SessionUser = {
  id: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  /** Что человек делает по умолчанию: продаёт или покупает. Меняет навигацию. */
  mode: "buyer" | "seller";
};

export async function getSupabase(): Promise<SupabaseServerClient | null> {
  if (!isSupabaseConfigured) return null;
  try {
    return await createClient();
  } catch {
    return null;
  }
}

/** Текущий пользователь + его профиль. null, если нет сессии или Supabase не настроен. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("username, avatar_url, mode").eq("id", user.id).maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    // Без профиля — нейтральное имя, а не кусок почты: local-part адреса
    // светить в шапку нельзя. Профиль создаёт триггер при регистрации,
    // поэтому сюда код попадает только в сломанном состоянии.
    username: profile?.username ?? "user",
    avatarUrl: profile?.avatar_url ?? null,
    mode: profile?.mode === "seller" ? "seller" : "buyer",
  };
}

export { SUPABASE_PUBLISHABLE_KEY };