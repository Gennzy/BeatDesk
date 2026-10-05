import { formatMoney } from "@/lib/currency";
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Подпись поста: заголовок, type beat, темп и тональность, теги, цены. */
export function formatBeatCaption(input: {
  title: string;
  artists: string[];
  bpm: number;
  musicalKey: string;
  tags: string[];
  prices: { mp3: number | null; bundle: number | null; exclusive: number | null };
  currency?: string;
  username: string;
}): string {
  const typeBeat = input.artists.length > 0 ? `type beat ${input.artists.join(", ")}` : "instrumental";

  const prices = [
    input.prices.mp3 ? `MP3 ${formatMoney(input.prices.mp3, input.currency)}` : null,
    input.prices.bundle ? `MP3+WAV ${formatMoney(input.prices.bundle, input.currency)}` : null,
    input.prices.exclusive ? `эксклюзив ${formatMoney(input.prices.exclusive, input.currency)}` : null,
  ].filter(Boolean) as string[];

  return [
    `<b>${escapeHtml(input.title.toUpperCase())}</b>`,
    `<i>${escapeHtml(typeBeat)}</i>`,
    "",
    `<code>${input.bpm} BPM · ${escapeHtml(input.musicalKey)}</code>`,
    prices.length > 0 ? "" : null,
    prices.length > 0 ? escapeHtml(prices.join("  ·  ")) : null,
    input.tags.length > 0 ? "" : null,
    input.tags.length > 0 ? input.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ") : null,
    "",
    `by @${escapeHtml(input.username)}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Подпись к аудиофайлу, который бот кладёт под постом. */
export function formatAudioCaption(title: string, username: string): string {
  return `<b>${escapeHtml(title)}</b> · @${escapeHtml(username)}`;
}

export type TelegramButton = {
  text: string;
  url: string;
};

export type InlineKeyboard = { inline_keyboard: TelegramButton[][] };

/** Кнопки под постом: слушать, скачать, профиль. */
export function buildKeyboard(input: { beatUrl: string; audioUrl: string | null; profileUrl: string | null }): InlineKeyboard {
  const firstRow: TelegramButton[] = [{ text: "▶ Слушать", url: input.beatUrl }];
  if (input.audioUrl) {
    firstRow.push({ text: "⬇ MP3", url: input.audioUrl });
  }

  const rows: TelegramButton[][] = [firstRow];

  if (input.profileUrl) {
    rows.push([{ text: "Профиль битмейкера", url: input.profileUrl }]);
  }

  return { inline_keyboard: rows };
}

/** Меню бота в личке: кнопки вместо команд. */
export function buildStartMenu(buttons: { text: string; url?: string; callback?: string }[]): InlineKeyboard {
  const rows: TelegramButton[][] = [];

  for (const button of buttons) {
    rows.push([button.url ? { text: button.text, url: button.url } : { text: button.text, url: "https://t.me/beatdesk_bot" }]);
  }

  return { inline_keyboard: rows };
}

/**
 * Карточка с ID чата.
 *
 * Страница площадок просит вписать ID вручную, и человек вынужден угадывать
 * его. Раз бот всё равно знает этот номер, отдать его проще, чем заставлять
 * копировать из другого приложения.
 *
 * ID оборачивается в моноширинный блок: в Телеграме его нужно выделить и
 * скопировать, а обычный текст копируется вместе с переносами строк.
 */
export function formatIdCard(input: { id: number; title?: string; username?: string }): string {
  const where = [
    input.title ? `канал: ${escapeHtml(input.title)}` : null,
    input.username ? `@${escapeHtml(input.username)}` : null,
  ].filter(Boolean);

  return [
    where.length > 0 ? `<b>${where.join(" · ")}</b>` : "<b>Это личный чат</b>",
    "",
    "Твой ID канала:",
    `<code>${input.id}</code>`,
    "",
    "Вставь его в разделе «Площадки» на сайте — и посты будут приходить сюда.",
  ].join("\n");
}

/**
 * Просят ли ID канала.
 *
 * Страница площадок говорит «напиши боту — он подскажет ID», а не «введи
 * команду /id». Человек пишет «айди», «ID», «айди?» или «айдишник» — и
 * раньше получал тишину, потому что бот ждал ровно «/id».
 *
 * Поэтому сравниваем по смыслу: убираем ведущую косую черту и хвост вида
 * `@beatdesk_bot`, который Телеграм добавляет в группах.
 */
export function wantsId(text: string | undefined | null): boolean {
  if (!text) return false;

  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/^\//, "")
    .replace(/@[a-z0-9_]+$/, "")
    .replace(/[?!.,]+$/, "")
    .trim();

  return /^(id|айди|ид|айдишник|айдишник?ка|channelid|channel id)$/.test(cleaned);
}
