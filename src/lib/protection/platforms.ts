import "server-only";

import type { Query, Source } from "./sources";

/**
 * Клиенты музыкальных площадок.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ЗДЕСЬ, А НЕ В БРАУЗЕРЕ
 *
 * Ключи площадок — наши, и они не должны попадать в браузер. Битмейкер не
 * вставляет ничего: он покупает услугу и получает отчёт.
 *
 * ---------------------------------------------------------------------------
 * ГДЕ ЗВУК, А ГДЕ НЕТ
 *
 * Spotify и Deezer отдают публичное превью — тридцать секунд MP3 по прямой
 * ссылке. По нему и сверяется бит.
 *
 * YouTube звука не отдаёт: там остаются только кандидаты по названию, и в
 * отчёте они помечены как непроверенные. Называть их находками было бы
 * враньём — сверять нечем.
 */

/** Как ходим в интернет: подменяется в тестах. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Токен Spotify живёт недолго, и каждому запросу его брать заново — расточительно. */
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const DEEZER_API = "https://api.deezer.com";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

/**
 * Spotify.
 *
 * Доступ по client credentials: никаких прав, никаких пользователей, только
 * поиск. Своего аккаунта слушателя мы не просим.
 */
export function spotifySource(fetcher: Fetcher, clientId: string, clientSecret: string): Source {
  let token: { value: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.until > Date.now()) return token.value;

    const response = await fetcher(SPOTIFY_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) throw new Error(`Spotify не дал токен: ${response.status}`);

    const data = (await response.json()) as { access_token?: string; expires_in?: number };

    if (!data.access_token) throw new Error("Spotify не вернул токен");

    token = { value: data.access_token, until: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000 };

    return token.value;
  }

  return {
    platform: "spotify",
    search: async (query: Query) => {
      const key = await accessToken();
      const limit = query.limit ?? 20;
      const url = `${SPOTIFY_API}/search?type=track&limit=${limit}&q=${encodeURIComponent(query.title)}`;

      const response = await fetcher(url, { headers: { Authorization: `Bearer ${key}` } });

      if (!response.ok) throw new Error(`Spotify не ответил: ${response.status}`);

      const data = (await response.json()) as {
        tracks?: { items?: { id: string; name: string; preview_url?: string | null; external_urls?: { spotify?: string }; artists?: { name: string }[] }[] };
      };

      return (data.tracks?.items ?? []).map((track) => ({
        platform: "spotify",
        externalId: track.id,
        title: track.name,
        artist: track.artists?.[0]?.name ?? "",
        previewUrl: track.preview_url ?? null,
        url: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
      }));
    },
  };
}

/**
 * Deezer.
 *
 * Ключей не нужно вообще: поиск открыт. Превью тоже публичные.
 */
export function deezerSource(fetcher: Fetcher): Source {
  return {
    platform: "deezer",
    search: async (query: Query) => {
      const limit = query.limit ?? 20;
      const url = `${DEEZER_API}/search?q=${encodeURIComponent(query.title)}&limit=${limit}`;

      const response = await fetcher(url);

      if (!response.ok) throw new Error(`Deezer не ответил: ${response.status}`);

      const data = (await response.json()) as {
        data?: { id: number; title: string; link: string; preview?: string; artist?: { name: string } }[];
      };

      return (data.data ?? []).map((track) => ({
        platform: "deezer",
        externalId: String(track.id),
        title: track.title,
        artist: track.artist?.name ?? "",
        previewUrl: track.preview ?? null,
        url: track.link,
      }));
    },
  };
}

/**
 * YouTube.
 *
 * Звука нет: API отдаёт только метаданные. Кандидаты по названию остаются
 * полезными — по названию видно, что трек называется «X type beat», — но
 * находкой их называть нельзя.
 */
export function youtubeSource(fetcher: Fetcher, apiKey: string): Source {
  return {
    platform: "youtube",
    search: async (query: Query) => {
      const limit = query.limit ?? 20;
      const url = `${YOUTUBE_API}/search?part=snippet&type=video&videoCategory=music&maxResults=${limit}&q=${encodeURIComponent(query.title)}&key=${apiKey}`;

      const response = await fetcher(url);

      if (!response.ok) throw new Error(`YouTube не ответил: ${response.status}`);

      const data = (await response.json()) as {
        items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
      };

      return (data.items ?? [])
        .filter((item): item is { id: { videoId: string }; snippet: { title?: string; channelTitle?: string } } =>
          Boolean(item.id?.videoId),
        )
        .map((item) => ({
          platform: "youtube",
          externalId: item.id.videoId,
          title: item.snippet?.title ?? "",
          artist: item.snippet?.channelTitle ?? "",
          previewUrl: null,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        }));
    },
  };
}

/**
 * Площадки, которыми площадка может пользоваться.
 *
 * Пустые ключи площадку отключают, а не ломают: отсутствие доступа к
 * Spotify не должно ронять весь поиск.
 */
export function availableSources(fetcher: Fetcher, keys: { spotify?: string; spotifySecret?: string; deezer?: boolean; youtube?: string }): Source[] {
  const sources: Source[] = [];

  if (keys.spotify && keys.spotifySecret) {
    sources.push(spotifySource(fetcher, keys.spotify, keys.spotifySecret));
  }

  if (keys.deezer !== false) {
    sources.push(deezerSource(fetcher));
  }

  if (keys.youtube) {
    sources.push(youtubeSource(fetcher, keys.youtube));
  }

  return sources;
}
