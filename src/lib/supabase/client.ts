import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, SupabaseNotConfiguredError, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let browserClient: SupabaseClient | null = null;

/**
 * Один клиент на всё приложение. createBrowserClient каждый раз создаёт
 * новое соединение, а подписки Realtime живут именно в соединении: второй
 * клиент не сможет отписать канал первого.
 */
export function createClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new SupabaseNotConfiguredError();
  }

  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }

  return browserClient;
}

export type SupabaseBrowserClient = ReturnType<typeof createClient>;
