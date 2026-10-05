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
    telegramTags(input.tags, input.artists),
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

/**
 * Что сказать, пока канал не подключён.
 *
 * Номер личного чата не показываем никогда: человек скопирует его в
 * «Площадки» и получит ошибку. Поэтому в личке отвечаем только словами.
 */
export const notConnected = () =>
  [
    "<b>Канал ещё не подключён</b>",
    "",
    "Как подключить:",
    "1. Добавьте бота в канал.",
    "2. Выдайте права администратора с разрешением публиковать сообщения.",
    "3. Нажмите здесь кнопку «Подключить канал» ещё раз.",
    "",
    "Номер придёт сюда, в личку. В сам канал бот ничего не пишет.",
  ].join("\n");

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

/**
 * Подпись поста в пределах лимита Telegram.
 *
 * У фото и аудио лимит 1024 символа, у обычного текста — 4096. Обрезаем
 * по границе строки, чтобы не разорвать половину тега: иначе Telegram
 * отклонит пост из-за кривой разметки.
 */
export function captionForPost(text: string, limit?: number): string {
  if (!limit || text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf("\n");
  const body = lastBreak > limit * 0.5 ? cut.slice(0, lastBreak) : cut;

  // Закрываем неоткрытый тег, иначе разметка останется незавершённой.
  const opened = (body.match(/<b>/g) ?? []).length;
  const closed = (body.match(/<\/b>/g) ?? []).length;

  return body + (opened > closed ? "</b>" : "");
}

/** Как отправить пост: трек с обложкой, одна картинка или просто текст. */
export type PostPlan = "audio" | "photo" | "text";

/**
 * Выбор способа отправки.
 *
 * Раньше карточка бита и сам файл уходили двумя сообщениями, и в канале это
 * читалось как два поста. Теперь трек и его обложка живут в одном сообщении:
 * Telegram показывает обложку прямо в плеере.
 *
 * Приоритет именно аудио, а не фото: обложка без трека — это просто
 * картинка, а трек с обложкой в плеере — это и есть пост о бите.
 */
export function planPost(input: { audioUrl?: string | null; coverUrl?: string | null }): PostPlan {
  if (input.audioUrl) return "audio";
  if (input.coverUrl) return "photo";

  return "text";
}

/**
 * Теги для телеграма.
 *
 * Правила не косметические:
 *
 * - артисты из строки «type beat» в теги не идут — они уже названы выше, а
 *   повтор превращает подпись в свалку имён;
 * - в теге остаются только буквы, цифры и подчёркивание: телеграм обрезает
 *   тег по первому недопустимому символу, и `#tikot.theceo` молча
 *   превращается в `#tikot`;
 * - тег из одной буквы бесполезен и засоряет выдачу.
 */
export function telegramTags(tags: string[], artists: string[] = []): string | null {
  const known = new Set(artists.map((artist) => artist.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));

  const clean = tags
    .map((tag) => tag.trim().replace(/^#/, ""))
    .map((tag) => tag.replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((tag) => tag.length > 1)
    .filter((tag) => !known.has(tag.toLowerCase()))
    .filter((tag, index, all) => all.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index);

  return clean.length > 0 ? clean.map((tag) => `#${escapeHtml(tag)}`).join(" ") : null;
}
