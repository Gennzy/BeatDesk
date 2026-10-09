import { describe, expect, it } from "vitest";

import {
  applyDiscount,
  emptyPrices,
  hasDiscount,
  MAX_DISCOUNT,
  normalizeDiscount,
  normalizePrices,
  parsePrice,
  PRICE_KEYS,
  priceLabel,
  pricesForDb,
  pricesToForm,
} from "./prices";

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

/*
 * Проверяем не «считает ли процент», а то, ради чего он введён: показ и
 * списание не должны разойтись. Поэтому applyDiscount проверяется на
 * границах, где обычно и вылезает расхождение, а не на круглом числе.
 */

const withPrices = (prices: Partial<Record<string, number | null>>) => ({ ...emptyPrices(), ...prices });

describe("скидка на бит", () => {
  it("снижает каждый проданный уровень на процент", () => {
    expect(applyDiscount(withPrices({ mp3: 1000, exclusive: 5000 }), 30)).toEqual({
      mp3: 700,
      wav: null,
      trackout: null,
      exclusive: 3500,
    });
  });

  it("не превращает непродаваемый уровень в нулевую цену", () => {
    // Ноль — это «выставлено бесплатно», и такой уровень молча попал бы в
    // заказ. Отсутствие цены должно остаться отсутствием.
    expect(applyDiscount(withPrices({ mp3: 1000 }), 50).wav).toBeNull();
  });

  it("округляет вниз, чтобы скидка не оказалась меньше обещанной", () => {
    // 10% от 999 — это 99.9. Округление вверх дало бы 900 обещанных и 899
    // списанных: расхождение в рубль в каждом заказе.
    expect(applyDiscount(withPrices({ mp3: 999 }), 10).mp3).toBe(899);
  });

  it("при максимальной скидке не уходит в ноль", () => {
    expect(applyDiscount(withPrices({ mp3: 100 }), MAX_DISCOUNT).mp3).toBe(10);
  });

  it("считает от исходной цены, а не от уже скидочной", () => {
    /*
     * Ключевой инвариант схемы. В базе лежит цена со скидкой: 800 при скидке
     * 20 от 1000. Если бы следующая правка считала скидку от 800, вышло бы
     * 640 — скидка тихо съедала бы сама себя с каждой правкой, и битмейкер
     * увидел бы это только в выручке. Поэтому процент всегда применяется к
     * исходной цене, а форма правит именно её: прежняя лежит рядом, в
     * prices_before.
     */
    const base = withPrices({ mp3: 1000 });

    expect(applyDiscount(base, 20).mp3).toBe(800);
    expect(applyDiscount(base, 40).mp3).toBe(600);
  });

  it("совпадает с формулой, которую проверяет триггер в базе", () => {
    // Расхождение хотя бы на рубли между формой и триггером превратило бы
    // сохранение в ошибку: база отвергала бы честно посчитанную цену.
    expect(applyDiscount(withPrices({ mp3: 1000, trackout: 333 }), 33)).toEqual({
      ...emptyPrices(),
      mp3: 670,
      trackout: 223,
    });
  });

  it("видна покупателю только когда есть процент и что продаётся", () => {
    expect(hasDiscount(withPrices({ mp3: 700 }), 30)).toBe(true);
    expect(hasDiscount(withPrices({ mp3: 700 }), 0)).toBe(false);
    // Иначе витрина покажет скидку на бит, который нельзя купить.
    expect(hasDiscount(emptyPrices(), 30)).toBe(false);
  });

  it("процент из формы приводится к допустимому", () => {
    expect(normalizeDiscount(30)).toBe(30);
    expect(normalizeDiscount("45")).toBe(45);
    // Сто процентов — это подарок, а не скидка: режем до предела.
    expect(normalizeDiscount(150)).toBe(MAX_DISCOUNT);
    expect(normalizeDiscount("")).toBe(0);
    expect(normalizeDiscount("abc")).toBe(0);
    expect(normalizeDiscount(-10)).toBe(0);
  });
});
