import { describe, expect, it } from "vitest";

import { parseOrderItems } from "./order-items";

/**
 * Разбор позиций заказа повторяет логику маршрута: корзина и покупка со
 * страницы бита приходят в одно поле разными видами, и ошибка здесь
 * обнаружилась бы в момент оплаты — заказ либо создан не с тем битом,
 * либо не создан вовсе.
 */

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

describe("позиции заказа", () => {
  it("одиночная покупка со страницы бита остаётся одиночной", () => {
    // Старый путь не должен сломаться: пара beatId + tier приходит без
    // поля items, и разбор обязан её понять.
    const result = parseOrderItems({ beatId: A, tier: "mp3" });

    expect(result).toEqual([{ beat_id: A, tier: "mp3" }]);
  });

  it("корзина превращается в список позиций", () => {
    const result = parseOrderItems({ items: [{ beatId: A, tier: "mp3" }, { beatId: B, tier: "wav" }] });

    expect(result).toEqual([
      { beat_id: A, tier: "mp3" },
      { beat_id: B, tier: "bundle" },
    ]);
  });

  it("повтор одного бита отбрасывается", () => {
    /*
     * Дубль не пропускается и не падает: create_order берёт цены на момент
     * оплаты, и два одинаковых бита в заказе — это две позиции по одной
     * цене, то есть лишняя сумма.
     */
    const result = parseOrderItems({ items: [{ beatId: A, tier: "mp3" }, { beatId: A, tier: "wav" }] });

    expect(result).toEqual([{ beat_id: A, tier: "mp3" }]);
  });

  it("неверный уровень останавливает заказ, а не выкидывает позицию", () => {
    // Если молча отбросить такую позицию, человек оплатит не то, что видел.
    const result = parseOrderItems({ items: [{ beatId: A, tier: "mp3" }, { beatId: B, tier: "master" }] });

    expect(result).toEqual({ error: "Неизвестный уровень" });
  });

  it("пустой заказ отвергается", () => {
    expect(parseOrderItems({ items: [] })).toEqual({ error: "Нужны позиции заказа" });
    // Пустая пара — это не «нет позиций», а «нет бита»: отличать нужно,
    // потому что первое про корзину, второе про покупку с бита.
    expect(parseOrderItems({})).toEqual({ error: "Нужен бит" });
  });

  it("мусор в списке позиций не превращается в заказ", () => {
    // Мусор отфильтровывается, и если не остаётся ничего — это «нужны
    // позиции», а не «нужен бит».
    expect(parseOrderItems({ items: [null, "бит"] })).toEqual({ error: "Нужны позиции заказа" });
    expect(parseOrderItems({ items: [{ tier: "mp3" }] })).toEqual({ error: "Нужен бит" });
  });
});