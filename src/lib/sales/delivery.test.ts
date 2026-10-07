import { describe, expect, it } from "vitest";

import { TIER_FILES, tierAllows, tierLabel } from "./delivery";

describe("что уровень обещает в файлах", () => {
  it("MP3 — только превью", () => {
    expect(TIER_FILES.mp3).toEqual(["mp3"]);
  });

  it("MP3 + WAV добавляет мастер", () => {
    expect(TIER_FILES.bundle).toEqual(["mp3", "wav"]);
  });

  it("Track Out и эксклюзив дают всё", () => {
    expect(TIER_FILES.trackout).toEqual(["mp3", "wav", "stems"]);
    expect(TIER_FILES.exclusive).toEqual(["mp3", "wav", "stems"]);
  });

  it("mp3-уровень не даёт мастер: меньше платить — меньше получать", () => {
    expect(tierAllows("mp3", "wav")).toBe(false);
    expect(tierAllows("mp3", "stems")).toBe(false);
    expect(tierAllows("mp3", "mp3")).toBe(true);
  });

  it("bundle даёт мастер, но не стемы", () => {
    expect(tierAllows("bundle", "wav")).toBe(true);
    expect(tierAllows("bundle", "stems")).toBe(false);
  });

  it("стемы получает только тот, кто за них заплатил", () => {
    // Самая дорогая ошибка выдачи: отдать стемы купившему MP3 за 500 ₽.
    expect(tierAllows("trackout", "stems")).toBe(true);
    expect(tierAllows("exclusive", "stems")).toBe(true);
    expect(tierAllows("bundle", "stems")).toBe(false);
  });

  it("незнакомый уровень не открывает ничего", () => {
    // Приходит из базы, а база защищена check-ограничением. Но если оно
    // когда-нибудь ослабнет, молча отдать файл хуже, чем отказать.
    for (const kind of ["mp3", "wav", "stems"] as const) {
      expect(tierAllows("unknown-tier", kind), kind).toBe(false);
    }
  });
});

describe("подпись уровня", () => {
  it("bundle показывается человеку как MP3 + WAV", () => {
    // В order_items лежит историческое имя из схемы. Покупатель платил за
    // «MP3 + WAV» и должен увидеть его в заказе, а не слово bundle.
    expect(tierLabel("bundle")).toBe("MP3 + WAV");
    expect(tierLabel("mp3")).toBe("MP3");
    expect(tierLabel("trackout")).toBe("Track Out");
    expect(tierLabel("exclusive")).toBe("Эксклюзив");
  });

  it("незнакомый уровень не превращается в пустую строку", () => {
    // Иначе отладить чужой заказ будет нечем: в интерфейсе — пустота.
    expect(tierLabel("mystery")).toBe("mystery");
  });
});
