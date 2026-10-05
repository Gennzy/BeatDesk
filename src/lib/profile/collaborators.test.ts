import { describe, expect, it } from "vitest";

import { COLLABORATOR_LIMIT, collaboratorsHint, parseCollaborators } from "./collaborators";

describe("список артистов", () => {
  it("читает и запятые, и строки", () => {
    expect(parseCollaborators("Polo G, Lil Durk\ntikottheceo")).toEqual(["Polo G", "Lil Durk", "tikottheceo"]);
  });

  it("один артист в разном регистре — один раз", () => {
    expect(parseCollaborators("Polo G, polo g, POLO G")).toEqual(["Polo G"]);
  });

  it("лишние пробелы не остаются в имени", () => {
    expect(parseCollaborators("  Lil   Durk  ")).toEqual(["Lil Durk"]);
  });

  it("мусор отбрасывается, а не показывается в профиле", () => {
    // Строка из одной буквы — это опечатка, а не артист.
    expect(parseCollaborators("X, Polo G")).toEqual(["Polo G"]);
    expect(parseCollaborators("имя на 100 символов".repeat(6))).toEqual([]);
  });

  it("список ограничен, иначе профиль разрастается", () => {
    const many = Array.from({ length: 30 }, (_, index) => `Артист ${index}`);

    expect(parseCollaborators(many)).toHaveLength(COLLABORATOR_LIMIT);
  });

  it("пустое значение не превращается в список с одним пустым именем", () => {
    expect(parseCollaborators("")).toEqual([]);
    expect(parseCollaborators("   \n  ")).toEqual([]);
    expect(parseCollaborators(null)).toEqual([]);
    expect(parseCollaborators(undefined)).toEqual([]);
  });

  it("уже готовый массив проходит насквозь", () => {
    expect(parseCollaborators(["Polo G", " polo g ", "Lil Durk"])).toEqual(["Polo G", "Lil Durk"]);
  });

  it("подсказка говорит про формат", () => {
    expect(collaboratorsHint).toContain("запятую");
  });
});
