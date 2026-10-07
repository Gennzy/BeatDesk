import { describe, expect, it } from "vitest";

import { parseTags } from "./tags";

describe("разбор строки тегов", () => {
  it("имена с пробелом остаются целыми", () => {
    // Регрессия: /[\s,]+/ разрезал «Polo G» на «polo» и «g».
    expect(parseTags("Polo G, Lil Tjay")).toEqual(["Polo G", "Lil Tjay"]);
  });

  it("запятая и перенос строки разделяют записи", () => {
    expect(parseTags("trap, dark\nboom bap")).toEqual(["trap", "dark", "boom bap"]);
  });

  it("лишние пробелы схлопываются, а не режут запись", () => {
    expect(parseTags("  dark   trap  ")).toEqual(["dark trap"]);
  });

  it("пустая строка не даёт тегов", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });

  it("хвостовые запятые не оставляют пустых записей", () => {
    expect(parseTags("trap, dark,")).toEqual(["trap", "dark"]);
  });

  it("один тег без разделителей читается как есть", () => {
    expect(parseTags("phonk")).toEqual(["phonk"]);
  });
});