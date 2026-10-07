import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "./config";

/**
 * Клиент с service role — только для выдачи файлов покупателю.
 *
 * Плохо и наоборот: RLS закрытого бакета мастеров пускает только владельца
 * пути, поэтому покупатель физически не может получить ссылку на купленный
 * мастер своим клиентом. Подписывать её должен сервер.
 *
 * Ключ обходит все политики, поэтому жить он может только на сервере и
 * доставаться только из маршрутов, которые сами проверили право: заказ
 * оплачен, лицензия не отозвана, уровень включает этот файл.
 */
export class ServiceRoleNotConfiguredError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY не задан: выдача файлов покупателю не работает");
    this.name = "ServiceRoleNotConfiguredError";
  }
}

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !key) throw new ServiceRoleNotConfiguredError();

  // Один клиент на процесс: фабрика дешёвая, но подписи и коннекты — нет.
  cached ??= createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
