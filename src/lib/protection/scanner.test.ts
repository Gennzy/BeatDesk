import { describe, expect, it } from "vitest";

import { confidentMatches, MIN_CONFIDENCE, nullScanner, type ScanMatch } from "./scanner";

/**
 * Сканер площадок.
 *
 * Проверяется главное правило отчёта: совпадение ниже порога — это не
 * находка. Бит простая вещь, и половина треков в жанре похожа на него по
 * первому сорока секундам.
 */

const match = (over: Partial<ScanMatch> = {}): ScanMatch => ({
  platform: "spotify",
  externalId: "track-1",
  title: "Трек",
  artist: "Артист",
  releaseDate: "2026-01-01",
  label: null,
  upc: null,
  isrc: null,
  confidence: 100,
  url: null,
  envelope: null,
  ...over,
});

describe("отбор находок", () => {
  it("уверенные находки проходят", () => {
    expect(confidentMatches([match({ confidence: 95 })])).toHaveLength(1);
  });

  it("слабые совпадения отбрасываются", () => {
    // Слабое совпадение в отчёте вреднее отсутствия: человек увидит чужой
    // трек и решит, что его обокрали.
    expect(confidentMatches([match({ confidence: 40 })])).toHaveLength(0);
  });

  it("порог по умолчанию разумный", () => {
    expect(MIN_CONFIDENCE).toBeGreaterThanOrEqual(60);
  });

  it("порог можно задать", () => {
    expect(confidentMatches([match({ confidence: 50 })], 50)).toHaveLength(1);
  });
});

describe("сканер-заглушка", () => {
  it("говорит, что движок не подключён, а не молчит", async () => {
    // Молчащий сканер опаснее отсутствующего: отчёт «находок нет» выглядит
    // как результат проверки, а на деле проверки не было.
    const scanner = nullScanner();

    await expect(scanner.scan({
      beatId: "b-1",
      envelope: "",
      title: "Бит",
      artists: [],
      platforms: ["spotify"],
    })).rejects.toThrow(/не подключён/);
  });
});
