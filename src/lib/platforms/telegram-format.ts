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
 * Какого рода чат прислал апдейт.
 *
 * В личке номер принадлежит человеку, а не каналу: вставить его в «Площадки»
 * нельзя, и человек получает ошибку без объяснения. Поэтому вид чата
 * определяется явно и попадает в ответ.
 */
export type ChatKind = "личный чат" | "канал" | "группа";

export function chatKind(chat: { type?: string } | undefined): ChatKind {
  if (chat?.type === "channel") return "канал";
  if (chat?.type === "group" || chat?.type === "supergroup") return "группа";

  return "личный чат";
}

/** Пора объяснить, что для канала нужен админ, а не только личный ID. */
export const needsChannelAdmin =
  "В личке это твой личный номер — в «Площадки» его вставлять нельзя.\n\n" +
  "Чтобы получить ID канала: добавь бота в канал и выдай права администратора с разрешением публиковать. " +
  "Потом напиши в канале «айди» или нажми «Подключить канал» — бот отправит номер канала.";

/**
 * Карточка с ID канала.
 *
 * Номер личного чата не показываем никогда: человек не дочитает объяснение
 * и скопирует свой ID в «Площадки». В личке отвечаем только словами, а сам
 * номер отдаём лишь в канале, где он и нужен.
 *
 * ID оборачивается в моноширинный блок: в Телеграме его нужно выделить и
 * скопировать, а обычный текст копируется вместе с переносами строк.
 */
export function formatIdCard(input: { id: number; title?: string; username?: string; kind: ChatKind }): string {
  if (input.kind === "личный чат") {
    return [
      "<b>Это личный чат</b>",
      "",
      "Номер канала в личке не отдаю: люди копируют его по привычке и получают ошибку.",
      "",
      "Чтобы подключить канал, добавьте бота в канал и выдайте права администратора с разрешением публиковать. " +
        "Потом нажмите в канале кнопку «Подключить канал» — бот пришлёт номер сам.",
    ].join("\n");
  }

  const where = [
    input.title ? `канал: ${escapeHtml(input.title)}` : null,
    input.username ? `@${escapeHtml(input.username)}` : null,
  ].filter(Boolean);

  return [
    where.length > 0 ? `<b>${where.join(" · ")}</b>` : `<b>${input.kind}</b>`,
    "",
    "ID канала:",
    `<code>${input.id}</code>`,
    "",
    "Вставьте его в разделе «Площадки» на сайте — и посты будут приходить сюда.",
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
