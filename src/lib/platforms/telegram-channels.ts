/**
 * Каналы, подключённые к Telegram.
 *
 * Схема закрыта от пользователей сайта: писать сюда умеет только бот по
 * служебному ключу. Поэтому здесь нет вызова через серверный клиент
 * пользователя — только отдельное подключение с ключом сервиса.
 */

import { createClient } from "@supabase/supabase-js";

export type TelegramChannel = { chatId: number; title: string | null };

const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? null;

const client = () => {
  const secret = key();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!secret || !url) return null;

  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
};

/** Запомнить канал, куда бот был добавлен администратором. */
export async function rememberChannel(ownerTelegramId: number, chatId: number, title?: string): Promise<boolean> {
  const supabase = client();
  if (!supabase) return false;

  const { error } = await supabase
    .from("telegram_channels")
    .upsert({ owner_telegram_id: ownerTelegramId, chat_id: chatId, title: title ?? null }, { onConflict: "owner_telegram_id" });

  // Ошибку глотаем: вебхук обязан ответить Telegram 200, иначе тот будет
  // повторять апдейт до бесконечности.
  return !error;
}

/** Канал, подключённый этим человеком. */
export async function channelOf(ownerTelegramId: number): Promise<TelegramChannel | null> {
  const supabase = client();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("telegram_channels")
    .select("chat_id, title")
    .eq("owner_telegram_id", ownerTelegramId)
    .maybeSingle();

  if (error || !data) return null;

  return { chatId: Number(data.chat_id), title: data.title ?? null };
}
