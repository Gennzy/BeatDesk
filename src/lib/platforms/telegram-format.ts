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
