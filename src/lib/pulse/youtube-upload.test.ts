import { beforeEach, describe, expect, it, vi } from "vitest";

import { startUploadSession, YouTubeUploadError } from "./youtube-upload";

/**
 * Открытие сессии загрузки на YouTube.
 *
 * Проверяется то, что можно испортить тихо: отказ до обращения к YouTube
 * и разбор тела ошибки. Кусок, отправленный не с того смещения, YouTube
 * принимает по формату и отклоняет по существу — ролик не создаётся, и
 * человек видит «загрузка не удалась» без указания, что именно сломано.
 */

vi.mock("./token-store", () => ({
  getAccessToken: vi.fn(async () => "token-123"),
}));

const SESSION = "https://upload.example/session?upload_id=vid123";

const meta = {
  title: "type beat — ZIP | prod. Gennzy",
  description: "описание",
  tags: ["type beat", "trap"],
  privacy: "unlisted" as const,
  // Кратно 256 КБ: YouTube отвергает размеры, которые не кратны.
  size: 8 * 1024 * 1024,
};

function setup(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return response;
    }),
  );

  return calls;
}

function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

describe("сессия загрузки на YouTube", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает адрес сессии, размер куска и тип файла", async () => {
    setup(new Response("", { status: 200, headers: { location: SESSION } }));

    const session = await startUploadSession("user-1", meta);

    expect(session.sessionUrl).toBe(SESSION);
    // Кусок должен быть кратен 256 КБ, иначе YouTube отвергнет всё.
    expect(session.chunkSize % (256 * 1024)).toBe(0);
    expect(session.mimeType).toContain("video/");
  });

  it("открывает сессию с типом файла и его размером", async () => {
    const calls = setup(new Response("", { status: 200, headers: { location: SESSION } }));

    await startUploadSession("user-1", meta);

    const start = calls[0];

    expect(headersOf(start.init)["X-Upload-Content-Type"]).toContain("video/");
    expect(headersOf(start.init)["X-Upload-Content-Length"]).toBe(String(meta.size));
  });

  it("отказывается от пустого названия до обращения к YouTube", async () => {
    setup(new Response("", { status: 200, headers: { location: SESSION } }));

    await expect(startUploadSession("user-1", { ...meta, title: "   " })).rejects.toBeInstanceOf(
      YouTubeUploadError,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("отказывается от нулевого файла", async () => {
    setup(new Response("", { status: 200, headers: { location: SESSION } }));

    await expect(startUploadSession("user-1", { ...meta, size: 0 })).rejects.toBeInstanceOf(
      YouTubeUploadError,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("ловит размер, не кратный 256 КБ, до траты квоты", async () => {
    setup(new Response("", { status: 200, headers: { location: SESSION } }));

    await expect(startUploadSession("user-1", { ...meta, size: 12345 })).rejects.toThrow(/кратен/);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("режет длинное название до лимита YouTube", async () => {
    const calls = setup(new Response("", { status: 200, headers: { location: SESSION } }));

    await startUploadSession("user-1", { ...meta, title: "Ж".repeat(300) });

    const body = JSON.parse(String(calls[0].init.body)) as { snippet: { title: string } };

    expect(body.snippet.title.length).toBeLessThanOrEqual(100);
  });

  it("ставит музыкальную категорию: бит находится по фильтру жанра", async () => {
    const calls = setup(new Response("", { status: 200, headers: { location: SESSION } }));

    await startUploadSession("user-1", meta);

    const body = JSON.parse(String(calls[0].init.body)) as { snippet: { categoryId: string } };

    expect(body.snippet.categoryId).toBe("10");
  });

  it("поясняет ошибку квоты, а не молчит", async () => {
    setup(
      new Response(
        JSON.stringify({
          error: {
            message: "The request cannot be completed because you have exceeded your quota.",
            errors: [{ reason: "uploadLimitExceeded", message: "Daily upload limit reached" }],
          },
        }),
        { status: 403 },
      ),
    );

    // Без разбора тела человек увидит «quotaExceeded» и не поймёт, что делать.
    await expect(startUploadSession("user-1", meta)).rejects.toThrow(/Daily upload limit reached/);
  });

  it("без адреса сессии не идёт дальше", async () => {
    setup(new Response("{}", { status: 200 }));

    await expect(startUploadSession("user-1", meta)).rejects.toThrow(/не вернул адрес загрузки/);
  });
});