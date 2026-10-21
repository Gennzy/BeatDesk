import { describe, expect, it } from "vitest";

import {
  deliveredFiles,
  hasDeliverables,
  isProductKind,
  MIN_PRICE_MINOR,
  productProblem,
  subjectOf,
} from "./products";

/**
 * Товары: киты, пресеты, услуги.
 *
 * Проверяется не вид, а решения: что товар отдаёт, когда у него ничего
 * отдавать нельзя и как предмет позиции отличается от бита.
 */

const files = { zip: { path: "u/b/kit.zip", name: "kit.zip" } };

describe("что товар отдаёт", () => {
  it("кит отдаёт свой файл", () => {
    expect(deliveredFiles("kit", files)).toHaveLength(1);
    expect(hasDeliverables("kit", files)).toBe(true);
  });

  it("пресет — то же, что и комплект", () => {
    expect(deliveredFiles("preset", files)).toHaveLength(1);
  });

  it("услуга не отдаёт ничего", () => {
    // Услуга — это работа, а не файл. Отдаёт её продавец, когда сделал.
    expect(deliveredFiles("service", files)).toHaveLength(0);
    expect(hasDeliverables("service", files)).toBe(true);
  });

  it("кит без файла отдавать нечем", () => {
    expect(hasDeliverables("kit", {})).toBe(false);
  });
});

describe("вид товара", () => {
  it("известные виды принимаются", () => {
    expect(isProductKind("kit")).toBe(true);
    expect(isProductKind("service")).toBe(true);
  });

  it("неизвестный вид не проходит", () => {
    expect(isProductKind("beat")).toBe(false);
    expect(isProductKind(null)).toBe(false);
  });
});

describe("проверка перед сохранением", () => {
  it("нормальный товар проходит", () => {
    expect(productProblem({ kind: "kit", title: "Луп-кит", priceMinor: 50000, files })).toBeNull();
  });

  it("без названия — понятный отказ", () => {
    expect(productProblem({ kind: "kit", title: "   ", priceMinor: 50000, files })).toMatch(/название/i);
  });

  it("без файла комплект отдавать нечем", () => {
    expect(productProblem({ kind: "kit", title: "Луп-кит", priceMinor: 50000, files: {} })).toMatch(/файл/i);
  });

  it("услуга без файла — нормально", () => {
    expect(productProblem({ kind: "service", title: "Бит под вокал", priceMinor: 500000, files: {} })).toBeNull();
  });

  it("цена меньше рубля — опечатка, а не цена", () => {
    // В копейках один рубль это сто. Меньше — почти наверняка потерянный ноль.
    expect(productProblem({ kind: "kit", title: "Луп-кит", priceMinor: MIN_PRICE_MINOR - 1, files })).toMatch(
      /рубля/i,
    );
  });

  it("бесплатный товар допустим", () => {
    expect(productProblem({ kind: "kit", title: "Луп-кит", priceMinor: 0, files })).toBeNull();
  });
});

describe("предмет позиции", () => {
  it("бит остаётся битом со своим уровнем", () => {
    const subject = subjectOf({ beatId: "b-1", productId: null, tier: "trackout" });

    expect(subject).toEqual({ kind: "beat", beatId: "b-1", tier: "trackout" });
  });

  it("товар отстаёт от бита и несёт свой вид", () => {
    const subject = subjectOf({
      beatId: null,
      productId: "p-1",
      tier: "product",
      product: { kind: "service", title: "Бит под вокал" },
    });

    expect(subject).toEqual({
      kind: "product",
      productId: "p-1",
      productKind: "service",
      title: "Бит под вокал",
    });
  });

  it("пустая позиция не превращается в предмет", () => {
    expect(subjectOf({ beatId: null, productId: null, tier: "mp3" })).toBeNull();
  });
});
