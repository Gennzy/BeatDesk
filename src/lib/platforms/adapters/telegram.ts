import {
  deleteTelegramMessage,
  fetchUpdates,
  sendTelegramAudio,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "../telegram-client";
import { buildKeyboard, captionForPost, formatBeatCaption, planPost } from "../telegram-format";
import { inspectPost } from "../post-check";
import { sendMediaGroupWithCover } from "../album";
import { telegramThumbnail } from "../thumbnail";
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
    // Обложку приводим к размеру, который Telegram принимает: исходная
    // почти всегда не влезает, и пост уходил совсем без картинки.
    const thumbnail = payload.coverUrl ? await telegramThumbnail(await fetchImage(payload.coverUrl)) : null;

    /*
     * Telegram отвечает «принято», даже если обложку выкинул.
     *
     * Раньше мы судили только по флагу успеха, запасной путь не запускался,
     * и в канал уезжал пост без картинки. Теперь смотрим, что реально
     * вернулось в ответе, и если картинки нет — добиваем её альбомом.
     */
    const attempt = await sendTelegramAudio(token, {
      chat_id: chat,
      audio: payload.audioUrl!,
      thumbnail: thumbnail ?? undefined,
      caption,
      parse_mode: "HTML",
      title: payload.beat.title,
      performer: payload.beat.username,
    });

    if (!attempt.ok || !attempt.result) {
      const bare = await sendTelegramAudio(token, {
        chat_id: chat,
        audio: payload.audioUrl!,
        caption,
        parse_mode: "HTML",
        title: payload.beat.title,
        performer: payload.beat.username,
      });

      if (!bare.ok || !bare.result) {
        return { ok: false, error: bare.description ?? attempt.description ?? "Telegram не принял трек" };
      }

      message = bare.result;
    } else {
      message = attempt.result;

      const state = inspectPost(attempt.result, payload.beat.title);
      if (state !== "done") {
        // Плохой пост не оставляем в канале: удаляем и пересобираем
        // альбомом, где картинку Telegram показать не может.
        await deleteTelegramMessage(token, chat, message.message_id);

        const album = await sendBeatAlbum(token, {
          chat,
          audioUrl: payload.audioUrl!,
          cover: thumbnail,
          caption,
          title: payload.beat.title,
          performer: payload.beat.username,
        });

        if (!album.ok) return { ok: false, error: album.error };
        message = { message_id: album.messageId };
      }
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

/**
 * Скачать обложку для пережатия.
 *
 * Telegram просит обложку не больше 200 КБ, поэтому передать её ссылкой
 * нельзя: пришлось бы подгонять размер на стороне площадки.
 */
async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);

    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * Пересобрать пост альбомом: обложка и трек в одном сообщении.
 *
 * Запасной путь для случая, когда Telegram принял трек, но обложку
 * выбросил. Отдельные сообщения тут не годились бы — это снова два поста.
 */
async function sendBeatAlbum(
  token: string,
  input: {
    chat: string;
    audioUrl: string;
    cover: Buffer | null;
    caption: string;
    title: string;
    performer: string;
  },
): Promise<{ ok: true; messageId: number } | { ok: false; error: string }> {
  const media: Record<string, unknown>[] = [];

  if (input.cover) {
    media.push({
      type: "photo",
      media: { attach: "cover.jpg" },
      caption: input.caption,
      parse_mode: "HTML",
    });
  }

  media.push({
    type: "audio",
    media: input.audioUrl,
    title: input.title,
    performer: input.performer,
    caption: input.cover ? undefined : input.caption,
    parse_mode: "HTML",
  });

  // Байты обложки Telegram ждёт файлом, а не строкой, поэтому прикладываем
  // их отдельным полем с тем же именем.
  const group = await sendMediaGroupWithCover(token, input.chat, media, input.cover);

  if (!group.ok) return { ok: false, error: group.error ?? "Telegram не принял альбом" };

  const first = group.messages[0];

  return { ok: true, messageId: first?.message_id ?? 0 };
}
