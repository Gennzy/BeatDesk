import { describe, expect, it } from "vitest";

import { normalizeTier, priceKey, TIERS, tierPrice } from "./tier";

/**
 * Уровень лицензии — это место, где интерфейс и база называют одно и то же
 * разными словами. Интерфейс говорит «wav», колонка цен хранит «bundle».
 *
 * Если правило разойдётся, ошибка вылезет не сразу: бит с ключом «wav»
 * найдётся, показывать будет нечего, и человек обнаружит это при оплате.
 * Поэтому здесь проверяется именно соответствие двух имён.
 */

describe("уровень лицензии", () => {
  it("уровень из базы не меняется", () => {
    for (const tier of TIERS) {
      expect(normalizeTier(tier)).toBe(tier);
    }
  });

  it("wav из интерфейса становится bundle в базе", () => {
    // Ключевой случай: цена лежит в prices ->> 'bundle'. Если сюда отдать
    // 'wav', поиск цены вернёт пустоту и уровень молча выпадет из продажи.
    expect(normalizeTier("wav")).toBe("bundle");
  });

  it("обратное преобразование возвращает название для интерфейса", () => {
    expect(priceKey("bundle")).toBe("wav");
    expect(priceKey("mp3")).toBe("mp3");
    expect(priceKey("trackout")).toBe("trackout");
    expect(priceKey("exclusive")).toBe("exclusive");
  });

  it("регистр и пробелы не имеют значения", () => {
    expect(normalizeTier(" WAV ")).toBe("bundle");
    expect(normalizeTier("MP3")).toBe("mp3");
  });

  it("чужое значение отвергается, а не проходит как есть", () => {
    // Иначе уровень из ручной правки запроса дошёл бы до заказа.
    expect(normalizeTier("master")).toBeNull();
    expect(normalizeTier("")).toBeNull();
    expect(normalizeTier(null)).toBeNull();
    expect(normalizeTier(42)).toBeNull();
    expect(priceKey("wav")).toBeNull();
  });
});

describe("цена уровня", () => {
  const prices = { mp3: 500, bundle: 1500, trackout: null, exclusive: 0 };

  it("берётся по имени уровня из базы", () => {
    expect(tierPrice(prices, "bundle")).toBe(1500);
    expect(tierPrice(prices, "mp3")).toBe(500);
  });

  it("непродаваемый уровень — это null, а не ноль", () => {
    // Ноль означал бы «выставлено бесплатно» и попал бы в заказ как цена.
    expect(tierPrice(prices, "trackout")).toBeNull();
    expect(tierPrice(prices, "exclusive")).toBeNull();
  });

  it("мусор в цене не становится ценой", () => {
    expect(tierPrice({ mp3: "abc" }, "mp3")).toBeNull();
    expect(tierPrice({ mp3: "" }, "mp3")).toBeNull();
    expect(tierPrice({ mp3: -100 }, "mp3")).toBeNull();
    expect(tierPrice(null, "mp3")).toBeNull();
    expect(tierPrice(undefined, "mp3")).toBeNull();
  });
});