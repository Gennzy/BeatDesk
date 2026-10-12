import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHUNK_SIZE, uploadVideo, YouTubeUploadError } from "./youtube-upload";

/**
 * Загрузка видео на YouTube.
 *
 * Проверяется протокол, а не вёрстка. Кусок, отправленный не с того
 * смещения, YouTube принимает по формату и отвергает по существу: ролик не
 * создаётся, а человек видит «загрузка не удалась» без указания, что
 * именно сломалось.
 */

// Мок поднимается до импорта модуля. Динамический импорт с resetModules
// здесь не годится: он создаёт второй экземпляр YouTubeUploadError, и
// проверка «это тот же класс» падает на ровном месте.
vi.mock("./token-store", () => ({
  getAccessToken: vi.fn(async () => "token-123"),
}));

const SESSION = "https://upload.example/session";

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/** Раскладывает входящий запрос на то, что интересует проверку. */
function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

function setup(startInit: ResponseInit = {}) {
  const calls: Call[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });

      if (String(url).includes("uploadType=resumable")) {
        return new Response("", { status: 200, headers: { location: SESSION }, ...startInit });
      }

      /*
       * Куски, кроме последнего, YouTube подтверждает статусом 308.
       *
       * Последний определяется по концу диапазона, а не по тому, кончается
       * ли строка на /total: этим заканчивается КАЖДЫЙ Content-Range, и
       * такая проверка считала первый кусок последним — тест проходил, не
       * проверив ни одной разбивки.
       */
      const range = headersOf(init)["Content-Range"] ?? "";
      const [, from = "0", to = "0", total = "0"] = range.match(/bytes (\d+)-(\d+)\/(\d+)/) ?? [];

      const last = Number(to) === Number(total) - 1;

      if (!last) {
        return new Response("", { status: 308 });
      }

      void from;

      return jsonResponse({ id: "vid123" });
    }),
  );

  return calls;
}

const video = (overrides: Partial<Parameters<typeof uploadVideo>[1]> = {}) => ({
  beatId: "b1",
  title: "type beat — ZIP | prod. Gennzy",
  description: "описание",
  tags: ["type beat", "trap"],
  privacy: "unlisted" as const,
  thumbnail: null,
  file: Buffer.alloc(1024),
  ...overrides,
});

describe("загрузка видео на YouTube", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("разбивает файл на куски и ведёт смещение без разрывов", async () => {
    const calls = setup();

    const file = Buffer.alloc(CHUNK_SIZE + 1024);

    await uploadVideo("user-1", video({ file }));

    const ranges = calls
      .map((call) => headersOf(call.init)["Content-Range"])
      .filter((range): range is string => Boolean(range));

    expect(ranges[0]).toBe(`bytes 0-${CHUNK_SIZE - 1}/${file.length}`);
    expect(ranges[1]).toBe(`bytes ${CHUNK_SIZE}-${file.length - 1}/${file.length}`);
    expect(ranges).toHaveLength(2);
  });

  it("возвращает номер ролика и ссылку на него", async () => {
    setup();

    const result = await uploadVideo("user-1", video());

    expect(result.videoId).toBe("vid123");
    expect(result.url).toBe("https://www.youtube.com/watch?v=vid123");
  });

  it("отказывается от пустого файла до обращения к YouTube", async () => {
    setup();

    await expect(uploadVideo("user-1", video({ file: Buffer.alloc(0) }))).rejects.toBeInstanceOf(
      YouTubeUploadError,
    );

    // Квота не должна тратиться на заведомо обречённую загрузку.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("отказывается от пустого названия", async () => {
    setup();

    await expect(uploadVideo("user-1", video({ title: "   " }))).rejects.toBeInstanceOf(
      YouTubeUploadError,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("режет длинное название до лимита YouTube", async () => {
    const calls = setup();

    await uploadVideo("user-1", video({ title: "Ж".repeat(300) }));

    const start = calls[0];
    const body = JSON.parse(String(start.init.body)) as { snippet: { title: string } };

    expect(body.snippet.title.length).toBeLessThanOrEqual(100);
  });

  it("ставит музыкальную категорию: бит находится по фильтру жанра", async () => {
    const calls = setup();

    await uploadVideo("user-1", video());

    const body = JSON.parse(String(calls[0].init.body)) as { snippet: { categoryId: string } };

    expect(body.snippet.categoryId).toBe("10");
  });

  it("поясняет ошибку квоты, а не молчит", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              message: "The request cannot be completed because you have exceeded your quota.",
              errors: [{ reason: "uploadLimitExceeded", message: "Daily upload limit reached" }],
            },
          },
          { status: 403 },
        ),
      ),
    );

    // Без разбора тела ошибки человек увидит «quotaExceeded» и не поймёт,
    // что делать: истекла квота или ролик плохой.
    await expect(uploadVideo("user-1", video())).rejects.toThrow(/Daily upload limit reached/);
  });

  it("ошибка без сессии загрузки не проходит молча", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );

    await expect(uploadVideo("user-1", video())).rejects.toThrow(/не вернул адрес загрузки/);
  });
});