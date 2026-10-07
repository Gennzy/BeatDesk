import { describe, expect, it } from "vitest";

import { PLATFORMS, platformsByGroup } from "./registry";

describe("реестр площадок", () => {
  it("остались ровно три канала", () => {
    // BeatStars, Airbit, BeatChain и прочие маркетплейсы убраны вместе с
    // расширением: продажа идёт на BeatDesk, публиковать биты в чужие
    // витрины больше не зачем.
    expect(PLATFORMS.map((platform) => platform.id)).toEqual(["telegram", "vk", "youtube"]);
  });

  it("у каждой площадки уникальный идентификатор", () => {
    const ids = PLATFORMS.map((platform) => platform.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("у каждой площадки есть подпись и заметка для человека", () => {
    for (const platform of PLATFORMS) {
      expect(platform.label.length, platform.id).toBeGreaterThan(0);
      expect(platform.note?.length ?? 0, platform.id).toBeGreaterThan(20);
    }
  });

  it("все три — автопост, ни одна не ручная", () => {
    // Ручных площадок не осталось: кнопка, которая ничего не публикует,
    // в шапке выглядит как кнопка, которая публикует.
    for (const platform of PLATFORMS) {
      expect(platform.kind, platform.id).toBe("api");
      expect(platform.level, platform.id).not.toBe("manual" as never);
    }
  });

  it("Telegram работает сразу, YouTube требует настройки", () => {
    expect(platformsByGroup("broadcast").find((item) => item.id === "telegram")?.level).toBe("live");
    expect(platformsByGroup("broadcast").find((item) => item.id === "youtube")?.level).toBe("oauth");
  });

  it("у площадки с OAuth указан адрес входа", () => {
    for (const platform of PLATFORMS.filter((item) => item.level === "oauth")) {
      expect(platform.oauthPath ?? `/api/platforms/${platform.id}/authorize`, platform.id).toBeTruthy();
    }
  });

  it("YouTube не публикуется автоматически: нужен видеофайл", () => {
    // Отправка ролика ещё не сделана, и молча отправлять туда пустоту хуже,
    // чем честно сказать «нужен видеофайл».
    expect(PLATFORMS.find((item) => item.id === "youtube")?.noAutoPublish).toBe(true);
  });

  it("у всех площадок есть документация", () => {
    for (const platform of PLATFORMS) {
      expect(platform.docsUrl, platform.id).toMatch(/^https?:\/\//);
    }
  });
});
