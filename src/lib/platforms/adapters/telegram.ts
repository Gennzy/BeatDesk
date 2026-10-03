import { SITE_URL } from "@/lib/site";
import {
  fetchUpdates,
  sendTelegramAudio,
  sendTelegramMessage,
  sendTelegramPhoto,
  type TelegramMessage,
} from "../telegram-client";
import { buildKeyboard, formatAudioCaption, formatBeatCaption } from "../telegram-format";
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
  const caption = formatBeatCaption({
    title: payload.beat.title,
    artists: payload.beat.artists,
    bpm: payload.beat.bpm,
    musicalKey: payload.beat.musicalKey,
    tags: payload.beat.tags,
    prices: payload.beat.prices,
    username: payload.beat.username,
  });

  const keyboard = buildKeyboard({
    beatUrl: payload.beatUrl,
    audioUrl: payload.audioUrl,
    profileUrl: payload.beat.username ? `${SITE_URL}/beatmakers/${payload.beat.username}` : null,
  });

  let mainMessage: TelegramMessage | undefined;

  if (payload.coverUrl) {
    const photo = await sendTelegramPhoto(token, {
      chat_id: chat,
      photo: payload.coverUrl,
      caption: caption.slice(0, 1024),
      parse_mode: "HTML",
      reply_markup: keyboard,
    });

    if (!photo.ok || !photo.result) {
      return { ok: false, error: photo.description ?? "Telegram не принял обложку" };
    }

    mainMessage = photo.result;
  } else {
    const message = await sendTelegramMessage(token, {
      chat_id: chat,
      text: caption,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: keyboard,
    });

    if (!message.ok || !message.result) {
      return { ok: false, error: message.description ?? "Telegram не принял сообщение" };
    }

    mainMessage = message.result;
  }

  const sent: number[] = [mainMessage.message_id];

  if (payload.audioUrl) {
    const audio = await sendTelegramAudio(token, {
      chat_id: chat,
      audio: payload.audioUrl,
      caption: formatAudioCaption(payload.beat.title, payload.beat.username),
      parse_mode: "HTML",
      title: payload.beat.title,
      performer: payload.beat.username,
    });

    if (audio.ok && audio.result) sent.push(audio.result.message_id);
  }

  return {
    ok: true,
    externalUrl: chatLink(Number(chatId), mainMessage.message_id),
    detail: { messages: sent, chatId },
  };
}

/** Приветственное сообщение с кнопками — для лички и подключения канала. */
export async function sendWelcome(token: string, chatId: string | number, name?: string) {
  const keyboard = buildKeyboard({
    beatUrl: SITE_URL,
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
