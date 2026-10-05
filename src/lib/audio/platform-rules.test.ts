import { describe, expect, it } from "vitest";

import { PLATFORMS, platformRules } from "./platform-rules";

describe("конфиг требований площадок", () => {
  it("у каждой площадки заполнено поле id и подпись", () => {
    for (const platform of PLATFORMS) {
      expect(platform.label.length, platform.id).toBeGreaterThan(0);
    }
  });

  it("идентификаторы уникальны: иначе правила разных площадок смешаются", () => {
    const ids = PLATFORMS.map((platform) => platform.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("у каждого правила указан статус доверия", () => {
    for (const platform of PLATFORMS) {
      for (const check of platform.checks) {
        expect(["documented", "observed", "unknown"], `${platform.id}: ${check.label}`).toContain(check.trust);
      }
    }
  });

  it("правило со статусом unknown не выдаётся за требование площадки", () => {
    // Неизвестное правило должно быть видно как «неизвестно», иначе
    // битмейкер поверит ему и выложит бит, который не примут.
    for (const platform of PLATFORMS) {
      for (const check of platform.checks.filter((item) => item.trust === "unknown")) {
        expect(check.requirement, `${platform.id}: ${check.label}`).toMatch(/не (включ|опубликован|извест)|неизвестн/i);
      }
    }
  });

  it("документированные правила ссылаются на источник", () => {
    for (const platform of PLATFORMS) {
      for (const check of platform.checks.filter((item) => item.trust === "documented")) {
        expect(check.source, `${platform.id}: ${check.label} без ссылки`).toBeTruthy();
      }
    }
  });

  it("BeatStars: ограничения совпадают с его справкой", () => {
    const rules = platformRules("beatstars");

    expect(rules?.fields.wav?.maxBits).toBe(32);
    expect(rules?.fields.wav?.minBits).toBe(16);
    expect(rules?.fields.wav?.minChannels).toBe(2);
    expect(rules?.fields.mp3?.minKbps).toBe(320);
    expect(rules?.tagLimits).toEqual({ tags: 3, genres: 3, moods: 5 });
    expect(rules?.maxFilesPerUpload).toBe(4);
  });

  it("BeatStars принимает WAV без отдельного тегованного MP3", () => {
    // Иначе заставим битмейкера делать лишний рендер того, что площадка
    // умеет делать сама.
    expect(platformRules("beatstars")?.mp3).toBe("derived");
  });

  it("Airbit и BeatChain не выдумывают аудиоформат", () => {
    for (const id of ["airbit", "beatchain"] as const) {
      expect(platformRules(id)?.fields.wav?.trust, id).toBe("unknown");
      expect(platformRules(id)?.fields.wav?.minBits, id).toBeUndefined();
    }
  });

  it("неизвестная площадка не вызывает исключение, а возвращает пусто", () => {
    expect(platformRules("unknown" as never)).toBeUndefined();
  });
});
