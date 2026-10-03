import { NextResponse } from "next/server";

import { SITE_URL } from "@/lib/site";
import {
  getBotToken,
  sendTelegramMessage,
  type TelegramMessage,
} from "@/lib/platforms/telegram-client";

type CallbackQuery = {
  id: string;
  data?: string;
  from: { first_name?: string; username?: string };
};

type Update = {
  update_id: number;
  message?: TelegramMessage & { text?: string };
  callback_query?: CallbackQuery;
};

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Кнопки бота: на старте и в личке, дальше — по нажатию. */
function menuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "▶ Открыть BeatDesk", url: `${SITE_URL}/` },
        { text: "Загрузить бит", url: `${SITE_URL}/upload` },
      ],
      [{ text: "Моя лента", url: `${SITE_URL}/` }],
    ],
  };
}

async function answerCallback(token: string, id: string, text: string) {
  const form = new FormData();
  form.append("callback_query_id", id);
  form.append("text", text);
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", body: form });
}

function welcome(name?: string) {
  return [
    "<b>BEATDESK</b>",
    "",
    name ? `${name}, привет.` : "Привет.",
    "",
    "Это бот BeatDesk. Здесь биты выкладываются сразу: обложка, темп, тональность, теги, цены и кнопки на прослушивание.",
    "",
    "Выбрать площадки и опубликовать — в кабинете BeatDesk, кнопка «Опубликовать».",
  ].join("\n");
}

/** Приём апдейтов от Telegram. Работает после деплоя: бот знает адрес вебхука. */
export async function POST(request: Request) {
  const token = getBotToken();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN не задан" }, { status: 503 });

  if (secret && request.headers.get(SECRET_HEADER) !== secret) {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }

  const update = (await request.json()) as Update;

  try {
    if (update.message?.text?.startsWith("/start")) {
      const chat = update.message.chat;
      await sendTelegramMessage(token, {
        chat_id: chat.id,
        text: welcome([chat.title, chat.username].filter(Boolean).join(" ")),
        parse_mode: "HTML",
        reply_markup: menuMarkup(),
      });
    }

    if (update.message?.text?.startsWith("/help")) {
      await sendTelegramMessage(token, {
        chat_id: update.message.chat.id,
        text: [
          "<b>BEATDESK</b>",
          "",
          "/start — меню",
          "/help — что умеет бот",
          "/link — ссылка на твой профиль в BeatDesk",
        ].join("\n"),
        parse_mode: "HTML",
        reply_markup: menuMarkup(),
      });
    }

    if (update.callback_query) {
      await answerCallback(token, update.callback_query.id, "Открываю BeatDesk");
    }
  } catch {
    // отвечаем Telegram 200, чтобы он не ретраил
  }

  return NextResponse.json({ ok: true, updateId: update.update_id });
}
