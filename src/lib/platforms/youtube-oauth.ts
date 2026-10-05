import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Обмен кода на токен YouTube.
 *
 * Раньше режим `oauth` в проекте не был реализован вовсе: кнопка «Подключить»
 * создавала пустую строку в базе и возвращала «данные подключения не
 * сохранены». Поэтому всё, что нужно для настоящего входа, живёт здесь и
 * проверяется тестами.
 *
 * Google требует client_secret, поэтому код обязателен: без него площадку
 * не подключить. Refresh-токен нужен тоже — он выдаётся только при первом
 * входе, и без него канал перестанет работать через час.
 */

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";

/**
 * Запрашиваемые права.
 *
 * `upload` — публикация роликов. `readonly` — профиль канала, чтобы в
 * интерфейсе было видно, какой канал подключён, а не просто «подключено».
 */
export const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export const scope = () => SCOPES.join(" ");

export function clientId(): string | null {
  return process.env.YOUTUBE_CLIENT_ID?.trim() || null;
}

export function clientSecret(): string | null {
  return process.env.YOUTUBE_CLIENT_SECRET?.trim() || null;
}

export const isConfigured = () => Boolean(clientId() && clientSecret());

/** Куда Google возвращает пользователя. */
export function redirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/platforms/youtube/callback`;
}

export type Tokens = {
  accessToken: string;
  refreshToken: string | null;
  /** Момент, когда токен перестанет работать, в миллисекундах. */
  expiresAt: number;
};

/**
 * Ссылка входа.
 *
 * `state` обязателен: без него чужой человек мог бы подсунуть свой код и
 * привязать к нам свой канал.
 */
export function authorizeUrl(input: { siteUrl: string; state: string }): string {
  const url = new URL(AUTH);

  url.searchParams.set("client_id", clientId() ?? "");
  url.searchParams.set("redirect_uri", redirectUri(input.siteUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope());
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  // Без этого Google молча не выдаёт refresh-токен, и через час канал
  // отвалится без возможности переподключиться.
  url.searchParams.set("prompt", "consent");

  return url.toString();
}

/** Подписать состояние сессией, чтобы подделать его было нельзя. */
export function signState(payload: StateBody, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${body}.${signature(body, secret)}`;
}

export type StatePayload = { userId: string; nonce: string };

type StateBody = StatePayload & { t: number };

/**
 * Проверить состояние.
 *
 * Сверяем подпись, а не сам текст: иначе человек подставил бы чужой код,
 * и канал привязался бы не к тому аккаунту.
 */
export function verifyState(value: string | null | undefined, secret: string, maxAgeMs = 10 * 60_000): StatePayload | null {
  if (!value) return null;

  const [body, mac] = value.split(".");
  if (!body || !mac) return null;

  const expected = signature(body, secret);

  // timingSafeEqual кидает на разной длине, а сравнить надо именно отказом.
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  let payload: StatePayload & { t: number };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString()) as StateBody;
  } catch {
    return null;
  }

  // Возраст читаем из подписанного тела: подпись уже проверена, значит и
  // время подделать нельзя.
  if (!payload.userId || !payload.nonce || !Number.isFinite(payload.t)) return null;

  const age = Date.now() - payload.t;
  // Будущее время тоже отбраковываем: это признак подделки, а не сеанса.
  if (age < 0 || age > maxAgeMs) return null;

  return { userId: payload.userId, nonce: payload.nonce };
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Свежий код и подписанное состояние. */
export function freshState(userId: string, secret: string) {
  // Время кладём в тело: оно подписывается вместе с остальным.
  const body = Buffer.from(
    JSON.stringify({ userId, nonce: randomBytes(16).toString("hex"), t: Date.now() }),
  ).toString("base64url");

  return `${body}.${signature(body, secret)}`;
}

/**
 * Обменять код на токен.
 *
 * `client_secret` в URL — не опечатка: так требует обмен по коду с
 * подтверждением клиента. Секрет уходит только на сервере.
 */
export async function exchangeCode(input: {
  code: string;
  siteUrl: string;
}): Promise<{ tokens: Tokens } | { error: string }> {
  const id = clientId();
  const secret = clientSecret();

  if (!id || !secret) return { error: "YOUTUBE_CLIENT_ID или YOUTUBE_CLIENT_SECRET не заданы" };

  const body = new URLSearchParams({
    code: input.code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri(input.siteUrl),
    grant_type: "authorization_code",
  });

  const result = await postToken(body);
  if ("error" in result) return result;

  const accessToken = result.access_token;
  if (!accessToken) return { error: "Google не вернул access_token" };

  return {
    tokens: {
      accessToken,
      // При повторном входе refresh_token может не прийти: Google отдаёт его
      // только на первом согласии. Тогда старый токен надо сохранить.
      refreshToken: result.refresh_token ?? null,
      expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
    },
  };
}

