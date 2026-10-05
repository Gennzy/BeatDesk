import {
  fetchUpdates,
  sendTelegramAudio,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "../telegram-client";
import { buildKeyboard, captionForPost, formatBeatCaption, planPost } from "../telegram-format";
import type { PlatformConnection } from "./vk";
import type { PublishPayload, PublishResult } from "../payload";

export { fetchUpdates };

function chatLink(chatId: number, messageId: number): string {
  const numeric = String(chatId);

  if (numeric.startsWith("-100")) {
    return `https://t.me/c/${numeric.slice(4)}/${messageId}`;
  }

  return `https://t.me/c/${messageId}`;
}

/**
 * Пост бита в канал или в личку: обложка с подписью и кнопками,
 * под ней сам mp3.
 */
export async function publishToTelegram(
  connection: PlatformConnection,
  payload: PublishPayload,
  token: string,
): Promise<PublishResult> {
  const chatId = connection.meta?.chatId;

  if (!chatId) {
    return { ok: false, error: "Не указан чат: добавь бота в канал или напиши ему в личку" };
  }

  const chat = String(chatId);
  const captionText = formatBeatCaption({
    title: payload.beat.title,
    artists: payload.beat.artists,
    bpm: payload.beat.bpm,
    musicalKey: payload.beat.musicalKey,
    tags: payload.beat.tags,
    prices: payload.beat.prices,
    username: payload.beat.username,
  });

  /*
   * Один пост, без кнопок.
   *
   * Раньше здесь уходили два сообщения — карточка с обложкой и отдельный
   * файл трека, — и в канале это выглядело как два поста. Теперь трек идёт
   * одним сообщением вместе со своей обложкой в плеере.
   *
   * Кнопок («Слушать», «MP3», профиль) нет намеренно: нажатие на пост уже
   * даёт прослушивание, а лишние кнопки в ленте только шумят.
   */
  const caption = captionForPost(captionText, payload.audioUrl ? 1024 : undefined);
  const plan = planPost(payload);
  let message: { message_id: number };

  if (plan === "audio") {
    // Обложка не проходит ограничениям Telegram (до 200 КБ и 200×200), и
    // тогда отправка аудио падает целиком. Поэтому пробуем с обложкой, а
    // при отказе — без неё: лучше пост без картинки, чем никакого поста.
    const withCover = await sendTelegramAudio(token, {
      chat_id: chat,
      audio: payload.audioUrl!,
      thumbnail: payload.coverUrl ?? undefined,
      caption,
      parse_mode: "HTML",
      title: payload.beat.title,
      performer: payload.beat.username,
    });

    if (withCover.ok && withCover.result) {
      message = withCover.result;
    } else {
      const bare = await sendTelegramAudio(token, {
        chat_id: chat,
        audio: payload.audioUrl!,
        caption,
        parse_mode: "HTML",
        title: payload.beat.title,
        performer: payload.beat.username,
      });

      if (!bare.ok || !bare.result) {
        return { ok: false, error: bare.description ?? withCover.description ?? "Telegram не принял трек" };
      }

      message = bare.result;
    }
  } else if (plan === "photo") {
    const photo = await sendTelegramPhoto(token, {
      chat_id: chat,
      photo: payload.coverUrl!,
      caption,
      parse_mode: "HTML",
    });

    if (!photo.ok || !photo.result) {
      return { ok: false, error: photo.description ?? "Telegram не принял обложку" };
    }

    message = photo.result;
  } else {
    const plain = await sendTelegramMessage(token, {
      chat_id: chat,
      text: caption,
      parse_mode: "HTML",
    });

    if (!plain.ok || !plain.result) {
      return { ok: false, error: plain.description ?? "Telegram не принял сообщение" };
    }

    message = plain.result;
  }

  return {
    ok: true,
    externalUrl: chatLink(Number(chatId), message.message_id),
    detail: { messages: [message.message_id], chatId },
  };
}

/** Приветственное сообщение с кнопками — для лички и подключения канала. */
export async function sendWelcome(token: string, chatId: string | number, siteUrl: string, name?: string) {
  const keyboard = buildKeyboard({
    beatUrl: siteUrl,
    audioUrl: null,
    profileUrl: null,
  });

  return sendTelegramMessage(token, {
    chat_id: chatId,
    text: [
      "<b>BEATDESK</b>",
      "",
      name ? `Привет, ${name}.` : "Готов публиковать биты.",
      "",
      "Здесь бот выкладывает биты: обложка, темп, тональность, теги, цены и кнопки на прослушивание.",
      "Опубликовать бит можно из BeatDesk в один клик.",
    ].join("\n"),
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
