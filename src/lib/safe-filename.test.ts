import { describe, expect, it } from "vitest";

import { safeFileName } from "./beats";

/**
 * Имена файлов в storage.
 *
 * Проверяется то, что ломается тихо: обрезанное расширение делает файл
 * неопознаваемым, а съеденное начало — неотличимым от соседей.
 */
describe("safeFileName", () => {
  it("короткое имя не трогает", () => {
    expect(safeFileName("my-beat.mp3")).toBe("my-beat.mp3");
  });

  it("длинное имя режет с начала и бережёт расширение", () => {
    const name = safeFileName(`${"a".repeat(50)}-final-mix-v2-mastered.mp3`);

    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith(".mp3")).toBe(true);
    expect(name.startsWith("a".repeat(50))).toBe(true);
  });

  it("пустое имя заменяет заглушкой", () => {
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("___")).toBe("file");
  });
});
