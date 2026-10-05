/**
 * Альбом из обложки и трека одним постом.
 *
 * Нужен как запасной путь: Telegram принимает трек с обложкой, но при
 * негодной картинке молча её выбрасывает — и пост выходит без лица.
 * В альбоме обложка идёт отдельной картинкой, поэтому видна всегда.
 *
 * Собирается вручную, а не через sendMediaGroup: байты обложки Telegram
 * принимает только файлом, а общий клиент передаёт параметры строками.
 */

const API = "https://api.telegram.org/bot";

/**
 * Собрать элементы альбома.
 *
 * В ссылке на приложенный файл обязателен префикс `attach://`. Без него
 * Telegram отвечает «CAN'T PARSE INPUTMEDIA: FIELD "MEDIA" MUST BE OF TYPE
 * STRING» и пост не уходит вовсе — вместе с обложкой, ради которой альбом
 * и затевался.
 */
export function buildAlbumMedia(input: {
  audioUrl: string;
  cover: boolean;
  caption: string;
  title: string;
  performer: string;
}): Record<string, unknown>[] {
  const media: Record<string, unknown>[] = [];

  if (input.cover) {
    media.push({
      type: "photo",
      media: "attach://cover.jpg",
      caption: input.caption,
      parse_mode: "HTML",
    });
  }

  media.push({
    type: "audio",
    media: input.audioUrl,
    title: input.title,
    performer: input.performer,
    // Подпись идёт один раз: без обложки она принадлежит треку.
    caption: input.cover ? undefined : input.caption,
    parse_mode: "HTML",
  });

  return media;
}

export type AlbumItem = Record<string, unknown>;

export type AlbumResult = { ok: true; messages: { message_id: number }[] } | { ok: false; error: string };

/**
 * Собрать и отправить альбом.
 *
 * Имя файла обложки в медиа должно совпадать с именем приложенного файла,
 * иначе Telegram не поймёт, к какому элементу относятся байты.
 */
export async function sendMediaGroupWithCover(
  token: string,
  chatId: string | number,
  media: AlbumItem[],
  cover: Buffer | null,
): Promise<AlbumResult> {
  const form = new FormData();

  form.append("chat_id", String(chatId));
  form.append("media", JSON.stringify(media));

  if (cover) {
    // Прикладываем именно байты: ссылку Telegram на обложку плеера уже
    // отверг, а второй раз повторять ту же ошибку незачем.
    form.append("cover.jpg", new Blob([new Uint8Array(cover)]), "cover.jpg");
  }

  try {
    const response = await fetch(`${API}${token}/sendMediaGroup`, { method: "POST", body: form });
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { message_id: number }[];
      description?: string;
    };

    if (!payload.ok) return { ok: false, error: payload.description ?? "Telegram отклонил альбом" };

    return { ok: true, messages: payload.result ?? [] };
  } catch {
    return { ok: false, error: "Не удалось отправить альбом: нет связи с Telegram" };
  }
}
