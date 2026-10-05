import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site";
import { chatKind, formatIdCard, wantsId } from "@/lib/platforms/telegram-format";
import {
  getBotToken,
  sendTelegramMessage,
  type TelegramMessage,
} from "@/lib/platforms/telegram-client";

type CallbackQuery = {
  id: string;
  data?: string;
  from: { id: number; first_name?: string; username?: string };
};

type Chat = {
  id: number;
  type?: string;
  title?: string;
  username?: string;
};

type Update = {
  update_id: number;
  message?: TelegramMessage & { text?: string; chat?: Chat };
  callback_query?: CallbackQuery & { message?: { chat?: Chat } };
  /** Бота добавили в чат или выдали права: приходит без сообщения. */
  my_chat_member?: {
    chat: Chat;
    new_chat_member: { status: string; user?: { is_bot?: boolean } };
  };
};

/** Кнопка, которая просит бот отдать номер канала. */
const CONNECT_CHANNEL = "channel:id";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Кнопки бота: на старте и в личке, дальше — по нажатию. */
function menuMarkup(siteUrl: string) {
  return {
    inline_keyboard: [
      [
        { text: "▶ Открыть BeatDesk", url: `${siteUrl}/` },
        { text: "Загрузить бит", url: `${siteUrl}/upload` },
      ],
      [{ text: "Моя лента", url: `${siteUrl}/` }],
      // Всё через кнопки: команду надо помнить, кнопку — нажать.
      [{ text: "🔗 Подключить канал", callback_data: CONNECT_CHANNEL }],
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

  // Fail closed: без секрета эндпоинт не принимает ничего. Иначе незащищённая
  // конфигурация молча превращалась в открытый на весь интернет приёмник,
  // через который любой мог слать апдейты от имени Telegram.
  if (!secret) return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET не задан" }, { status: 503 });

  if (request.headers.get(SECRET_HEADER) !== secret) {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }

  // Без ключа у Telegram апдейты летели чаще, чем бот успевал отвечать.
  const gate = rateLimit(clientKey(request, "telegram-webhook"), 120, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Слишком много апдейтов" }, { status: 429 });
  }

  const update = (await request.json()) as Update;
  const siteUrl = await getSiteUrl();

  try {
    if (update.message?.text?.startsWith("/start")) {
      const chat = update.message.chat;
      await sendTelegramMessage(token, {
        chat_id: chat.id,
        text: welcome([chat.title, chat.username].filter(Boolean).join(" ")),
        parse_mode: "HTML",
        reply_markup: menuMarkup(siteUrl),
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
          "/id или просто «айди» — ID канала для раздела «Площадки»",
        ].join("\n"),
        parse_mode: "HTML",
        reply_markup: menuMarkup(siteUrl),
      });
    }

    // Страница площадок просит вписать ID вручную. Бот знает этот номер,
    // поэтому отдаём его по команде, а не заставляем искать в другом окне.
    if (wantsId(update.message?.text)) {
      const chat = update.message!.chat;

      await sendTelegramMessage(token, {
        chat_id: chat.id,
        text: formatIdCard({
          id: chat.id,
          title: chat.title,
          username: chat.username,
          kind: chatKind(chat),
        }),
        parse_mode: "HTML",
      });
    }

    // Нажатие «Подключить канал»: номер берём из чата, где нажали.
    if (update.callback_query?.data === CONNECT_CHANNEL) {
      const chat = update.callback_query.message?.chat;
      const kind = chatKind(chat);

      await answerCallback(token, update.callback_query.id, "Готовлю номер");
      await sendTelegramMessage(token, {
        chat_id: chat?.id ?? update.callback_query.from.id,
        text: formatIdCard({
          id: chat?.id ?? update.callback_query.from.id,
          title: chat?.title,
          username: chat?.username,
          kind,
        }),
        parse_mode: "HTML",
      });
    }

    if (update.callback_query && update.callback_query.data !== CONNECT_CHANNEL) {
      await answerCallback(token, update.callback_query.id, "Открываю BeatDesk");
    }

    // Бота добавили в канал администратором: сразу отдаём номер канала.
    if (update.my_chat_member && update.my_chat_member.new_chat_member.user?.is_bot) {
      const chat = update.my_chat_member.chat;

      if (chatKind(chat) === "канал") {
        await sendTelegramMessage(token, {
          chat_id: chat.id,
          text: formatIdCard({ id: chat.id, title: chat.title, username: chat.username, kind: "канал" }),
          parse_mode: "HTML",
        });
      }
    }

    // На любой другой текст отвечаем меню, а не молчим: человек должен
    // понимать, что бот его услышал, даже если не понял.
    const text = update.message?.text;
    const chat = update.message?.chat;

    if (text && chat && !text.startsWith("/start") && !text.startsWith("/help") && !wantsId(text)) {
      await sendTelegramMessage(token, {
        chat_id: chat.id,
        text: "Не понял, что сделать. Вот кнопки:",
        parse_mode: "HTML",
        reply_markup: menuMarkup(siteUrl),
      });
    }
  } catch {
    // отвечаем Telegram 200, чтобы он не ретраил
  }

  return NextResponse.json({ ok: true, updateId: update.update_id });
}
