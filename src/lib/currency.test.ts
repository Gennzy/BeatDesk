import { describe, expect, it } from "vitest";

import { CURRENCIES, DEFAULT_CURRENCY, currencySymbol, formatAmount, formatMoney, isCurrency } from "@/lib/currency";

describe("isCurrency", () => {
  it("принимает только поддерживаемые коды", () => {
    for (const { code } of CURRENCIES) expect(isCurrency(code)).toBe(true);
  });

  it("отсекает мусор, который приходит из базы и форм", () => {
    for (const value of ["rub", "RUB ", "", null, undefined, 42, "BTC", "RUR"]) {
      expect(isCurrency(value)).toBe(false);
    }
  });
});

describe("currencySymbol", () => {
  it("возвращает символ валюты", () => {
    expect(currencySymbol("RUB")).toBe("₽");
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
  });

  it("откатывается на рубли, а не рисует пустоту", () => {
    expect(currencySymbol(null)).toBe("₽");
    expect(currencySymbol("BTC")).toBe("₽");
  });
});

describe("formatMoney", () => {
  it("пустая цена не превращается в ноль", () => {
    expect(formatMoney(null, "RUB")).toBe("");
    expect(formatMoney(undefined, "RUB")).toBe("");
    expect(formatMoney(Number.NaN, "RUB")).toBe("");
  });

  it("разделяет разряды и ставит символ", () => {
    // Пробелы неразрывные, поэтому сравниваем их коды, а не глазками:
    // иначе тест молча проходит и на обычном пробеле.
    expect(formatMoney(500, "RUB")).toBe("500 ₽");
    expect(formatMoney(1500, "RUB")).toBe("1 500 ₽");
    expect(formatMoney(25, "USD")).toBe("25 $");
    expect(formatMoney(199, "EUR")).toBe("199 €");
  });

  it("не даёт разорвать строку между суммой и символом", () => {
    // Обычный пробел переносится по строкам, и получается «199» + «€».
    // Перед символом валюты должен стоять неразрывный пробел.
    for (const code of ["RUB", "USD", "EUR"]) {
      const money = formatMoney(199, code);
      expect(money, code).toMatch(/[   ]/u);
      expect(money, code).not.toMatch(/ €$/u);
    }
  });

  it("ноль показывает как ноль, а не как пустоту", () => {
    expect(formatMoney(0, "RUB")).toBe("0 ₽");
  });
});

describe("formatAmount", () => {
  it("короткий вид без символа", () => {
    expect(formatAmount(1500)).toBe("1 500");
  });

  it("пустое значение остаётся пустым", () => {
    expect(formatAmount(null)).toBe("");
  });
});

describe("DEFAULT_CURRENCY", () => {
  it("совпадает с первой валютой в списке", () => {
    expect(DEFAULT_CURRENCY).toBe(CURRENCIES[0].code);
  });
});
