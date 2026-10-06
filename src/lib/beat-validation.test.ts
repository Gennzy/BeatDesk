import { describe, expect, it } from "vitest";

import {
  MAX_PRICE,
  MAX_TAGS,
  MIN_TAG_LENGTH,
  normalizeKey,
  normalizePrices,
  normalizeTags,
} from "./beat-validation";

describe("теги бита", () => {
  it("убирает решётку и приводит к нижнему регистру", () => {
    // Теги пишут с решёткой по привычке, а хранятся без неё.
    expect(normalizeTags(["#Slayr", "PITTKIID"])).toEqual(["slayr", "pittkiid"]);
  });

  it("однобуквенные теги не проходят", () => {
    // На карточке Get Money стоял «#G»: он ничего не ищет, но площадка
    // показывает его как жанр.
    expect(normalizeTags(["g", "G", "#g", "x"])).toEqual([]);
    expect(normalizeTags(["g", "trap"])).toEqual(["trap"]);
  });

  it("двухбуквенные теги остаются", () => {
    expect(normalizeTags(["dj", "ed"])).toEqual(["dj", "ed"]);
    expect(MIN_TAG_LENGTH).toBe(2);
  });

  it("теги не содержат решётку", () => {
    // Решётка в теге превращалась бы в обычный текст при выводе.
    expect(normalizeTags(["#trap"])).not.toContain("#");
  });

  it("теги не содержат символы", () => {
    // Мелочи вроде «trap!» плодят отдельные жанры в выдаче площадок.
    expect(normalizeTags(["trap!", "boom-bap", "a*b", "g#minor", "полный текст"])).toEqual(["boom-bap", "полный текст"]);
  });

  it("теги сохраняют пробелы и дефисы: они разделяют слова", () => {
    expect(normalizeTags(["boom bap", "drill uk"])).toEqual(["boom bap", "drill uk"]);
  });

  it("дубли схлопываются без учёта регистра", () => {
    expect(normalizeTags(["Trap", "trap", "TRAP"])).toEqual(["trap"]);
  });

  it("пустое и не-массив отбрасываются", () => {
    expect(normalizeTags([])).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags("trap")).toEqual([]);
  });

  it("числа не становятся тегами: это темп", () => {
    expect(normalizeTags(["140", "166"])).toEqual([]);
  });

  it("слишком много тегов обрезается до лимита", () => {
    const many = Array.from({ length: 30 }, (_, index) => `тег ${index}`);

    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });

  it("тег длиннее лимита обрезается, а не отбрасывается", () => {
    const long = "x".repeat(40);

    expect(normalizeTags([long])[0]).toHaveLength(24);
  });
});

describe("тональность бита", () => {
  it("читает обычную запись", () => {
    expect(normalizeKey("A# minor")).toBe("A# minor");
    // Лад заглавными разбирается: иначе человек теряет тональность молча.
    expect(normalizeKey("f# MAJOR")).toBe("F# major");
    expect(normalizeKey("A# MINOR")).toBe("A# minor");
    expect(normalizeKey("C Minor")).toBe("C minor");
  });

  it("не путает мажор с минором", () => {
    expect(normalizeKey("C minor")).toBe("C minor");
    expect(normalizeKey("C major")).toBe("C major");
  });

  it("несуществующая тональность отбрасывается", () => {
    // Несуществующая тональность в фильтре площадки отсекает бит целиком.
    expect(normalizeKey("H major")).toBeNull();
    expect(normalizeKey("")).toBeNull();
    expect(normalizeKey(null)).toBeNull();
  });

  it("решётка и бемоль читаются", () => {
    // Обе формы есть в списке тональностей, обе понимаются площадками.
    expect(normalizeKey("G# minor")).toBe("G# minor");
    expect(normalizeKey("A♯ minor")).toBe("A# minor");
  });

  it("бемоль у не той ноты отбрасывается", () => {
    // В списке тональностей Gb нет, только G#. Тихая подмена звука опаснее
    // отказа: фильтр площадки не найдёт бит по несуществующей тональности.
    expect(normalizeKey("E b minor")).toBeNull();
    expect(normalizeKey("B# major")).toBeNull();
  });
});

describe("цены бита", () => {
  it("уровень WAV лежит в старом поле bundle", () => {
    // Колонка так называется исторически, и переименовывать её нельзя.
    expect(normalizePrices({ mp3: 500, bundle: 1500, exclusive: 3500 })).toEqual({
      mp3: 500,
      wav: 1500,
      trackout: null,
      exclusive: 3500,
    });
  });

  it("уровень Track Out читается и без старых полей", () => {
    expect(normalizePrices({ mp3: 500, trackout: 2500 })).toMatchObject({ trackout: 2500 });
  });

  it("ноль не превращается в бесплатный бит", () => {
    expect(normalizePrices({ mp3: 0 }).mp3).toBeNull();
  });

  it("цена выше потолка отбрасывается, а не режется", () => {
    // Обрезанная цена выглядит как настоящая и обманывает покупателя.
    expect(normalizePrices({ mp3: MAX_PRICE + 1 }).mp3).toBeNull();
  });

  it("пустые строки — это «не продаётся»", () => {
    expect(normalizePrices({ mp3: "", wav: null, trackout: undefined })).toEqual({
      mp3: null,
      wav: null,
      trackout: null,
      exclusive: null,
    });
  });

  it("не объект — пустые цены", () => {
    expect(normalizePrices(null)).toEqual({ mp3: null, wav: null, trackout: null, exclusive: null });
    expect(normalizePrices("500")).toEqual({ mp3: null, wav: null, trackout: null, exclusive: null });
  });
});