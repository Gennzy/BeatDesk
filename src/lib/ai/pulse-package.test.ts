import { describe, expect, it } from "vitest";

import { buildPackageMessages, mergeWithRules, sanitizePackage, tagsLength } from "./pulse-package";
import { buildPulseMetadata, type BeatMeta } from "../pulse/metadata";

/**
 * Упаковка от модели.
 *
 * Модель возвращает что угодно, поэтому проверяется не «хорошо ли она
 * ответила», а можно ли это опубликовать. Всё, что можно перепутать с фактом
 * или с лимитом, режется здесь.
 */

const beat: BeatMeta = {
  title: "Night Vision",
  bpm: 138,
  musicalKey: "F# major",
  genre: "dark",
  genreLabel: "Дарк",
  tags: ["night"],
  artists: ["madk1d", "villian"],
  producer: "Gennzy",
  beatUrl: "https://beat-desk.vercel.app/beats/1",
};

describe("разбор ответа модели", () => {
  it("чистый JSON принимается", () => {
    const pack = sanitizePackage(
      { title: "madk1d, villian type beat - Night Vision", description: "Тёмный бит.", tags: ["dark type beat"] },
      beat.artists,
    );

    expect(pack?.title).toBe("madk1d, villian type beat - Night Vision");
    expect(pack?.tags).toEqual(["dark type beat"]);
  });

  it("обёртка в тройные кавычки вырезается", () => {
    // Модель почти всегда оборачивает JSON, и обёртка — не ошибка модели,
    // а её привычка. Отказывать из-за неё значит не получать ничего.
    const raw = '```json\n{"title":"PLUTO","description":"Тихий бит.","tags":["dark type beat"]}\n```';

    expect(sanitizePackage(JSON.parse(raw.replace(/```(?:json)?|```/g, "")), beat.artists)?.title).toBe("PLUTO");
  });

  it("мусор до и после объекта не ломает разбор", () => {
    const raw = 'Вот ваш JSON:\n{"title":"PLUTO","description":"d","tags":["trap type beat"]}\nНадеюсь, помог!';

    expect(sanitizePackage(JSON.parse(raw.slice(raw.indexOf("{"), raw.indexOf("}") + 1)), beat.artists)?.title).toBe(
      "PLUTO",
    );
  });

  it("пустое название — это отказ, а не пустое название", () => {
    expect(sanitizePackage({ title: "   ", description: "d", tags: ["x"] }, beat.artists)).toBeNull();
  });

  it("ответ без тегов отклоняется", () => {
    // Без тегов видео не находят, и молча публиковать такое хуже, чем
    // оставить правила.
    expect(sanitizePackage({ title: "PLUTO", description: "d", tags: [] }, beat.artists)).toBeNull();
  });

  it("теги чистятся от решётки и мусора", () => {
    const pack = sanitizePackage(
      { title: "PLUTO", description: "d", tags: ["#trap beat!", "dark/type beat", "free*for*profit"] },
      beat.artists,
    );

    expect(pack?.tags).toEqual(["trap beat", "darktype beat", "freeforprofit"]);
  });

  it("голое имя артиста без «type beat» не идёт в теги", () => {
    // Имена и так стоят в заголовке, а тег с именем без «type beat» не
    // находится никем — это место в лимите, потраченное впустую.
    const pack = sanitizePackage({ title: "PLUTO", description: "d", tags: ["madk1d", "dark type beat"] }, beat.artists);

    expect(pack?.tags).not.toContain("madk1d");
  });

  it("одинаковые теги разными регистрами схлопываются", () => {
    const pack = sanitizePackage(
      { title: "PLUTO", description: "d", tags: ["Dark Type Beat", "dark type beat"] },
      beat.artists,
    );

    expect(pack?.tags).toHaveLength(1);
  });

  it("теги телеграм и YouTube не помешаны в одну строку", () => {
    expect(tagsLength(["trap beat", "dark type beat"])).toBe("trap beat,dark type beat".length);
  });
});

describe("слияние с правилами", () => {
  const ruled = buildPulseMetadata(beat, "nonProfit");

  it("без ответа модели остаются правила", () => {
    const merged = mergeWithRules(null, ruled);

    expect(merged.title).toBe(ruled.title);
    expect(merged.tags).toEqual(ruled.tags);
  });

  it("название и описание берутся от модели", () => {
    // Именно это она умеет лучше правил: правила не знают, о чём бит.
    const merged = mergeWithRules(
      { title: "madk1d, villian type beat - Night Vision", description: "Тёмный бит под медленный флоу.", tags: [] },
      ruled,
    );

    expect(merged.title).toBe("madk1d, villian type beat - Night Vision");
    expect(merged.description).toContain("Тёмный бит");
  });

  it("теги модели дописываются в конец, а не в начало", () => {
    /*
     * Правила отсортированы по ценности, и перестановка отдала бы первый
     * байт лимита словам, которые никто не ищет.
     *
     * Проверка на порядок, а не на последний элемент: у этого бита лимит
     * заполнен правилами целиком, и новый тег законно обрезается. Именно
     * поэтому порядок и проверяется — он остаётся верным независимо от того,
     * что влезло.
     */
    const merged = mergeWithRules(
      { title: ruled.title, description: ruled.description, tags: ["extra mood tag", "another one"] },
      ruled,
    );

    expect(merged.tags.slice(0, ruled.tags.length)).toEqual(ruled.tags);

    for (const tag of merged.tags) {
      if (["extra mood tag", "another one"].includes(tag)) {
        expect(merged.tags.indexOf(tag)).toBeGreaterThanOrEqual(ruled.tags.length - 1);
      }
    }
  });

  it("лимит тегов не превышается, сколько бы модель ни вернула", () => {
    const many = Array.from({ length: 60 }, (_, i) => `some generated tag number ${i}`);

    const merged = mergeWithRules({ title: ruled.title, description: ruled.description, tags: many }, ruled);

    expect(tagsLength(merged.tags)).toBeLessThanOrEqual(500);
    expect(merged.tags.length).toBeGreaterThan(5);
  });

  it("модельные теги не дублируют правила", () => {
    const merged = mergeWithRules(
      { title: ruled.title, description: ruled.description, tags: [ruled.tags[0], "совсем новый тег"] },
      ruled,
    );

    expect(merged.tags.filter((tag) => tag === ruled.tags[0])).toHaveLength(1);
  });
});

describe("запрос к модели", () => {
  it("в промпт уходят только известные факты", () => {
    const [system, user] = buildPackageMessages({ beat, template: "nonProfit" });

    expect(system?.content).toContain("JSON");
    expect(user?.content).toContain("madk1d, villian");
    expect(user?.content).toContain("138 BPM");
    expect(user?.content).toContain("только некоммерческое");
  });

  it("модели не отдаётся то, что она обязательно перепутает", () => {
    // Лицензия и кредит собираются правилами: выдуманная лицензия стоит
    // продажи, а лишний «must credit» от модели — претензия к автору.
    const [system] = buildPackageMessages({ beat, template: "paid" });

    expect(system?.content).toContain("не писать «must credit»");
    expect(system?.content).toContain("не писать о лицензии");
  });
});