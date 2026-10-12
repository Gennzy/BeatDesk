import "server-only";

import { getAccessToken } from "./token-store";

/**
 * Загрузка видео на YouTube.
 *
 * Через resumable-протокол, а не одним запросом. Видео — это мегабайты,
 * и YouTube отвергает тело больше нескольких десятков мегабайт; кроме того,
 * соединение рвётся, и одномоментная загрузка начинается заново целиком.
 *
 * Протокол трёхшаговый:
 *   1. POST с заголовком X-Upload-Content-Type — YouTube отвечает адресом
 *      сессии, в который докладываются куски;
 *   2. PUT кусков по 8 МБ с Content-Range;
 *   3. финальный ответ содержит id ролика и ссылку на неё.
 *
 * Куски шлём последовательно, а не параллельно: параллельная запись в
 * одну сессию YouTube не поддерживает, и второй запрос сдвигает смещение,
 * на которое рассчитывал первый.
 */

const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";

/** Размер куска. YouTube требует кратности 256 КБ, кратно этому и берём. */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** Раунд для лимита: видео целиком в память не влезает никогда. */
const PART = 256 * 1024;

export type VideoPrivacy = "private" | "unlisted" | "public";

export type UploadInput = {
  beatId: string;
  title: string;
  description: string;
  tags: string[];
  privacy: VideoPrivacy;
  /** Кадры для превью. YouTube требует JPEG до 2 МБ. */
  thumbnail: Buffer | null;
  /** Видеофайл целиком: Pulse собирает его в браузере. */
  file: Buffer;
};

export type UploadResult = {
  videoId: string;
  url: string;
};

export class YouTubeUploadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "YouTubeUploadError";
  }
}

/** Тело входа в API: ролик и всё, что о нём знает YouTube. */
function uploadBody(input: UploadInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 5000),
      // Категория 10 — музыка. Бит, выложенный в «Развлечениях», находится
      // хуже, и метка попадает в фильтры, по которым ищут «type beat».
      categoryId: "10",
    },
    status: {
      privacyStatus: input.privacy,
      selfDeclaredMadeForKids: false,
    },
  };

  if (input.tags.length > 0) body.snippet = { ...(body.snippet as object), tags: input.tags };

  return body;
}

/** Разбор ответа YouTube. Тело ошибки полезнее кода. */
async function fail(response: Response): Promise<never> {
  const detail = await response.text().catch(() => "");

  let message = detail.slice(0, 300);

  try {
    const parsed = JSON.parse(detail) as {
      error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> };
    };

    // YouTube пишет две разные вещи: error.message указывает на квоту,
    // а errors[0].reason объясняет, что именно не так с самим роликом.
    // Без разбора человек увидит «quotaExceeded» и не поймёт, что делать.
    const reason = parsed.error?.errors?.[0];

    if (reason?.message) {
      message = `${parsed.error?.message ?? "Ошибка YouTube"}: ${reason.message}`;
    } else if (parsed.error?.message) {
      message = parsed.error.message;
    }
  } catch {
    // Тело не JSON: оставляем как есть.
  }

  throw new YouTubeUploadError(message || `YouTube ответил ${response.status}`, response.status);
}

/**
 * Загружает видео.
 *
 * Порядок проверок таков, чтобы отказать до трафика: без токена, без файла,
 * без названия. Иначе YouTube успеет израсходовать квоту, а мы потом
 * скажем «файла нет».
 */
export async function uploadVideo(
  userId: string,
  input: UploadInput,
): Promise<UploadResult> {
  if (!input.file.length) throw new YouTubeUploadError("Пустой видеофайл.");

  if (!input.title.trim()) throw new YouTubeUploadError("Пустое название: YouTube его не примет.");

  const token = await getAccessToken(userId);

  if (!token) {
    throw new YouTubeUploadError("YouTube не подключён. Подключите канал в разделе «Площадки».");
  }

  const start = await fetch(`${UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.file.length >= PART ? "video/*" : "application/octet-stream",
      "X-Upload-Content-Length": String(input.file.length),
    },
    body: JSON.stringify(uploadBody(input)),
  });

  if (!start.ok) await fail(start);

  const session = start.headers.get("location");

  if (!session) {
    throw new YouTubeUploadError("YouTube не вернул адрес загрузки.");
  }

  const total = input.file.length;

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const chunk = input.file.subarray(offset, Math.min(offset + CHUNK_SIZE, total));
    const end = offset + chunk.length - 1;
    const last = end >= total - 1;

    const response = await fetch(session, {
      method: "PUT",
      headers: {
        "Content-Type": "video/*",
        "Content-Range": `bytes ${offset}-${end}/${total}`,
      },
      // Тело — массив целиком, а не поток: YouTube пересчитывает квитанцию
      // по Content-Range, и поток без известной длины его сбивает.
      //
      // Uint8Array, а не Buffer: Buffer — это подтип массива байт для Node,
      // а типы тела запроса знают только про Uint8Array. На проводе разницы
      // нет, отличается только объявление.
      body: new Uint8Array(chunk),
    });

    // Промежуточные ответы приходят пустыми с 308: сервер говорит «принято
    // кусок, жди следующий» статусом, который fetch считает успешным.
    if (response.status === 308) continue;

    if (!response.ok) await fail(response);

    const created = (await response.json()) as {
      id?: string;
      error?: { message?: string };
    };

    if (created.error) {
      throw new YouTubeUploadError(`YouTube: ${created.error.message}`);
    }

    if (!created.id) {
      throw new YouTubeUploadError("YouTube принял видео, но не вернул его номер.");
    }

    if (input.thumbnail) {
      /*
       * Превью ставим после загрузки. Отдельный вызов, потому что ролик в
       * этот момент уже создан, и если обложка не поставится, видео всё
       * равно останется — молча терять ролик из-за обложки нельзя.
       */
      await setThumbnail(token, created.id, input.thumbnail).catch(() => {});
    }

    return {
      videoId: created.id,
      url: `https://www.youtube.com/watch?v=${created.id}`,
    };
  }

  throw new YouTubeUploadError("Загрузка не завершилась: ни один кусок не принят.");
}

/** Ставит обложку ролика. */
async function setThumbnail(accessToken: string, videoId: string, jpeg: Buffer): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
      },
      body: new Uint8Array(jpeg),
    },
  );

  if (!response.ok) await fail(response);
}