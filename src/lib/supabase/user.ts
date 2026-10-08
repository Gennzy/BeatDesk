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
    username: profile?.username ?? (user.email ? user.email.split("@")[0] : "user"),
    avatarUrl: profile?.avatar_url ?? null,
    mode: profile?.mode === "seller" ? "seller" : "buyer",
  };
}

export { SUPABASE_PUBLISHABLE_KEY };