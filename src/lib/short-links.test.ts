import { describe, expect, it } from "vitest";

import { CODE_LENGTH, isCode, isSafeTarget, newCode, normalizeTarget, shortUrl } from "./short-links";

describe("код короткой ссылки", () => {
  it("нужной длины и из читаемых символов", () => {
    const code = newCode();

    expect(code).toHaveLength(CODE_LENGTH);
    expect(isCode(code)).toBe(true);
  });

  it("без похожих знаков: 0/o и 1/l/l не путаются при диктовке", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(newCode()).not.toMatch(/[oil]/);
    }
  });

  it("два кода подряд не совпадают", () => {
    const codes = new Set(Array.from({ length: 500 }, () => newCode()));

    expect(codes.size).toBe(500);
  });

  it("мусор кодом не считается", () => {
    // Код попадает в путь запроса: без проверки в таблицу уехала бы чушь.
    for (const value of ["", "short", "ABC123", "toolongcode", "../../etc", "abc def", null, 42]) {
      expect(isCode(value), String(value)).toBe(false);
    }
  });
});

describe("куда ведёт ссылка", () => {
  it("только наши пути", () => {
    expect(isSafeTarget("/beats/123")).toBe(true);
    expect(isSafeTarget("/beatmakers/gennzy")).toBe(true);
  });

  it("на чужой сайт не пускает", () => {
    // Через короткую ссылку можно было бы сделать подмену: человек думает,
    // что его привели к нам.
    expect(isSafeTarget("https://example.com")).toBe(false);
    expect(isSafeTarget("//example.com")).toBe(false);
    expect(isSafeTarget("example.com")).toBe(false);
    expect(isSafeTarget("")).toBe(false);
  });

  it("слишком длинный путь отбрасывается", () => {
    expect(isSafeTarget(`/${"a".repeat(400)}`)).toBe(false);
  });

  it("слеш в конце убирается, чтобы адрес не двоился", () => {
    expect(normalizeTarget("/beats/123/")).toBe("/beats/123");
    expect(normalizeTarget("/")).toBe("/");
  });
});

describe("адрес для показа", () => {
  it("состоит из адреса сайта и кода", () => {
    expect(shortUrl("abc2345", "https://beatdesk.vercel.app")).toBe("https://beatdesk.vercel.app/s/abc2345");
  });

  it("лишний слеш у сайта не двоит адрес", () => {
    expect(shortUrl("abc2345", "https://beatdesk.vercel.app/")).toBe("https://beatdesk.vercel.app/s/abc2345");
  });
});