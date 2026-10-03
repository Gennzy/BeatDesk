import { createBrowserClient } from "@supabase/ssr";

import { isSupabaseConfigured, SupabaseNotConfiguredError, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

export function createClient() {
  if (!isSupabaseConfigured) {
    throw new SupabaseNotConfiguredError();
  }

  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

export type SupabaseBrowserClient = ReturnType<typeof createClient>;