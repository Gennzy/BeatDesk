import { NextResponse } from "next/server";

import { getBotToken, getBotInfo } from "@/lib/platforms/telegram-client";
import { createBeatShareLink } from "@/lib/platforms/telegram-beat-share";
import { createClient } from "@/lib/supabase/server";

/**
 * Ссылка «отправить бит в Telegram» для владельца бита.
 *
 * Возвращает не саму карточку, а ссылку: отправкой занимается бот, у
 * которого есть токен и который умеет красиво верст��ть сообщение. Если
 * отправлять отсюда, то бот не узнает, в какой чат слать.
 *
 * Проверка владения — здесь, а не в подписи: подпись доказывает, что её не
 * подделали, но не то, что её выдал хозяин бита. Ссылку на чужой бит
 * получить нельзя; открыть уже полученную ссылку на свой бит может любой,
 * и это не беда — бит публичный.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const token = getBotToken();

  if (!token) {
    return NextResponse.json({ error: "Бот не настроен: не задан TELEGRAM_BOT_TOKEN" }, { status: 503 });
  }

  const info = await getBotInfo(token);

  if (!info?.username) {
    /*
     * Имя бота не спросилось — обычно это сеть или лимит Telegram. Пишем
     * «попробуйте позже», а не «ссылка готова»: человек нажал кнопку ради
     * результата, и результата не будет.
     */
    return NextResponse.json({ error: "Бот не отвечает. Попробуйте через минуту." }, { status: 502 });
  }

  const { id } = await params;

  const { data: beat } = await supabase
    .from("beats")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();

  // Чужой бит и несуществующий дают одинаковый отказ: различать их в ответе
  // значит подтверждать, что бит существует.
  if (!beat || beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Бит не найден" }, { status: 404 });
  }

  const share = createBeatShareLink({ beatId: beat.id, ownerId: beat.owner_id });

  if (!share) {
    return NextResponse.json(
      { error: "Сервер не настроен: не задан PLATFORM_TOKEN_SECRET" },
      { status: 503 },
    );
  }

  return NextResponse.json({ url: `https://t.me/${info.username}?start=${share}` });
}