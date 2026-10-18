/**
 * Отправка кусков ролика прямо в YouTube из браузера.
 *
 * Отдельный файл, а не импорт из youtube-upload: тот помечен
 * «server-only» и тянет за собой серверные зависимости, которые в бандл
 * клиента попадать не должны.
 *
 * Здесь нет заголовка авторизации и быть не должно: адрес сессии уже
 * подписан самим YouTube, а токен остаётся на сервере.
 *
 * Порядок строго последовательный. YouTube не поддерживает параллельную
 * запись в одну сессию: второй запрос сдвигает смещение, на которое
 * рассчитывал первый, и ролик не собирается никогда.
 */

export type ClientSession = {
  sessionUrl: string;
  chunkSize: number;
  mimeType: string;
};

export class ClientUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientUploadError";
  }
}

/**
 * Номер ролика по адресу сессии.
 *
 * Идентификатор сессии и есть номер ролика: YouTube называет его upload_id и
 * после приёмки последнего кучка им уже можно пользоваться. Отдельный запрос
 * за номером не нужен.
 *
 * Вынесено отдельно от ссылки, потому что номер нужен не только человеку
 * («открыть ролик»), но и базе: из него потом считаются просмотры, и без него
 * статистика не узнает, чей это ролик.
 */
export function videoIdOf(sessionUrl: string): string {
  try {
    return new URL(sessionUrl).searchParams.get("upload_id") ?? "";
  } catch {
    // Адрес приходит из нашего же ответа YouTube, но разбирать его на
    // уверенности нет: мусорный адрес не должен ронять публикацию после
    // успешной загрузки ролика.
    return "";
  }
}

/** Адрес ролика по адресу сессии. */
export function watchUrlOf(sessionUrl: string): string {
  const id = videoIdOf(sessionUrl);

  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}

export async function sendChunks(
  sessionUrl: string,
  file: Blob,
  chunkSize: number,
  mimeType: string,
  onProgress?: (sent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const total = file.size;

  if (!total) throw new ClientUploadError("Ролик пустой.");

  for (let offset = 0; offset < total; offset += chunkSize) {
    if (signal?.aborted) throw new ClientUploadError("Загрузка отменена.");

    const end = Math.min(offset + chunkSize, total) - 1;

    const response = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Range": `bytes ${offset}-${end}/${total}`,
      },
      // Срез берётся под текущий кусок: держать в памяти весь ролик ради
      // отправки по частям незачем.
      body: await file.slice(offset, end + 1).arrayBuffer(),
      ...(signal ? { signal } : {}),
    });

    /*
     * Промежуточные ответы YouTube пустые, со статусом 308: «принято кусок,
     * жди следующий». Формально это не ошибка, и обычная проверка ok его
     * проглатывает молча — ролик просто перестанет расти.
     */
    if (response.status === 308) {
      onProgress?.(end + 1);
      continue;
    }

    if (!response.ok) {
      throw new ClientUploadError(await explain(response));
    }

    onProgress?.(total);
  }
}

/** Разбор ошибки YouTube: текст полезнее кода. */
async function explain(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");

  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Тело не JSON.
  }

  return `YouTube ответил ${response.status}`;
}