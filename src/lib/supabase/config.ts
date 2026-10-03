export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase не настроен: нужны NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в .env.local");
    this.name = "SupabaseNotConfiguredError";
  }
}

/** Мастер лежит в старом публичном бакете и в закрытом его нет. */
export class LegacyMasterMissingError extends Error {
  constructor() {
    super("Файл мастера остался в старом публичном хранилище — его нужно загрузить заново");
    this.name = "LegacyMasterMissingError";
  }
}

/** Закрытый бакет мастеров не создан миграцией 0008_private_masters.sql. */
export class MastersBucketMissingError extends Error {
  constructor() {
    super("На сервере нет закрытого бакета для мастеров: не выполнена миграция 0008_private_masters.sql");
    this.name = "MastersBucketMissingError";
  }
}