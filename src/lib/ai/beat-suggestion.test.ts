import { describe, expect, it } from "vitest";

import { parseSuggestion, TAGS_LIMIT, TITLES_LIMIT } from "./beat-suggestion";

const good = {
  titles: ["Ночной Пит", "Пит в тумане"],
  description: "Мрачный бит под трап.",
  tags: ["trap", "dark"],
  notes: ["тег type beat"],
};

describe("разбор ответа модели", () => {
  it("читает обычный JSON", () => {
    expect(parseSuggestion(JSON.stringify(good))).toMatchObject({ tags: ["trap", "dark"] });
  });

  it("снимает обёртку ```json — модель добавляет её почти всегда", () => {
    const wrapped = `Вот варианты:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nЕсли что — спроси.`;

    expect(parseSuggestion(wrapped)?.titles).toHaveLength(2);
  });

  it("достаёт объект из болтовни вокруг", () => {
    const noisy = `Конечно! ${JSON.stringify(good)} Надеюсь, помогло.`;

    expect(parseSuggestion(noisy)?.description).toContain("Мрачный");
  });

  it("название одной строкой тоже принимается", () => {
    const single = { titles: "Пит", description: "Описание", tags: [] };

    expect(parseSuggestion(JSON.stringify(single))?.titles).toEqual(["Пит"]);
  });

  it("без названия или описания не выдумывает", () => {
    // Пустые поля в форме хуже, чем честное «не получилось».
    expect(parseSuggestion(JSON.stringify({ titles: [], description: "d" }))).toBeNull();
    expect(parseSuggestion(JSON.stringify({ titles: ["t"], description: "" }))).toBeNull();
  });

  it("на мусоре и обрыве не падает", () => {
    expect(parseSuggestion("прости, не смогу")).toBeNull();
    expect(parseSuggestion("{ titles: [")).toBeNull();
    expect(parseSuggestion("")).toBeNull();
    expect(parseSuggestion("[]")).toBeNull();
  });

  it("лишние варианты и теги обрезает", () => {
    const long = {
      ...good,
      titles: Array.from({ length: 9 }, (_, index) => `Название ${index}`),
      tags: Array.from({ length: 30 }, (_, index) => `tag${index}`),
    };

    const parsed = parseSuggestion(JSON.stringify(long));

    expect(parsed?.titles).toHaveLength(TITLES_LIMIT);
    expect(parsed?.tags).toHaveLength(TAGS_LIMIT);
  });

  it("повторяющиеся теги схлопывает", () => {
    const parsed = parseSuggestion(JSON.stringify({ ...good, tags: ["Trap", "trap", "TRAP", "dark"] }));

    expect(parsed?.tags).toEqual(["Trap", "dark"]);
  });

  it("слишком длинные строки обрезает, а не рвёт вёрстку", () => {
    const parsed = parseSuggestion(JSON.stringify({ ...good, description: "я".repeat(5000) }));

    expect(parsed?.description.length).toBeLessThanOrEqual(1200);
  });

  it("не требует заметок: их может не быть", () => {
    expect(parseSuggestion(JSON.stringify({ titles: ["t"], description: "d", tags: [] }))?.notes).toEqual([]);
  });
});
