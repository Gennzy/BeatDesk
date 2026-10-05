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
