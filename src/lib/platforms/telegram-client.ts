const API_BASE = "https://api.telegram.org/bot";

export type TelegramMessage = { message_id: number; chat: { id: number; type: string; title?: string; username?: string } };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage };

export type BotInfo = { id: number; username: string; first_name: string };

export function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function isBotConfigured(): boolean {
  return Boolean(getBotToken());
}

type ApiResult<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<ApiResult<T>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(body ?? {})) {
    if (value === undefined || value === null) continue;
    // Байты прикладываем файлом, всё остальное уходит строкой. Раньше
    // байты уходили через String() и превращались в мусор вида "[object Blob]".
    if (value instanceof Uint8Array) {
      form.append(key, new Blob([value as BlobPart]), key);
      continue;
    }

    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }

  const response = await fetch(`${API_BASE}${token}/${method}`, {
    method: "POST",
    body: method === "getMe" || method === "getUpdates" ? undefined : form,
  });

  return (await response.json()) as ApiResult<T>;
}

export async function getBotInfo(token = getBotToken()): Promise<BotInfo | null> {
  if (!token) return null;
  const { ok, result } = await call<BotInfo>(token, "getMe");
  return ok && result ? result : null;
}

/** Однократный опрос апдейтов: находим чаты, где бот уже состоит. */
export async function fetchUpdates(token: string, offset?: number): Promise<TelegramUpdate[]> {
  const url = new URL(`${API_BASE}${token}/getUpdates`);
  url.searchParams.set("timeout", "0");
  url.searchParams.set("limit", "100");
  if (offset !== undefined) url.searchParams.set("offset", String(offset));

  const response = await fetch(url);
  const data = (await response.json()) as ApiResult<TelegramUpdate[]>;
  return data.ok && data.result ? data.result : [];
}

export async function sendTelegramMessage<T = TelegramMessage>(
  token: string,
  payload: {
    chat_id: string | number;
    text: string;
    parse_mode?: "HTML";
    disable_web_page_preview?: boolean;
    reply_markup?: unknown;
  },
): Promise<ApiResult<T>> {
  return call<T>(token, "sendMessage", payload);
}

export async function sendTelegramPhoto<T = TelegramMessage>(
  token: string,
  payload: {
    chat_id: string | number;
    photo: string;
    caption?: string;
    parse_mode?: "HTML";
    reply_markup?: unknown;
  },
): Promise<ApiResult<T>> {
  return call<T>(token, "sendPhoto", payload);
}

export async function sendTelegramAudio<T = TelegramMessage>(
  token: string,
  payload: {
    chat_id: string | number;
    /** Ссылка на файл либо готовые байты. */
    audio: string | Buffer;
    caption?: string;
    parse_mode?: "HTML";
    title?: string;
    performer?: string;
    /**
     * Обложка трека для плеера телеграма.
     *
     * Telegram жёстко ограничивает размер: до 200 КБ и не крупнее
     * 200×200. Если картинка не проходит, отправка аудио падает целиком,
     * поэтому поле всегда необязательное и проверяется на отказе.
     */
    /** Ссылка либо байты: Telegram не берёт обложку крупнее 200 КБ и 200×200. */
    thumbnail?: string | Buffer;
    reply_markup?: unknown;
  },
): Promise<ApiResult<T>> {
  return call<T>(token, "sendAudio", payload);
}
