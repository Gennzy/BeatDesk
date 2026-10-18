import { describe, expect, it } from "vitest";

import { videoIdOf, watchUrlOf } from "./client-upload";

/**
 * Адрес сессии и номер ролика.
 *
 * Номер нужен не только для ссылки: из него считаются просмотры, и без него
 * статистика не узнает, чей это ролик.
 */

const SESSION = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc123XYZ&part=snippet";

describe("номер ролика из адреса сессии", () => {
  it("берётся из upload_id", () => {
    // YouTube называет номер ролика upload_id в адресе сессии и после приёмки
    // последнего куска им уже можно пользоваться: отдельный запрос не нужен.
    expect(videoIdOf(SESSION)).toBe("abc123XYZ");
  });

  it("ссылка собирается из того же номера", () => {
    expect(watchUrlOf(SESSION)).toBe("https://www.youtube.com/watch?v=abc123XYZ");
  });

  it("без номера не выдумывается ссылка", () => {
    // Пустая ссылка в истории выглядела бы как «ролик есть», а на деле
    // номера нет и открывать нечего.
    expect(videoIdOf("https://www.googleapis.com/upload/youtube/v3/videos")).toBe("");
    expect(watchUrlOf("https://www.googleapis.com/upload/youtube/v3/videos")).toBe("");
  });

  it("мусорный адрес не роняет публикацию", () => {
    /*
     * Адрес приходит из ответа YouTube, но разбирать его на уверенности
     * нет. Ролик к этому моменту уже загружен, и падение из-за неразобранного
     * адреса отдало бы человеку ошибку при живом ролике на YouTube.
     */
    expect(videoIdOf("не адрес")).toBe("");
    expect(watchUrlOf("не адрес")).toBe("");
  });
});
