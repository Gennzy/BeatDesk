import { describe, expect, it } from "vitest";

import { genreTrends, sellerStanding, verdictLabel, type GenreBeat } from "./trends";

/**
 * Панель «что в тренде».
 *
 * Проверяется, что панель отвечает на два вопроса битмейкера: во что сейчас
 * ищут и как он стоит относительно своих.
 */

const NOW = Date.parse("2026-10-18T00:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const beat = (over: Partial<GenreBeat> = {}): GenreBeat => ({
  id: "b-1",
  ownerId: "u-1",
  title: "Бит",
  genre: "trap",
  tags: ["dark", "phonk"],
  plays: 10,
  price: 500,
  createdAt: daysAgo(10),
  ...over,
});

describe("срез по жанрам", () => {
  it("жанры идут по прослушиваниям", () => {
    const trends = genreTrends([
      beat({ genre: "trap", plays: 100 }),
      beat({ genre: "rock", plays: 500 }),
    ]);

    expect(trends[0].genre).toBe("rock");
  });

  it("считает биты и медианную цену", () => {
    const trends = genreTrends([
      beat({ price: 400 }),
      beat({ price: 600 }),
      beat({ price: 800 }),
    ]);

    expect(trends[0].beats).toBe(3);
    expect(trends[0].medianPrice).toBe(600);
  });

  it("показывает теги жанра по спросу", () => {
    const trends = genreTrends([
      beat({ tags: ["trap"], plays: 100 }),
      beat({ tags: ["ambient"], plays: 5 }),
    ]);

    expect(trends[0].topTags[0].tag).toBe("trap");
  });

  it("бит без жанра попадает в общую группу", () => {
    const trends = genreTrends([beat({ genre: null })]);

    expect(trends[0].genre).toBeNull();
  });
});

describe("место продавца", () => {
  it("дороже медианы — так и говорит", () => {
    const own = [beat({ price: 1000 })];
    const trend = genreTrends([beat({ price: 500 })]);

    expect(sellerStanding(own, trend[0], NOW).verdict).toBe("higher");
  });

  it("дешевле медианы — так и говорит", () => {
    const own = [beat({ price: 300 })];
    const trend = genreTrends([beat({ price: 500 })]);

    expect(sellerStanding(own, trend[0], NOW).verdict).toBe("lower");
  });

  it("вровь с жанром — «как и в жанре»", () => {
    const own = [beat({ price: 500 })];
    const trend = genreTrends([beat({ price: 500 })]);

    expect(sellerStanding(own, trend[0], NOW).verdict).toBe("same");
  });

  it("без жанра сравнивать не с чем", () => {
    expect(sellerStanding([beat({ price: 500 })], undefined, NOW).verdict).toBe("unknown");
  });

  it("находит теги, по которым не находят", () => {
    // Тег на бите без прослушиваний в подсказку не попадает: по нему не
    // приходят, и в описании он занимает место впустую.
    const own = [beat({ tags: ["dark", "useless"], plays: 0 })];
    const standing = sellerStanding(own, undefined, NOW);

    expect(standing.coldTags).toContain("useless");
  });

  it("горячий тег в холодные не попадает", () => {
    const own = [beat({ tags: ["dark"], plays: 100 })];
    const standing = sellerStanding(own, undefined, NOW);

    expect(standing.coldTags).not.toContain("dark");
  });

  it("подписи у вердиктов разные", () => {
    expect(verdictLabel("higher")).not.toBe(verdictLabel("lower"));
    expect(verdictLabel("unknown")).toBeTruthy();
  });
});
