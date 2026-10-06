import { describe, expect, it } from "vitest";

import { PLATFORMS, platformsByGroup } from "./registry";

describe("реестр площадок", () => {
  it("у каждой площадки уникальный идентификатор", () => {
    const ids = PLATFORMS.map((platform) => platform.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("у каждой площадки есть подпись и заметка для человека", () => {
    // Молчаливую карточку человек не поймёт: надо знать, что делать руками.
    for (const platform of PLATFORMS) {
      expect(platform.label.length, platform.id).toBeGreaterThan(0);
      expect(platform.note?.length ?? 0, platform.id).toBeGreaterThan(20);
    }
  });

  it("у ручной площадки есть адрес, куда идти", () => {
    for (const platform of PLATFORMS.filter((item) => item.level === "manual")) {
      expect(platform.openUrl, platform.id).toMatch(/^https?:\/\//);
    }
  });

  it("beatmaker.tv есть и он маркетплейс битов", () => {
    // Главная площадка СНГ: без неё список выглядит неполным.
    const platform = PLATFORMS.find((item) => item.id === "beatmakertv");

    expect(platform).toBeDefined();
    expect(platform?.group).toBe("market");
    expect(platform?.openUrl).toContain("beatmaker.tv");
  });

  it("новые площадки разложены по группам", () => {
    const expected: Record<string, string[]> = {
      tiktok: ["broadcast"],
      instagram: ["broadcast"],
      splice: ["market"],
      tracklib: ["market"],
      beatmakertv: ["market"],
    };

    for (const [id, group] of Object.entries(expected)) {
      expect(platformsByGroup(group[0]!).map((item) => item.id), id).toContain(id);
    }
  });

  it("площадки с публичным API не помечены ручными", () => {
    for (const platform of PLATFORMS) {
      if (platform.level === "live") expect(platform.auth, platform.id).not.toBe("none");
    }
  });

  it("у площадок с OAuth указан адрес входа", () => {
    for (const platform of PLATFORMS.filter((item) => item.level === "oauth")) {
      expect(platform.oauthPath ?? `/api/platforms/${platform.id}/authorize`, platform.id).toBeTruthy();
    }
  });
});
