import { describe, expect, it } from "vitest";

import { fileBase, keyForFile, translit, type PromoBeat } from "./beat-promo";

/**
 * Имена файлов для покупателя.
 *
 * Проверяется то, что видно в загрузках: решётка в имени ломает ссылку,
 * а кириллица без транслита — распаковку на чужой машине.
 */
describe("translit", () => {
  it("кириллицу переводит в латиницу", () => {
    expect(translit("Ночной дрейф")).toBe("nochnoy_dreyf");
  });

  it("решётку пишет словом, а не оставляет якорем", () => {
    expect(translit("F# minor")).toBe("fsharp_minor");
    expect(translit("C#")).toBe("csharp");
  });
});

describe("keyForFile", () => {
  it("знаки пишет словом", () => {
    expect(keyForFile("F# minor")).toBe("Fsharpm");
    expect(keyForFile("Bb major")).toBe("Bflat");
    expect(keyForFile("C major")).toBe("C");
  });
});

describe("fileBase", () => {
  it("собирает имя без решёток", () => {
    const beat: PromoBeat = {
      id: "00000000-0000-0000-0000-000000000001",
      title: "ZIP",
      bpm: 150,
      musicalKey: "F# minor",
      tags: [],
      artists: [],
      prices: { mp3: 500, wav: null, trackout: null, exclusive: null },
      audioUrl: null,
      ownerUsername: "gennzy",
    };
    const base = fileBase(beat);

    expect(base).toBe("zip_150_Fsharpm");
    expect(base).not.toContain("#");
  });
});
