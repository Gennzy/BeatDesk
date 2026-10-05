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
 * Обложка идёт **ссылкой**, а не приложенным файлом. Раньше мы ужимали её
 * до 200 КБ и 200×200, потому что столько принимает обложка плеера. Но
 * Telegram молча выбрасывал обложку три раза подряд, и причина была не в
 * размере, а в том, что мы вообще полагались на это поле.
 *
 * В альбоме ограничения другие: до 10 МБ. Ссылку Telegram забирает сам, и
 * картинка показывается всегда — без ужатия, без sharp и без зависимости от
 * того, подхватилась ли нативная библиотека на сервере.
 */
export function buildAlbumMedia(input: {
  audioUrl: string;
  coverUrl: string | null;
  caption: string;
  title: string;
  performer: string;
}): Record<string, unknown>[] {
  const media: Record<string, unknown>[] = [];

  if (input.coverUrl) {
    media.push({
      type: "photo",
      media: input.coverUrl,
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
    caption: input.coverUrl ? undefined : input.caption,
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
): Promise<AlbumResult> {
  const form = new FormData();

  form.append("chat_id", String(chatId));
  form.append("media", JSON.stringify(media));

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
