import { describe, expect, it } from "vitest";

import {
  allBlocks,
  beatchainBlock,
  fileBase,
  fileNames,
  hashtagList,
  keyForFile,
  keyShort,
  priceLine,
  telegramBlock,
  translit,
  typeBeatLine,
  vkBlock,
  youtubeBlocks,
  type DistributionBeat,
} from "@/lib/distribution";

const beat = (over: Partial<DistributionBeat> = {}): DistributionBeat => ({
  id: "11111111-1111-1111-1111-111111111111",
  title: "Ночной бит",
  artists: ["Slayr", "Pittkiid"],
  bpm: 130,
  musicalKey: "F# minor",
  tags: ["dark", "trap"],
  prices: { mp3: 500, bundle: 1500, exclusive: 3500 },
  currency: "RUB",
  audioUrl: "https://beat-desk.vercel.app/api/audio/1",
  ownerUsername: "gennzy",
  ...over,
});

describe("translit", () => {
  it("переводит кириллицу в латиницу", () => {
    expect(translit("Ночной бит")).toBe("nochnoy_bit");
    expect(translit("Жажда")).toBe("zhazhda");
  });

  it("сложные согласные следуют одному соглашению, а не двум", () => {
    // Щ и Ц пишутся по-немецки: sch и ts. Если поменять одно из них на
    // shch, имена файлов одного автора будут выглядеть по-разному.
    expect(translit("Щавель")).toBe("schavel");
    expect(translit("Цветок")).toBe("tsvetok");
    expect(translit("Чай")).toBe("chay");
  });

  it("убирает знаки препинания и лишние подчёркивания", () => {
    expect(translit("  ??? Beat!  ")).toBe("beat");
    expect(translit("a//b")).toBe("a_b");
  });

  it("не оставляет пустую строку из одних разделителей", () => {
    expect(translit("!!!")).toBe("");
  });
});

describe("keyShort и keyForFile", () => {
  it("минор сокращается до m, мажор остаётся нотой", () => {
    expect(keyShort("F# minor")).toBe("F#m");
    expect(keyShort("C major")).toBe("C");
  });

  it("в имени файла решётка заменяется словом", () => {
    // В URL «#» — это якорь, а маленькая b читается как «бемоль».
    expect(keyForFile("F# minor")).toBe("Fsharpm");
    expect(keyForFile("Bb major")).toBe("Bflat");
    expect(keyForFile("F# minor")).not.toContain("#");
  });
});

describe("fileBase и fileNames", () => {
  it("собирает базу из названия, темпа и тональности", () => {
    expect(fileBase(beat())).toBe("nochnoy_bit_130_Fsharpm");
  });

  it("всегда даёт tagged и untagged, остальное — по факту наличия файлов", () => {
    expect(fileNames(beat(), {})).toEqual([
      { label: "tagged", name: "nochnoy_bit_130_Fsharpm_tagged.mp3" },
      { label: "untagged", name: "nochnoy_bit_130_Fsharpm_untagged.mp3" },
    ]);

    const all = fileNames(beat(), { wav: true, zip: true, rar: true });
    expect(all.map((item) => item.label)).toEqual(["tagged", "untagged", "wav", "stems", "stems"]);
    expect(all.map((item) => item.name)).toEqual([
      "nochnoy_bit_130_Fsharpm_tagged.mp3",
      "nochnoy_bit_130_Fsharpm_untagged.mp3",
      "nochnoy_bit_130_Fsharpm_tagged.wav",
      "nochnoy_bit_130_Fsharpm_stems.zip",
      "nochnoy_bit_130_Fsharpm_stems.rar",
    ]);
  });

  it("имена файлов не содержат кириллицы и пробелов", () => {
    for (const item of fileNames(beat({ title: "Ёлка в лесу" }), { wav: true })) {
      expect(item.name).toMatch(/^[\x20-\x7e]+$/u);
      expect(item.name).not.toContain(" ");
    }
  });
});

