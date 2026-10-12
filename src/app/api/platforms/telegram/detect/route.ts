import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { fetchUpdates, getBotToken } from "@/lib/platforms/telegram-client";
import { createClient } from "@/lib/supabase/server";

export type DetectedChat = { chatId: string; type: string; title: string };

/**
 * Ищем чаты, где бот уже есть: добавь его в канал администратором —
 * чат появится здесь.
 *
 * Лички не отдаём: имя чужого человека, написавшего боту, — не то, что
 * можно раздавать любому вошедшему. Для подключения нужны каналы и группы,
 * а не чужие диалоги.
 */
export async function GET(request: Request) {
  const token = getBotToken();
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN не задан" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  /*
   * Каждый опрос — это обращение к Telegram за всей лентой обновлений бота.
   * Без лимита один любопытный выбирал бы чужую ленту целиком и заодно
   * съедал бы квоту бота.
   */
  const gate = rateLimit(clientKey(request, `tg-detect:${user.id}`), 12, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const updates = await fetchUpdates(token);

  const chats = new Map<string, DetectedChat>();

  for (const update of updates) {
    const message = update.message;
    if (!message || message.chat.type === "private") continue;
    if (chats.size >= 50) break;

    const title = message.chat.title ?? message.chat.type;

    chats.set(String(message.chat.id), { chatId: String(message.chat.id), type: message.chat.type, title });
  }

  return NextResponse.json({ chats: [...chats.values()] });
}
