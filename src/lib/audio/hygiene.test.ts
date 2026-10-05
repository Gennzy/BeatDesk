import { describe, expect, it } from "vitest";

import { checkPackage, type PackageFacts } from "./hygiene";

const pack = (over: Partial<PackageFacts> = {}): PackageFacts => ({
  title: "Пыль в луче",
  bpm: 130,
  key: "F# major",
  genre: "Boom bap",
  mood: "Мрачно",
  tags: ["dark", "dusty"],
  files: [
    { name: "Пыль в луче.wav", role: "wav" },
    { name: "cover.png", role: "artwork" },
  ],
  embedded: { title: "Пыль в луче", bpm: 130, key: "F# major" },
  ...over,
});

const ids = (over: Partial<PackageFacts> = {}) => checkPackage("beatstars", pack(over)).map((item) => item.id);

describe("состав пакета", () => {
  it("аккуратный пакет к BeatStars не вызывает замечаний", () => {
    expect(checkPackage("beatstars", pack())).toEqual([]);
  });

  it("пустой пакет — блокер на любой площадке", () => {
    expect(checkPackage("airbit", pack({ files: [] })).find((item) => item.id === "files.empty")?.severity).toBe("block");
  });

  it("отсутствие мастера на Airbit мешает, на BeatStars — предупреждение", () => {
    // Airbit собирает MP3 из WAV, поэтому без мастера нечего выкладывать.
    expect(checkPackage("airbit", pack({ files: [{ name: "cover.png", role: "artwork" }] })).find((item) => item.id === "files.noMaster")?.severity).toBe("block");
    expect(checkPackage("beatstars", pack({ files: [{ name: "cover.png", role: "artwork" }] })).find((item) => item.id === "files.noMaster")?.severity).toBe("warn");
  });

  it("BeatStars не требует отдельный MP3: площадка делает его сама", () => {
    expect(ids({ files: [{ name: "Пыль.wav", role: "wav" }] })).not.toContain("files.noMp3");
  });

  it("BeatChain не требует MP3, потому что его требования не опубликованы", () => {
    // Мы не видели форму загрузки, значит и требовать отдельный тегованный
    // MP3 нельзя: это будет выдуманное правило.
    expect(checkPackage("beatchain", pack({ files: [{ name: "Пыль.wav", role: "wav" }] })).map((item) => item.id)).not.toContain("files.noMp3");
  });

  it("больше четырёх файлов BeatStars не примет за одну загрузку", () => {
    const files = [
      { name: "a.wav", role: "wav" as const },
      { name: "b.wav", role: "wav" as const },
      { name: "stems.zip", role: "stems" as const },
      { name: "cover.png", role: "artwork" as const },
      { name: "extra.txt", role: "other" as const },
    ];

    expect(ids({ files })).toContain("files.tooMany");
  });

  it("на BeatChain потолка на число файлов нет, потому его и нет", () => {
    const files = Array.from({ length: 6 }, (_, index) => ({ name: `${index}.wav`, role: "wav" as const }));

    expect(checkPackage("beatchain", pack({ files })).map((item) => item.id)).not.toContain("files.tooMany");
  });

  it("два мастера без разбора — предупреждение, а не отказ", () => {
    expect(ids({ files: [{ name: "tagged.wav", role: "wav" }, { name: "untagged.wav", role: "wav" }] })).toContain("files.ambiguousMaster");
  });

  it("роль файла угадывается по расширению, если её не указали", () => {
    // Расширение — единственное, что есть в буфере обмена.
    expect(ids({ files: [{ name: "Пыль.wav", role: "other" }, { name: "обложка.png", role: "other" }] })).not.toContain("files.noMaster");
  });

  it("путь в имени файла не мешает разобрать расширение", () => {
    expect(ids({ files: [{ name: "C:\\релиз\\Пыль.wav", role: "other" }] })).not.toContain("files.noMaster");
  });

  it("стемы без проверки разрядности — предупреждение", () => {
    expect(ids({ files: [{ name: "Пыль.wav", role: "wav" }, { name: "stems.zip", role: "stems" }] })).toContain("stems.lowBitDepth");
  });
});

describe("название", () => {
  it("двойные пробелы дают риск задвоения карточки", () => {
    expect(ids({ title: "Пыль  в луче" })).toContain("title.spaces");
  });

  it("длинное название обрежется в выдаче", () => {
    expect(ids({ title: "а".repeat(90) })).toContain("title.long");
  });

  it("обычные символы в названии допустимы", () => {
    expect(ids({ title: "Пыль в луче (VIP) & чёрное" })).not.toContain("title.symbols");
  });

  it("эмодзи и прочий мусор ловятся", () => {
    expect(ids({ title: "Пыль 🌫" })).toContain("title.symbols");
  });
});

describe("теги и жанр", () => {
  it("лишние теги обрезаются площадкой", () => {
    expect(ids({ tags: ["dark", "dusty", "boom", "hard"] })).toContain("tags.tooMany");
  });

  it("теги в разном регистре считаются дублями", () => {
    expect(ids({ tags: ["Trap", "trap"] })).toContain("tags.duplicates");
  });

  it("пустые теги не занимают место в лимите", () => {
    expect(ids({ tags: ["dark", "dusty", "  ", "boom bap"] })).not.toContain("tags.tooMany");
  });

  it("на BeatChain лимита нет, потому и претензии нет", () => {
    expect(checkPackage("beatchain", pack({ tags: ["a", "b", "c", "d"] })).map((item) => item.id)).not.toContain("tags.tooMany");
  });

  it("пустой жанр — предупреждение", () => {
    expect(ids({ genre: "  " })).toContain("genre.missing");
  });
});

describe("теги внутри файла против карточки", () => {
  it("разное название в тегах и в карточке даст два имени в выдаче", () => {
    expect(ids({ embedded: { title: "Dust" } })).toContain("embedded.titleDiffers");
  });

  it("одинаковые названия не вызывают замечаний", () => {
    expect(ids({ embedded: { title: "Пыль в луче" } })).not.toContain("embedded.titleDiffers");
  });

  it("разный темп в тегах и в карточке — предупреждение", () => {
    expect(ids({ embedded: { bpm: 90 } })).toContain("embedded.bpmDiffers");
  });

  it("разный ключ в тегах и в карточке — предупреждение", () => {
    expect(ids({ embedded: { key: "C# minor" } })).toContain("embedded.keyDiffers");
  });

  it("разная запись одной тональности разными словами ловится", () => {
    // «F# major» и «major» фильтры сравнивают строками.
    expect(ids({ embedded: { key: "major" } })).toContain("embedded.keyDiffers");
  });

  it("если в файле тегов нет, молчим", () => {
    expect(ids({ embedded: undefined })).toHaveLength(0);
  });
});
