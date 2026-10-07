import { describe, expect, it } from "vitest";

import { COMMISSION_BPS, fromMinor, splitPrice, totalOf } from "./money";

describe("разделение суммы заказа", () => {
  it("20% от 500 ₽ — это 100 ₽ комиссии и 400 ₽ продавцу", () => {
    expect(splitPrice(500)).toEqual({ priceMinor: 50_000, commissionMinor: 10_000, sellerNetMinor: 40_000 });
  });

  it("сумма всегда сходится копейка в копейку", () => {
    // База проверяет это ограничением на уровне таблицы, и несовпадение
    // означало бы, что заказ вообще не создаётся.
    for (const price of [1, 7, 99, 100, 333, 500, 1234, 9999.99]) {
      const split = splitPrice(price);

      expect(split.commissionMinor + split.sellerNetMinor, `${price} ₽`).toBe(split.priceMinor);
    }
  });

  it("целые рубли не разъезжаются", () => {
    for (const price of [100, 250, 500, 1500, 2500, 5000]) {
      const split = splitPrice(price);

      expect(split.commissionMinor, `${price} ₽`).toBe(Math.round(price * 100 * COMMISSION_BPS / 10_000));
    }
  });

  it("цена с копейками переводится в копейки без потерь", () => {
    expect(splitPrice(499.9).priceMinor).toBe(49_990);
    expect(splitPrice(0.01).priceMinor).toBe(1);
  });

  it("бесплатный бит даёт нули, а не отрицательные доли", () => {
    // Цена нулевая означает «не продаётся», и заказ с ней не создаётся.
    // Но если посчитать, отрицательной комиссии быть не должно.
    expect(splitPrice(0)).toEqual({ priceMinor: 0, commissionMinor: 0, sellerNetMinor: 0 });
  });

  it("отрицательная цена отвергается, а не проходит дальше", () => {
    // База такую цену и не примет, но предпросмотр показал бы покупателю
    // выплату продавцу. Лучше явная ошибка на границе ввода.
    expect(() => splitPrice(-100)).toThrow(RangeError);
  });

  it("нечисловая цена отвергается", () => {
    expect(() => splitPrice(Number.NaN)).toThrow(RangeError);
    expect(() => splitPrice(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("комиссию округляем один раз", () => {
    // 333 ₽ → 33300 копеек, 20% = 6660 ровно. А вот 333.33 ₽ даёт дробь,
    // и её надо закрыть, а не оставить базе решать.
    expect(splitPrice(333.33)).toEqual({ priceMinor: 33_333, commissionMinor: 6_667, sellerNetMinor: 26_666 });
  });
});

describe("fromMinor: готовая сумма в копейках", () => {
  it("считает так же, как при умножении на курс", () => {
    expect(fromMinor(50_000)).toEqual({ priceMinor: 50_000, commissionMinor: 10_000, sellerNetMinor: 40_000 });
  });

  it("с копейки берётся комиссия, а не отдаётся вся сумма", () => {
    const split = fromMinor(1);

    // Одна копейка при 20% — это 0,2 копейки. Округление вниз отдало бы
    // продавцу всю копейку и не взяло бы с неё ничего.
    expect(split).toEqual({ priceMinor: 1, commissionMinor: 1, sellerNetMinor: 0 });
  });

  it("сумма в копейках должна быть целой", () => {
    // 12.5 копейки — это не копейки, а опечатка: такое значение означало бы,
    // что кто-то отдал нам float вместо денег.
    expect(() => fromMinor(12.5)).toThrow(RangeError);
    expect(() => fromMinor(-1)).toThrow(RangeError);
  });

  it("ноль комиссии отдаёт всё продавцу", () => {
    expect(fromMinor(50_000, 0)).toEqual({ priceMinor: 50_000, commissionMinor: 0, sellerNetMinor: 50_000 });
  });

  it("комиссия 100% забирает всё", () => {
    expect(fromMinor(50_000, 10_000)).toEqual({ priceMinor: 50_000, commissionMinor: 50_000, sellerNetMinor: 0 });
  });
});

describe("итог по заказу", () => {
  it("складывает позиции", () => {
    const total = totalOf([splitPrice(500), splitPrice(1500), splitPrice(2500)]);

    expect(total).toEqual({ priceMinor: 450_000, commissionMinor: 90_000, sellerNetMinor: 360_000 });
  });

  it("пустой заказ даёт нули", () => {
    expect(totalOf([])).toEqual({ priceMinor: 0, commissionMinor: 0, sellerNetMinor: 0 });
  });

  it("итог нескольких позиций не больше суммы отдельных", () => {
    // Округление по каждой позиции, а не один раз на весь заказ, не должно
    // придумывать деньги: итог сходится копейка в копейку.
    const splits = [splitPrice(333.33), splitPrice(999.99), splitPrice(1)];
    const total = totalOf(splits);

    expect(total.commissionMinor + total.sellerNetMinor).toBe(total.priceMinor);
    expect(total.priceMinor).toBe(splits.reduce((sum, split) => sum + split.priceMinor, 0));
  });
});
