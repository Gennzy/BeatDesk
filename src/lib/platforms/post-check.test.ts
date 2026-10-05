import { describe, expect, it } from "vitest";

import { coverApplied, inspectPost, titleApplied } from "./post-check";
import type { TelegramMessage } from "./telegram-client";

const message = (over: Partial<TelegramMessage["audio"]> | null): TelegramMessage => ({
  message_id: 1,
  chat: { id: -100, type: "channel" },
  audio: over === null ? undefined : { file_id: "a", ...over },
});

describe("обложка дошла или нет", () => {
  it("обложка в ответе — дошла", () => {
    expect(coverApplied(message({ thumbnail: { file_id: "t", file_unique_id: "u" } }))).toBe(true);
  });

  it("нет обложки — Telegram её выкинул, даже если ответ успешный", () => {
    // Ровно тот случай: ok: true, а поста с картинкой нет.
    expect(coverApplied(message({}))).toBe(false);
    expect(coverApplied(message(null))).toBe(false);
    expect(coverApplied(undefined)).toBe(false);
  });
});

describe("название в плеере", () => {
  it("совпало с названием бита", () => {
    expect(titleApplied(message({ title: "GET MONEY" }), "GET MONEY")).toBe(true);
  });

  it("регистр и лишние пробелы не мешают", () => {
    expect(titleApplied(message({ title: "  get money " }), "GET MONEY")).toBe(true);
  });

  it("имя файла из хранилища названием не считается", () => {
    const wrong = message({ title: "mp3-Get_Money_-_166_BPM_-_A#_Minor_Tag.mp3" });

    expect(titleApplied(wrong, "GET MONEY")).toBe(false);
  });

  it("пустое название — тоже не совпало", () => {
    expect(titleApplied(message({}), "GET MONEY")).toBe(false);
  });
});

describe("что делать с принятым постом", () => {
  it("всё на месте — пост не трогаем", () => {
    expect(inspectPost(message({ thumbnail: { file_id: "t", file_unique_id: "u" }, title: "GET MONEY" }), "GET MONEY")).toBe("done");
  });

  it("обложка есть, название чужое", () => {
    expect(inspectPost(message({ thumbnail: { file_id: "t", file_unique_id: "u" }, title: "x.mp3" }), "GET MONEY")).toBe("cover");
  });

  it("обложки нет — возвращаем её альбомом", () => {
    expect(inspectPost(message({}), "GET MONEY")).toBe("coverAndTitle");
  });

  it("ответ без аудио тоже считаем сломанным", () => {
    expect(inspectPost({ message_id: 1, chat: { id: -100, type: "channel" } }, "GET MONEY")).toBe("coverAndTitle");
  });
});

describe("альбом, когда обложку выкинули", () => {
  it("ссылка на приложенный файл с префиксом attach", async () => {
    // Без "attach://" Telegram отвергает весь альбом, и пост не уходит.
    const { buildAlbumMedia } = await import("./album");
    const [photo] = buildAlbumMedia({
      audioUrl: "https://a/beat.mp3",
      cover: true,
      caption: "текст",
      title: "GET MONEY",
      performer: "gennzy",
    });

    expect(photo.media).toBe("attach://cover.jpg");
    expect(photo.type).toBe("photo");
  });

  it("обложка и трек — два элемента одного поста", async () => {
    const { buildAlbumMedia } = await import("./album");
    const media = buildAlbumMedia({ audioUrl: "https://a/beat.mp3", cover: true, caption: "т", title: "M", performer: "g" });

    expect(media).toHaveLength(2);
    expect(media[1]).toMatchObject({ type: "audio", media: "https://a/beat.mp3", title: "M" });
    // Подпись не дублируется на обоих элементах.
    expect(media[1].caption).toBeUndefined();
  });

  it("без обложки остаётся один трек с подписью", async () => {
    const { buildAlbumMedia } = await import("./album");
    const media = buildAlbumMedia({ audioUrl: "https://a/beat.mp3", cover: false, caption: "т", title: "M", performer: "g" });

    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ type: "audio", caption: "т" });
  });
});
