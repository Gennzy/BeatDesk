import { describe, expect, it } from "vitest";

import { youtubeEmbedUrl, youtubeIdOf, youtubeWatchUrl } from "./video";

/**
 * Ролик на YouTube.
 *
 * Разбор ссылки — чистая функция, и она обязана быть точной: номер ролика
 * определяет, что именно покажет плеер, а ошибка здесь выглядит как «видео
 * не грузится» без всякой причины.
 */

describe("номер ролика из ссылки", () => {
  it("берётся из обычной ссылки", () => {
    expect(youtubeIdOf("https://www.youtube.com/watch?v=abc123XYZ89")).toBe("abc123XYZ89");
  });

  it("берётся из короткой ссылки", () => {
    expect(youtubeIdOf("https://youtu.be/abc123XYZ89")).toBe("abc123XYZ89");
  });

  it("берётся из ссылки на встраивание", () => {
    expect(youtubeIdOf("https://www.youtube.com/embed/abc123XYZ89")).toBe("abc123XYZ89");
  });

  it("принимается голый номер", () => {
    expect(youtubeIdOf("abc123XYZ89")).toBe("abc123XYZ89");
  });

  it("не путается с другим параметром", () => {
    // В ссылке полно посторонних параметров, и v среди них не первый.
    expect(youtubeIdOf("https://www.youtube.com/watch?t=30&list=PL123&v=abc123XYZ89")).toBe("abc123XYZ89");
  });

  it("мусор не превращается в номер", () => {
    expect(youtubeIdOf("https://example.com/video")).toBeNull();
    expect(youtubeIdOf("")).toBeNull();
    expect(youtubeIdOf(null)).toBeNull();
    expect(youtubeIdOf(undefined)).toBeNull();
    expect(youtubeIdOf("   ")).toBeNull();
  });
});

describe("адрес для встраивания", () => {
  it("идёт через nocookie, чтобы не ставить cookie без спроса", () => {
    const url = youtubeEmbedUrl("abc123XYZ89");

    expect(url).toContain("youtube-nocookie.com/embed/abc123XYZ89");
    expect(url).not.toContain("youtube.com");
  });

  it("ролик не рекомендует другие ролики", () => {
    // На странице бита человек должен смотреть этот ролик, а не уходить в
    // чужие ролики по рекомендациям YouTube.
    expect(youtubeEmbedUrl("abc123XYZ89")).toContain("rel=0");
  });

  it("автозапуск идёт без звука", () => {
    // Звук играет наш плеер, а не ролик: два звука одновременно — это каша.
    const url = youtubeEmbedUrl("abc123XYZ89", { autoplay: true });

    expect(url).toContain("autoplay=1");
    expect(url).toContain("mute=1");
  });

  it("без автозапуска лишних параметров нет", () => {
    expect(youtubeEmbedUrl("abc123XYZ89")).not.toContain("autoplay");
  });
});

describe("ссылка для кнопки", () => {
  it("ведёт на ролик", () => {
    expect(youtubeWatchUrl("abc123XYZ89")).toBe("https://www.youtube.com/watch?v=abc123XYZ89");
  });
});
