import { describe, expect, it } from "vitest";

import { hasLicenseTerms, LICENSE_TIERS, MAX_LICENSE_TERMS_LENGTH, normalizeLicenseTerms } from "./licenses";

describe("normalizeLicenseTerms", () => {
  it("возвращает пустой объект для пустого/невалидного ввода", () => {
    expect(normalizeLicenseTerms(null)).toEqual({});
    expect(normalizeLicenseTerms(undefined)).toEqual({});
    expect(normalizeLicenseTerms("text")).toEqual({});
    expect(normalizeLicenseTerms([])).toEqual({});
  });

  it("сохраняет непустые строки по уровням", () => {
    expect(normalizeLicenseTerms({ mp3: "  terms mp3  ", bundle: "terms bundle" })).toEqual({
      mp3: "terms mp3",
      bundle: "terms bundle",
    });
  });

  it("отбрасывает пустые строки", () => {
    expect(normalizeLicenseTerms({ mp3: "   ", bundle: "" })).toEqual({});
  });

  it("отбрасывает слишком длинные строки", () => {
    const long = "a".repeat(MAX_LICENSE_TERMS_LENGTH + 1);
    expect(normalizeLicenseTerms({ mp3: long })).toEqual({});
  });

  it("игнорирует неизвестные ключи и не-строки", () => {
    expect(normalizeLicenseTerms({ mp3: 42, foo: "bar", bundle: "ok" })).toEqual({ bundle: "ok" });
  });
});

describe("hasLicenseTerms", () => {
  it("false для пустого", () => {
    expect(hasLicenseTerms({})).toBe(false);
    expect(hasLicenseTerms(null)).toBe(false);
    expect(hasLicenseTerms(undefined)).toBe(false);
  });

  it("true если есть хотя бы один уровень", () => {
    expect(hasLicenseTerms({ mp3: "x" })).toBe(true);
  });
});

describe("константы", () => {
  it("LICENSE_TIERS содержит четыре уровня", () => {
    expect(LICENSE_TIERS).toEqual(["mp3", "bundle", "trackout", "exclusive"]);
  });
});