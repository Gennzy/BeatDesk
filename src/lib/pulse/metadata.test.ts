import { describe, expect, it } from "vitest";

import {
  buildPulseMetadata,
  pulseMetadataProblem,
  TAGS_LIMIT,
  TITLE_LIMIT,
  type BeatMeta,
} from "./metadata";

/**
 * Метаданные для YouTube.
 *
 * Проверяется не вид, а текст и лимиты. Ошибка в заголовке или описании
 * уходит наружу и остаётся там навсегда: видео видно всем, и «исправить
 * это» стоит ручной правки в чужом кабинете.
 */
const beat: BeatMeta = {
  title: "Slayr & Pittkiid Type Beat | Mimosa",
  bpm: 130,
  musicalKey: "F# minor",
  genre: "trap",
  genreLabel: "Трап",
  tags: ["slayr", "pittkiid", "mayot"],
  artists: ["prod.dy"],
  producer: "Gennzy",
  beatUrl: "https://beat-desk.ru/beats/123",
};

describe("метаданные Pulse", () => {
  it("название собирается так, как биты ищут в YouTube", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    expect(meta.title).toBe("[FREE] prod.dy type beat - Slayr & Pittkiid Type Beat | Mimosa | prod. Gennzy");
  });

  it("без свободного распространения префикса нет", () => {
    const meta = buildPulseMetadata(beat, "paid");

    expect(meta.title.startsWith("[FREE]")).toBe(false);
  });

  it("без артистов название остаётся разбираемым", () => {
    const meta = buildPulseMetadata({ ...beat, artists: [] }, "nonProfit");

    // Пустое « type beat — » хуже, чем просто «type beat».
    expect(meta.title).toBe("[FREE] type beat - Slayr & Pittkiid Type Beat | Mimosa | prod. Gennzy");
  });

  it("в описании бесплатного бита есть и запрет, и ссылка на покупку", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    expect(meta.description).toContain("только для некоммерческого использования");
    expect(meta.description).toContain(beat.beatUrl);
  });

  it("в описании платного бита запрета нет, а ссылка есть", () => {
    const meta = buildPulseMetadata(beat, "paid");

    expect(meta.description).toContain(beat.beatUrl);
    expect(meta.description).not.toContain("только для некоммерческого использования");
  });

  it("кредит артиста стоит в описании", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    expect(meta.description).toContain("must credit: prod.dy");
  });

  it("техническая строка склеена — так её пишут в продакшене", () => {
    expect(buildPulseMetadata(beat, "paid").techLine).toBe("130bpm F#minor");
  });

  it("название укладывается в лимит YouTube", () => {
    const long = { ...beat, title: "Ж".repeat(200), artists: ["Х".repeat(60)] };
    const meta = buildPulseMetadata(long, "nonProfit");

    expect(meta.title.length).toBeLessThanOrEqual(TITLE_LIMIT);
    expect(meta.trimmed.title).toBe(true);
  });

  it("обрезанное название не кончается полусловом", () => {
    const long = { ...beat, title: "beat ".repeat(40), artists: [] };
    const meta = buildPulseMetadata(long, "paid");

    expect(meta.trimmed.title).toBe(true);
    expect(meta.title.endsWith(" ")).toBe(false);
  });

  it("теги укладываются в суммарный лимит, а не в число", () => {
    const fat = {
      ...beat,
      tags: Array.from({ length: 40 }, (_, i) => `очень-длинный-тег-номер-${i}`),
      artists: ["prod.one", "prod.two", "prod.three", "prod.four"],
    };

    const meta = buildPulseMetadata(fat, "paid");
    const used = meta.tags.join(",").length;

    expect(used).toBeLessThanOrEqual(TAGS_LIMIT);
    expect(meta.trimmed.tags.length).toBeGreaterThan(0);
  });

  it("тег жанра английский, а не подпись из интерфейса", () => {
    const meta = buildPulseMetadata(beat, "paid");

    // «Трейп» в тегах не находит ничего: YouTube ищут по-английски.
    expect(meta.tags).toContain("trap");
    expect(meta.tags).not.toContain("Трап");
    // В описании остаётся по-русски — там читает человек.
    expect(meta.description).toContain("Жанр: Трап");
  });

  it("теги не повторяются", () => {
    const meta = buildPulseMetadata({ ...beat, tags: ["trap", "trap", "trap"] }, "paid");

    expect(new Set(meta.tags).size).toBe(meta.tags.length);
  });

  it("название и описание без пустых строк подряд", () => {
    const meta = buildPulseMetadata({ ...beat, artists: [], genreLabel: null }, "paid");

    expect(meta.description).not.toMatch(/\n{3,}/);
    expect(meta.title).not.toMatch(/\s{2,}/);
  });

  it("пустое название бита не оставляет дыру в заголовке", () => {
    const meta = buildPulseMetadata({ ...beat, title: "  ", artists: [] }, "paid");

    // Название исчезает совсем, а продюсер остаётся один раз: подставить
    // его на место названия дало бы «Gennzy | prod. Gennzy».
    expect(meta.title).toBe("type beat | prod. Gennzy");
    expect(meta.title).not.toMatch(/\s{2,}/);
    expect(meta.named).toBe(false);
  });

  it("совсем пустой заголовок ловится до рендера видео", () => {
    const meta = buildPulseMetadata({ ...beat, title: "", producer: "", artists: [] }, "paid");

    expect(pulseMetadataProblem(meta)).toBeTruthy();
  });

  it("нормальные метаданные проблем не имеют", () => {
    expect(pulseMetadataProblem(buildPulseMetadata(beat, "nonProfit"))).toBeNull();
  });
});