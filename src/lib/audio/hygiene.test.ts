import { describe, expect, it } from "vitest";

import { checkPackage, type PackageFacts } from "./hygiene";
import type { TierId } from "./delivery-rules";

const ALL: TierId[] = ["mp3", "bundle", "trackout", "exclusive"];

const full = [
  { name: "Пыль в луче.wav", role: "wav" as const },
  { name: "Пыль в луче.mp3", role: "mp3" as const },
  { name: "stems.zip", role: "stems" as const },
  { name: "cover.png", role: "artwork" as const },
];

const pack = (over: Partial<PackageFacts> = {}): PackageFacts => ({
  title: "Пыль в луче",
  bpm: 130,
  key: "F# major",
  genre: "Boom bap",
  mood: "Мрачно",
  tags: ["dark", "dusty"],
  files: full,
  embedded: { title: "Пыль в луче", bpm: 130, key: "F# major" },
  ...over,
});

const ids = (tiers: TierId[], over: Partial<PackageFacts> = {}) => checkPackage(tiers, pack(over)).map((item) => item.id);

describe("аккуратный пакет", () => {
  it("бит, обеспеченный под все уровни, не вызывает замечаний", () => {
    expect(checkPackage(ALL, pack())).toEqual([]);
  });

  it("пустой пакет — блокер", () => {
    expect(checkPackage(["mp3"], pack({ files: [] })).find((item) => item.id === "files.empty")?.severity).toBe("block");
  });
});

describe("уровень продаётся, а файла нет", () => {
  // Самая дорогая проверка модуля: без неё битмейкер выставляет цену на
  // уровень, который мы физически не сможем отдать.

  it("Track Out без архива дорожек — блокер", () => {
    const withoutStems = pack({ files: full.filter((file) => file.role !== "stems") });

    expect(ids(["trackout"], { files: withoutStems.files })).toContain("tier.trackout.no-stems");
  });

  it("MP3+WAV без мастера — блокер", () => {
    const withoutWav = pack({ files: full.filter((file) => file.role !== "wav") });

    expect(ids(["bundle"], { files: withoutWav.files })).toContain("tier.bundle.no-wav");
  });

  it("любой уровень без превью — блокер", () => {
    const withoutMp3 = pack({ files: full.filter((file) => file.role !== "mp3") });

    for (const tier of ALL) {
      expect(ids([tier], { files: withoutMp3.files }), tier).toContain(`tier.${tier}.no-mp3`);
    }
  });

  it("блокер говорит, что уровень обещает, и предлагает снять цену", () => {
    const withoutStems = pack({ files: full.filter((file) => file.role !== "stems") });
    const finding = checkPackage(["trackout"], withoutStems).find((item) => item.id === "tier.trackout.no-stems")!;

    expect(finding.severity).toBe("block");
    expect(finding.message).toContain("архива со стемами нет");
    // Совет должен называть оба выхода, а не только «добавьте файл».
    expect(finding.suggestion).toContain("снимите цену");
  });

  it("уровень без цены не даёт блокера за свой файл", () => {
    // Тот же бит, но продан только MP3, а мастера нет: претензия к MP3 не
    // возникает, потому что MP3 мастер и не обещает.
    const mp3Only = pack({ files: [{ name: "cover.png", role: "artwork" as const }] });

    expect(ids(["mp3"], { files: mp3Only.files })).not.toContain("tier.mp3.no-wav");
  });

  it("нет ни одного уровня — об этом тоже нужно сказать", () => {
    expect(ids([])).toContain("tiers.none");
  });

  it("в бите без файлов каждый заявленный уровень даёт свой блокер", () => {
    const report = ids(["mp3", "exclusive"], { files: [] });

    expect(report).toContain("tier.mp3.no-mp3");
    expect(report).toContain("tier.exclusive.no-wav");
    expect(report).toContain("tier.exclusive.no-stems");
  });
});