/** Обновить токен по refresh_token. */
export async function refreshTokens(refreshToken: string): Promise<{ tokens: Tokens } | { error: string }> {
  const id = clientId();
  const secret = clientSecret();

  if (!id || !secret) return { error: "YOUTUBE_CLIENT_ID или YOUTUBE_CLIENT_SECRET не заданы" };

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
    grant_type: "refresh_token",
  });

  const result = await postToken(body);
  if ("error" in result) return result;

  if (!result.access_token) return { error: "Google не вернул новый access_token" };

  return {
    tokens: {
      accessToken: result.access_token,
      refreshToken: result.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
    },
  };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenOk = { access_token: string; refresh_token?: string; expires_in?: number };

async function postToken(body: URLSearchParams): Promise<TokenOk | { error: string }> {
  try {
    const response = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = (await response.json()) as TokenResponse;

    if (!response.ok) {
      // Текст ошибки Google полезнее кода: в нём сказано, что именно не так.
      return { error: data.error_description ?? data.error ?? `Google ответил ${response.status}` };
    }

    if (!data.access_token) return { error: "Google не вернул access_token" };

    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
  } catch {
    return { error: "нет связи с Google" };
  }
}

export type Channel = { id: string; title: string; url: string };

/**
 * Какой канал подключён.
 *
 * Без этого интерфейс пишет «подключено», а человек не знает, куда уйдёт
 * видео. Сайдканал приводит к ошибке 403 при первой же публикации.
 */
export async function channelOf(accessToken: string): Promise<Channel | null> {
  try {
    const url = new URL(`${API}/channels`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "1");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      items?: { id: string; snippet?: { title?: string } }[];
    };

    const item = data.items?.[0];
    if (!item) return null;

    return {
      id: item.id,
      title: item.snippet?.title ?? "YouTube",
      url: `https://www.youtube.com/channel/${item.id}`,
    };
  } catch {
    return null;
  }
}

/**
 * Опубликовать ролик.
 *
 * Видео уходит отдельной загрузкой, а не ссылкой: Google забирает файл
 * целиком, и передать его ссылкой нельзя.
 */
export async function uploadVideo(input: {
  accessToken: string;
  video: Blob;
  title: string;
  description: string;
  tags: string[];
  privacy: "public" | "unlisted" | "private";
  /** Тип-биты обычно выкладывают сразу открытыми. */
}): Promise<{ id: string } | { error: string }> {
  const url = new URL(`${API}/videos`);
  url.searchParams.set("part", "snippet,status");

  const metadata = {
    snippet: {
      title: input.title,
      description: input.description,
      tags: input.tags.slice(0, 30),
      // YouTube отклоняет теги длиннее 30 символов.
      categoryId: "10",
    },
    status: {
      privacyStatus: input.privacy,
      selfDeclaredMadeForKids: false,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": input.video.type || "video/mp4",
      },
      body: JSON.stringify(metadata),
    });

    // Видео приходится отправлять вторым запросом, к resumable-сессии.
    if (response.status === 308) {
      return uploadResumable(input);
    }

    const data = (await response.json()) as { id?: string; error?: { message?: string } };

    if (!response.ok || !data.id) return { error: data.error?.message ?? `YouTube ответил ${response.status}` };

    return { id: data.id };
  } catch {
    return { error: "нет связи с YouTube" };
  }
}

async function uploadResumable(input: {
  accessToken: string;
  video: Blob;
  title: string;
  description: string;
  tags: string[];
  privacy: string;
}): Promise<{ id: string } | { error: string }> {
  try {
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": String(input.video.size),
        "X-Upload-Content-Type": input.video.type || "video/mp4",
      },
      body: JSON.stringify({
        snippet: { title: input.title, description: input.description, tags: input.tags.slice(0, 30), categoryId: "10" },
        status: { privacyStatus: input.privacy, selfDeclaredMadeForKids: false },
      }),
    });

    const session = start.headers.get("location");
    if (!start.ok || !session) return { error: "YouTube не открыл сессию загрузки" };

    const done = await fetch(session, {
      method: "PUT",
      headers: { "Content-Type": input.video.type || "video/mp4" },
      body: await input.video.arrayBuffer(),
    });

    const data = (await done.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };

    if (!done.ok || !data.id) return { error: data.error?.message ?? `загрузка не удалась: ${done.status}` };

    return { id: data.id };
  } catch {
    return { error: "не удалось загрузить видео" };
  }
}
