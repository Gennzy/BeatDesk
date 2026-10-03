import { NextResponse } from "next/server";

import { fetchUpdates, getBotToken } from "@/lib/platforms/telegram-client";
import { createClient } from "@/lib/supabase/server";

export type DetectedChat = { chatId: string; type: string; title: string };

/**
 * Ищем чаты, где бот уже есть: добавь его в канал администратором
 * или напиши ему в личку — чат появится здесь.
 */
export async function GET() {
  const token = getBotToken();
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN не задан" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const updates = await fetchUpdates(token);

  const chats = new Map<string, DetectedChat>();

  for (const update of updates) {
    const message = update.message;
    if (!message) continue;

    const title =
      message.chat.type === "private"
        ? (message.chat.username ? `@${message.chat.username}` : "Личный чат")
        : (message.chat.title ?? message.chat.type);

    chats.set(String(message.chat.id), { chatId: String(message.chat.id), type: message.chat.type, title });
  }

  return NextResponse.json({ chats: [...chats.values()] });
}