describe("состав файлов", () => {
  it("два архива дорожек — покупатель получит не тот", () => {
    const files = [...full, { name: "stems_v2.zip", role: "stems" as const }];

    expect(ids(ALL, { files })).toContain("stems.ambiguous");
  });

  it("два мастера без разбора — предупреждение, а не отказ", () => {
    const files = [{ name: "tagged.wav", role: "wav" as const }, { name: "untagged.wav", role: "wav" as const }];

    expect(ids(["mp3"], { files })).toContain("files.ambiguousMaster");
  });

  it("роль файла угадывается по расширению, если её не указали", () => {
    // Расширение — единственное, что есть в буфере обмена.
    const files = [{ name: "Пыль.wav", role: "other" as const }, { name: "обложка.png", role: "other" as const }];

    expect(ids(["mp3"], { files })).not.toContain("files.noMaster");
  });

  it("путь в имени файла не мешает разобрать расширение", () => {
    const files = [{ name: "C:\\релиз\\Пыль.mp3", role: "other" as const }];

    expect(ids(["mp3"], { files })).not.toContain("tier.mp3.no-mp3");
  });

  it("без мастера уровни, которые его обещают, дают блокер", () => {
    const files = [{ name: "Пыль.mp3", role: "mp3" as const }];

    expect(ids(["bundle"], { files })).toContain("files.noMaster");
  });

  it("обложка не обязательна для исполнения заказа", () => {
    const files = full.filter((file) => file.role !== "artwork");
    const finding = checkPackage(ALL, pack({ files })).find((item) => item.id === "artwork.missing")!;

    // Без обложки карточка некрасивая, но заказ выполним.
    expect(finding.severity).toBe("warn");
  });
});

describe("название", () => {
  it("двойные пробелы дают риск задвоения карточки", () => {
    expect(ids(ALL, { title: "Пыль  в луче" })).toContain("title.spaces");
  });

  it("длинное название обрежется в ленте", () => {
    expect(ids(ALL, { title: "а".repeat(90) })).toContain("title.long");
  });

  it("обычные символы в названии допустимы", () => {
    expect(ids(ALL, { title: "Пыль в луче (VIP) & чёрное" })).not.toContain("title.symbols");
  });

  it("эмодзи и прочий мусор ловятся", () => {
    expect(ids(ALL, { title: "Пыль 🌫" })).toContain("title.symbols");
  });
});

describe("теги и жанр", () => {
  it("лишние теги не попадут ни в один фильтр", () => {
    expect(ids(ALL, { tags: Array.from({ length: 12 }, (_, index) => `tag${index}`) })).toContain("tags.tooMany");
  });

  it("теги в разном регистре считаются дублями", () => {
    expect(ids(ALL, { tags: ["Trap", "trap"] })).toContain("tags.duplicates");
  });

  it("пустые теги не занимают место в лимите", () => {
    expect(ids(ALL, { tags: ["dark", "dusty", "  "] })).not.toContain("tags.tooMany");
  });

  it("пустой жанр — предупреждение", () => {
    expect(ids(ALL, { genre: "  " })).toContain("genre.missing");
  });
});

describe("теги внутри файла против карточки", () => {
  it("разное название в тегах и в карточке даст два имени в заказе", () => {
    expect(ids(ALL, { embedded: { title: "Dust" } })).toContain("embedded.titleDiffers");
  });

  it("одинаковые названия не вызывают замечаний", () => {
    expect(ids(ALL, { embedded: { title: "Пыль в луче" } })).not.toContain("embedded.titleDiffers");
  });

  it("разный темп в тегах и в карточке — предупреждение", () => {
    expect(ids(ALL, { embedded: { bpm: 90 } })).toContain("embedded.bpmDiffers");
  });

  it("разный ключ в тегах и в карточке — предупреждение", () => {
    expect(ids(ALL, { embedded: { key: "C# minor" } })).toContain("embedded.keyDiffers");
  });

  it("разная запись одной тональности разными словами ловится", () => {
    // «F# major» и «major» фильтры сравнивают строками.
    expect(ids(ALL, { embedded: { key: "major" } })).toContain("embedded.keyDiffers");
  });

  it("если в файле тегов нет, молчим", () => {
    expect(ids(ALL, { embedded: undefined })).toEqual([]);
  });
});
