import "server-only";

import { getAccessToken } from "./token-store";

/**
 * Загрузка видео на YouTube.
 *
 * Через resumable-протокол, и не через наш сервер.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ БРАУЗЕР УХОДИТ В YOUTUBE САМ
 *
 * Файл нельзя протащить через сервер приложения: трёхминутный ролик весит
 * больше ста мегабайт, а приём тела запроса у платформы ограничен четырьмя
 * с половиной мегабайтами. Проверено: шесть секунд видео — 178 КБ, три
 * минуты — около 135 МБ, это тридцать лимитов.
 *
 * Сервер, который принял бы файл, был бы нужен только чтобы переслать его
 * дальше, и именно на нём всё бы и сломалось: тело в памяти, лимит на
 * размер, таймаут на передачу.
 *
 * Поэтому сервер делает только то, что может: получает токен, отправляет
 * YouTube метаданные с размером файла и возвращает одноразовый адрес
 * сессии. Дальше куски летят из браузера прямо в YouTube.
 *
 * Токен при этом не покидает сервер ни разу. Адрес сессии — не полномочие:
 * им нельзя открыть чужой канал, им можно только дослать ролик в ту
 * загрузку, которая уже начата.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ИМЕННО RESUMABLE
 *
 * Одноразовая отправка не переживает обрыв связи: ролик пришлось бы
 * начинать заново. Куски по 8 МБ с Content-Range повторяются по одному.
 */

const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";

/**
 * Размер кучка.
 *
 * YouTube требует кратности 256 КБ, кратно этому и берём. Кусок меньше
 * 8 МБ переживает обрыв связи: при переподключении повторяется только он,
 * а не весь ролик.
 */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** Раунд для лимита: видео целиком в память не влезает никогда. */

/** MIME-типы по убыванию предпочтения — те же, что и при сборке видео. */
const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  "video/webm",
];

/** MIME-тип, которым подписывается ролик. */
export function videoMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/mp4";

  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/mp4";
}

export type VideoPrivacy = "private" | "unlisted" | "public";

export type UploadMeta = {
  title: string;
  description: string;
  tags: string[];
  privacy: VideoPrivacy;
  /** Размер файла в байтах: YouTube требует его при открытии сессии. */
  size: number;
};

export type UploadSession = {
  /** Одноразовый адрес загрузки. Токена в нём нет. */
  sessionUrl: string;
  chunkSize: number;
  mimeType: string;
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
function uploadBody(meta: UploadMeta): Record<string, unknown> {
  return {
    snippet: {
      title: meta.title.slice(0, 100),
      description: meta.description.slice(0, 5000),
      // Категория 10 — музыка. Бит, выложенный в «Развлечениях», находится
      // хуже, и метка попадает в фильтры, по которым ищут «type beat».
      categoryId: "10",
      ...(meta.tags.length > 0 ? { tags: meta.tags } : {}),
    },
    status: {
      privacyStatus: meta.privacy,
      selfDeclaredMadeForKids: false,
    },
  };
}

/** Разбор ответа YouTube. Тело ошибки полезнее кода. */
async function fail(response: Response): Promise<never> {
  const detail = await response.text().catch(() => "");
  let message = detail.slice(0, 300);

  try {
    const parsed = JSON.parse(detail) as {
      error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> };
    };

    /*
     * YouTube пишет две разные вещи: error.message указывает на квоту,
     * а errors[0].reason объясняет, что не так с самим роликом. Без разбора
     * человек увидит «quotaExceeded» и не поймёт, что делать.
     */
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
 * Открывает сессию загрузки.
 *
 * Отказ�� идут до обращения к YouTube: пустое название или нулевой файл
 * отклоняются здесь, иначе сессия была бы открыта впустую.
 */
export async function startUploadSession(userId: string, meta: UploadMeta): Promise<UploadSession> {
  if (!meta.title.trim()) throw new YouTubeUploadError("Пустое название: YouTube его не примет.");

  if (!meta.size || !Number.isFinite(meta.size) || meta.size <= 0) {
    /*
     * Проверяется только «файл есть», а не кратность 256 КБ: кратной должна
     * быть только нарезка кусков (кроме последнего), а не общий размер.
     * Раньше здесь требовали кратности от всего файла, и отрендеренный
     * ролик, чей размер почти никогда не делится нацело, отклонялся до
     * YouTube — загрузка не работала вообще никогда.
     */
    throw new YouTubeUploadError("Ролик пустой.");
  }

  const token = await getAccessToken(userId);

  if (!token) {
    throw new YouTubeUploadError("YouTube не подключён. Подключите канал в разделе «Площадки».");
  }

  const type = videoMimeType();

  const response = await fetch(`${UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type,
      "X-Upload-Content-Length": String(meta.size),
    },
    body: JSON.stringify(uploadBody(meta)),
  });

  if (!response.ok) await fail(response);

  const sessionUrl = response.headers.get("location");

  if (!sessionUrl) throw new YouTubeUploadError("YouTube не вернул адрес загрузки.");

  return { sessionUrl, chunkSize: CHUNK_SIZE, mimeType: type };
}

/** Ставит обложку ролика. */
export async function setThumbnail(userId: string, videoId: string, jpeg: Blob): Promise<void> {
  const token = await getAccessToken(userId);

  if (!token) throw new YouTubeUploadError("Сессия YouTube недоступна.");

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
      },
      body: new Uint8Array(await jpeg.arrayBuffer()),
    },
  );

  if (!response.ok) await fail(response);
}