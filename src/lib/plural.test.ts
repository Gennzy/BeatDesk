import { describe, expect, it } from "vitest";

import { pluralEn, pluralRu } from "./plural";

/**
 * Склонения в подписях.
 *
 * Проверяется то, что видит глаз: «1 подписчик, 2 подписчика, 5
 * подписчиков» и особые 11–14, где русская форма ломается чаще всего.
 */
describe("pluralRu", () => {
  it("склоняет по единицам", () => {
    expect(pluralRu(1, "бит", "бита", "битов")).toBe("бит");
    expect(pluralRu(2, "бит", "бита", "битов")).toBe("бита");
    expect(pluralRu(5, "бит", "бита", "битов")).toBe("битов");
  });

  it("особые 11–14 идут во множественном", () => {
    for (const count of [11, 12, 13, 14, 111, 112]) {
      expect(pluralRu(count, "бит", "бита", "битов"), String(count)).toBe("битов");
    }
  });

  it("сотни возвращаются к единицам", () => {
    expect(pluralRu(21, "бит", "бита", "битов")).toBe("бит");
    expect(pluralRu(22, "бит", "бита", "битов")).toBe("бита");
    expect(pluralRu(25, "бит", "бита", "битов")).toBe("битов");
  });
});

describe("pluralEn", () => {
  it("один — единственное, остальное — множественное", () => {
    expect(pluralEn(1, "play", "plays")).toBe("play");
    expect(pluralEn(0, "play", "plays")).toBe("plays");
    expect(pluralEn(2, "play", "plays")).toBe("plays");
  });
});
