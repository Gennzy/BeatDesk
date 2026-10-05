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

/**
 * Что запомнить из апдейта Telegram.
 *
 * Автор события лежит в `my_chat_member.from`, а не в `message`: у этого
 * апдейта поля с сообщением вообще нет. Раньше автор брался из message, и
 * канал не записывался никогда — бот отвечал «не подключён» при живом
 * подключённом канале.
 */
export function channelToRemember(update: {
  message?: { from?: { id?: number; is_bot?: boolean } };
  my_chat_member?: {
    chat: { id: number; type?: string; title?: string };
    from?: { id?: number; is_bot?: boolean };
    new_chat_member?: { status?: string; user?: { is_bot?: boolean } };
  };
}): { ownerId: number; chatId: number; title?: string } | null {
  const member = update.my_chat_member;
  if (!member?.chat || member.chat.type !== "channel") return null;

  // Новый участник — бот. Иначе событие к нашей задаче не относится.
  if (!member.new_chat_member?.user?.is_bot) return null;

  // Привязывать канал должен человек: если событие вызвал бот, привязывать нечего.
  const ownerId = member.from?.id;
  if (!ownerId || member.from?.is_bot) return null;

  return { ownerId, chatId: member.chat.id, title: member.chat.title };
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
