import { describe, expect, it } from "vitest";

import { emptyPrices, normalizePrices, parsePrice, PRICE_KEYS, priceLabel, pricesForDb, pricesToForm } from "./prices";

describe("цены бита", () => {
  it("четыре уровня, и Track Out между WAV и эксклюзивом", () => {
    // Порядок не декоративный: Track Out — это те же стемы.
    expect(PRICE_KEYS).toEqual(["mp3", "wav", "trackout", "exclusive"]);
  });

  it("у каждого уровня своя подпись", () => {
    const labels = PRICE_KEYS.map((key) => priceLabel[key]);
    expect(new Set(labels).size).toBe(PRICE_KEYS.length);
  });

  it("старый бит без новых полей остаётся целым", () => {
    // В базе лежат биты, заведённые до появления уровня WAV и Track Out.
    const prices = normalizePrices({ mp3: 500, bundle: 1500, exclusive: 3500 });

    expect(prices).toEqual({ mp3: 500, wav: 1500, trackout: null, exclusive: 3500 });
  });

  it("пустое и нечисловое — это «не продаётся», а не ноль", () => {
    expect(normalizePrices(null)).toEqual(emptyPrices());
    expect(normalizePrices({})).toEqual(emptyPrices());
    expect(normalizePrices({ mp3: "", wav: null, trackout: undefined })).toEqual(emptyPrices());
  });

  it("нулевая цена не превращается в бесплатный бит", () => {
    expect(normalizePrices({ mp3: 0 }).mp3).toBeNull();
    expect(normalizePrices({ mp3: -100 }).mp3).toBeNull();
  });

  it("цены округляются до целых", () => {
    expect(normalizePrices({ trackout: 2999.6 }).trackout).toBe(3000);
  });

  it("уровень WAV ложится в старую колонку bundle", () => {
    // Колонка называется bundle исторически; переименовывать её нельзя —
    // поедут старые биты.
    expect(pricesForDb({ mp3: 1, wav: 2, trackout: 3, exclusive: 4 })).toEqual({
      mp3: 1,
      bundle: 2,
      trackout: 3,
      exclusive: 4,
    });
  });

  it("форма и база не путают уровни", () => {
    const form = pricesToForm({ mp3: 1, wav: 2, trackout: 3, exclusive: 4 });

    expect(form).toEqual({ priceMp3: 1, priceBundle: 2, priceTrackout: 3, priceExclusive: 4 });
  });

  it("кругом: из формы в базу и обратно ничего не теряется", () => {
    const prices = { mp3: 500, wav: 1500, trackout: 2500, exclusive: 3500 };
    const back = normalizePrices(pricesForDb(prices));

    expect(back).toEqual(prices);
  });
});

describe("parsePrice: цена из поля ввода", () => {
  it("пустое поле значит «не продаётся», а не ноль", () => {
    // Ноль отправил бы проверку по ложному следу: уровень как будто выставлен,
    // и она начала бы требовать файл, который никто не покупает.
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("   ")).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });

  it("ноль и отрицательное — тоже не продажа", () => {
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("-500")).toBeNull();
  });

  it("обычная цена читается как число", () => {
    expect(parsePrice("500")).toBe(500);
    expect(parsePrice(" 1500 ")).toBe(1500);
  });

  it("дробная цена допустима: за неё никто не поспорит", () => {
    expect(parsePrice("499.90")).toBe(499.9);
  });

  it("мусор в поле не превращается в цену", () => {
    // Number("abc") — это NaN, и без проверки он молча уехал бы в базу.
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("Infinity")).toBeNull();
  });
});
