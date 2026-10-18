import { describe, expect, it } from "vitest";

import { parseNames, parseTags } from "./tags";

/**
 * Разбор строк из формы.
 *
 * Теги и имена разбираются по-разному, и раньше они делили одну функцию.
 * Тесты ниже — по одному на каждое из двух решений, потому что иначе одно
 * из них снова поедет молча.
 */

describe("разбор тегов", () => {
  it("пробел разделяет теги, как и обещает подпись поля", () => {
    /*
     * Главный баг: «future, lil durk» разбиралось в два тега, и телеграм
     * выдавал #future #lildurk — одно слипшееся слово вместо трёх.
     */
    expect(parseTags("future, lil durk")).toEqual(["future", "lil", "durk"]);
  });

  it("пробелы и запятые равноправны", () => {
    expect(parseTags("dark trap phonk")).toEqual(["dark", "trap", "phonk"]);
    expect(parseTags("dark, trap, phonk")).toEqual(["dark", "trap", "phonk"]);
  });

  it("перенос строки тоже разделяет", () => {
    expect(parseTags("trap\ndark")).toEqual(["trap", "dark"]);
  });

  it("лишние разделители не оставляют пустых тегов", () => {
    expect(parseTags("  dark ,  trap  , ")).toEqual(["dark", "trap"]);
  });

  it("один тег без разделителей читается как есть", () => {
    expect(parseTags("phonk")).toEqual(["phonk"]);
  });

  it("пустая строка не даёт тегов", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe("разбор имён артистов", () => {
  it("пробел внутри имени сохраняется", () => {
    // Регрессия: /[\s,]+/ разрезал «Polo G» на «polo» и «g».
    expect(parseNames("Polo G, Lil Tjay")).toEqual(["Polo G", "Lil Tjay"]);
  });

  it("многобуквенные имена не рассыпаются", () => {
    expect(parseNames("future, lil durk")).toEqual(["future", "lil durk"]);
  });

  it("двойные пробелы внутри имени схлопываются", () => {
    expect(parseNames("Polo   G")).toEqual(["Polo G"]);
  });

  it("хвостовая запятая не оставляет пустой записи", () => {
    expect(parseNames("madk1d,")).toEqual(["madk1d"]);
  });

  it("пустая строка не даёт имён", () => {
    expect(parseNames("")).toEqual([]);
    expect(parseNames(null)).toEqual([]);
  });
});