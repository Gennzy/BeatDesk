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

  it("первым идёт «type beat» — по нему ищут сами биты", () => {
    const meta = buildPulseMetadata(beat, "paid");

    /*
     * Авторские теги шли первыми и съедали лимит: на бите с длинными
     * тегами до «type beat» очередь не доходила, и видео не находилось ни по
     * одному запросу, ради которого его и выкладывали.
     */
    expect(meta.tags[0]).toBe("type beat");
  });

  it("жанр попадает в теги со словом «beat», а не голым слагом", () => {
    const meta = buildPulseMetadata(beat, "paid");

    // «trap beat» — как ищут; «trap» сам по себе почти ничего не находит.
    expect(meta.tags).toContain("trap beat");
    expect(meta.tags).toContain("beat trap");
    expect(meta.tags).toContain("trap");
  });

  it("темп идёт с пробелом и без — так его ищут и так пишут", () => {
    const meta = buildPulseMetadata(beat, "paid");

    expect(meta.tags).toContain("130 bpm");
    expect(meta.tags).toContain("130bpm");
  });

  it("есть теги о намерении купить", () => {
    const paid = buildPulseMetadata(beat, "paid");
    const free = buildPulseMetadata(beat, "nonProfit");

    expect(paid.tags).toContain("beats for sale");
    // Бесплатный бит должен находиться и по запросу про бесплатный.
    expect(free.tags).toContain("free for profit");
    expect(paid.tags).not.toContain("free for profit");
  });

  it("жанр через дефис разбирается на слова", () => {
    const dashed = buildPulseMetadata({ ...beat, genre: "boom-bap" }, "paid");

    expect(dashed.tags).toContain("boom bap beat");
  });

  it("авторские теги не вытесняют основные, даже когда их много", () => {
    const fat = {
      ...beat,
      tags: Array.from({ length: 40 }, (_, i) => `длинный-авторский-тег-${i}`),
    };

    const meta = buildPulseMetadata(fat, "paid");

    expect(meta.tags.slice(0, 8)).toContain("type beat");
    expect(meta.tags.slice(0, 8).some((tag) => tag.includes("авторский"))).toBe(false);
  });

  it("в описании три хештега, а не стена", () => {
    const meta = buildPulseMetadata(beat, "paid");

    /*
     * Хештег начинается с начала строки или после пробела. Решетка внутри
     * «F#minor» из технической строки хештегом не является — и YouTube так
     * же её не считает, поэтому и проверка требует границу.
     */
    const hashtags = meta.description.match(/(?:^|\s)#[^\s]+/g) ?? [];

    // YouTube выносит первые три над заголовком, остальное — просто шум.
    expect(hashtags).toHaveLength(3);
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