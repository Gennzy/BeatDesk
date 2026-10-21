import { describe, expect, it } from "vitest";

import { availableSources, deezerSource, spotifySource, youtubeSource, type Fetcher } from "./platforms";

/**
 * Клиенты площадок.
 *
 * Проверяется разбор ответов: у площадок формат разный, и ошибка в разборе
 * выглядит как «площадка ничего не нашла» — то есть как отсутствие находок.
 */

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

describe("Spotify", () => {
  it("берёт токен и ищет по названию", async () => {
    const calls: string[] = [];

    const fetcher: Fetcher = async (url) => {
      calls.push(url);

      if (url.includes("accounts.spotify.com")) return json({ access_token: "tok", expires_in: 3600 });

      return json({
        tracks: {
          items: [
            {
              id: "track-1",
              name: "Ночной рейс",
              preview_url: "https://p.scdn.co/prev.mp3",
              external_urls: { spotify: "https://open.spotify.com/track/track-1" },
              artists: [{ name: "Артист" }],
            },
          ],
        },
      });
    };

    const source = spotifySource(fetcher, "id", "secret");
    const found = await source.search({ title: "Night Vision", artists: [] });

    expect(found).toHaveLength(1);
    expect(found[0].platform).toBe("spotify");
    expect(found[0].previewUrl).toBe("https://p.scdn.co/prev.mp3");
    expect(found[0].artist).toBe("Артист");
    expect(calls.some((url) => url.includes("accounts.spotify.com"))).toBe(true);
  });

  it("токен берётся один раз на несколько запросов", async () => {
    let tokenCalls = 0;

    const fetcher: Fetcher = async (url) => {
      if (url.includes("accounts.spotify.com")) {
        tokenCalls += 1;
        return json({ access_token: "tok", expires_in: 3600 });
      }

      return json({ tracks: { items: [] } });
    };

    const source = spotifySource(fetcher, "id", "secret");

    await source.search({ title: "a", artists: [] });
    await source.search({ title: "b", artists: [] });

    expect(tokenCalls).toBe(1);
  });

  it("ошибка площадки не выглядит как «ничего не нашли»", async () => {
    const fetcher: Fetcher = async (url) => {
      if (url.includes("accounts.spotify.com")) return json({ access_token: "tok", expires_in: 3600 });
      return json({}, 429);
    };

    const source = spotifySource(fetcher, "id", "secret");

    await expect(source.search({ title: "a", artists: [] })).rejects.toThrow(/Spotify/);
  });
});

describe("Deezer", () => {
  it("читает треки с превью", async () => {
    const fetcher: Fetcher = async () =>
      json({
        data: [
          {
            id: 123,
            title: "Трек",
            link: "https://deezer.com/track/123",
            preview: "https://cdns-preview.dzcdn.net/prev.mp3",
            artist: { name: "Артист" },
          },
        ],
      });

    const found = await deezerSource(fetcher).search({ title: "a", artists: [] });

    expect(found[0].externalId).toBe("123");
    expect(found[0].previewUrl).toBe("https://cdns-preview.dzcdn.net/prev.mp3");
  });

  it("пустой ответ даёт пустой список, а не ошибку", async () => {
    const fetcher: Fetcher = async () => json({});

    expect(await deezerSource(fetcher).search({ title: "a", artists: [] })).toEqual([]);
  });
});

describe("YouTube", () => {
  it("кандидаты без звука: сверять нечем", async () => {
    const fetcher: Fetcher = async () =>
      json({
        items: [{ id: { videoId: "abc" }, snippet: { title: "Треп", channelTitle: "Канал" } }],
      });

    const found = await youtubeSource(fetcher, "key").search({ title: "a", artists: [] });

    expect(found[0].platform).toBe("youtube");
    expect(found[0].previewUrl).toBeNull();
    expect(found[0].url).toContain("watch?v=abc");
  });

  it("видео без идентификатора пропускается", async () => {
    const fetcher: Fetcher = async () => json({ items: [{ id: {}, snippet: { title: "x" } }] });

    expect(await youtubeSource(fetcher, "key").search({ title: "a", artists: [] })).toEqual([]);
  });
});

describe("доступные площадки", () => {
  it("без ключей Spotify и YouTube работает только Deezer", async () => {
    const sources = availableSources(async () => json({}), {});

    expect(sources.map((source) => source.platform)).toEqual(["deezer"]);
  });

  it("с ключами подключаются все", async () => {
    const sources = availableSources(async () => json({}), {
      spotify: "id",
      spotifySecret: "secret",
      youtube: "key",
    });

    expect(sources.map((source) => source.platform)).toEqual(["spotify", "deezer", "youtube"]);
  });
});