describe("priceLine", () => {
  it("перечисляет только заданные цены", () => {
    expect(priceLine(beat())).toBe("MP3 500 ₽ · MP3+WAV 1 500 ₽ · Эксклюзив 3 500 ₽");
  });

  it("пустые цены не печатаются мусором", () => {
    expect(priceLine(beat({ prices: { mp3: 500, bundle: null, exclusive: null } }))).toBe("MP3 500 ₽");
    expect(priceLine(beat({ prices: { mp3: null, bundle: null, exclusive: null } }))).toBe("");
  });

  it("валюта бита попадает в текст, а не рубли по умолчанию", () => {
    expect(priceLine(beat({ currency: "USD", prices: { mp3: 25, bundle: null, exclusive: null } }))).toBe("MP3 25 $");
    expect(priceLine(beat({ currency: "EUR", prices: { mp3: 20, bundle: null, exclusive: null } }))).toContain("€");
  });

  it("бит без валюты считается рублёвым", () => {
    expect(priceLine({ ...beat(), currency: undefined })).toContain("₽");
  });
});

describe("typeBeatLine и hashtagList", () => {
  it("артисты попадают в строку типа бита", () => {
    expect(typeBeatLine(beat())).toBe("Type Beat Slayr, Pittkiid");
  });

  it("без артистов строка остаётся правильной", () => {
    expect(typeBeatLine(beat({ artists: [] }))).toBe("Type Beat");
  });

  it("теги становятся хештегами", () => {
    expect(hashtagList(beat())).toBe("#dark #trap");
    expect(hashtagList(beat({ tags: [] }))).toBe("");
  });
});

describe("блоки площадок", () => {
  it("BeatChain перечисляет поля и лицензии", () => {
    const block = beatchainBlock(beat());
    expect(block.title).toBe("BeatChain");
    expect(block.text).toContain("Название: Ночной бит");
    expect(block.text).toContain("Артисты: Slayr, Pittkiid");
    expect(block.text).toContain("BPM: 130");
    expect(block.text).toContain("Тональность: F# minor");
    expect(block.text).toContain("Теги: dark, trap");
    expect(block.text).toContain("Лицензии: MP3 500 ₽");
  });

  it("BeatChain опускает пустые строки, а не печатает «null»", () => {
    const block = beatchainBlock(beat({ artists: [], tags: [], prices: { mp3: null, bundle: null, exclusive: null } }));
    expect(block.text).not.toMatch(/null|undefined/i);
    expect(block.text).not.toContain("Артисты:");
    expect(block.text).not.toContain("Теги:");
    expect(block.text).not.toContain("Лицензии:");
  });

  it("YouTube даёт название, описание и теги", () => {
    const [title, description, tags] = youtubeBlocks(beat());
    expect(title?.text).toContain("Ночной бит");
    expect(title?.text).toContain("130 BPM");
    expect(title?.text).toContain("F# minor");
    expect(description?.text).toContain("Ссылка: https://beat-desk.vercel.app/api/audio/1");
    expect(tags?.text).toContain("type beat");
    expect(tags?.text).toContain("slayr");
    expect(tags?.text).toContain("130bpm");
    expect(tags?.text).toContain("F#m");
  });

  it("ВК и Telegram используют хештеги, а не запятые", () => {
    expect(vkBlock(beat()).text).toContain("#dark #trap");
    expect(telegramBlock(beat()).text).toContain("#dark #trap");
  });

  it("все блоки собираются в одном списке", () => {
    expect(allBlocks(beat()).map((block) => block.title)).toEqual([
      "BeatChain",
      "YouTube · название",
      "YouTube · описание",
      "YouTube · теги",
      "ВК",
      "Telegram",
    ]);
  });

  it("ни один блок не содержит undefined", () => {
    for (const block of allBlocks(beat())) {
      expect(block.text, block.title).not.toMatch(/undefined|null|NaN/i);
    }
  });
});
