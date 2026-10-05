import { describe, expect, it } from "vitest";

import { difference, grantedTiers, licenseText, TIER_ORDER, TIERS, type TierId } from "./licensing";

describe("уровни лицензии", () => {
  it("Track Out — это стемы, а не отдельный формат", () => {
    // Главная путаница: Track Out и stems — одно и то же предложение.
    const trackout = TIERS.trackout;

    expect(trackout.label).toContain("стемы");
    expect(trackout.files.join(" ")).toContain("Дорожки WAV");
  });

  it("все уровни описаны", () => {
    for (const id of TIER_ORDER) {
      expect(TIERS[id].label.length, id).toBeGreaterThan(0);
      expect(TIERS[id].rights.length, id).toBeGreaterThan(0);
      expect(TIERS[id].forbidden.length, id).toBeGreaterThan(0);
    }
  });

  it("каждый уровень включает предыдущий", () => {
    for (let i = 1; i < TIER_ORDER.length; i += 1) {
      const previous = TIER_ORDER[i - 1];
      const current = TIER_ORDER[i];

      expect(TIERS[current].includes, current).toContain(previous);
    }
  });

  it("включения не образуют цикла и не ведут в себя", () => {
    for (const id of TIER_ORDER) {
      expect(TIERS[id].includes, id).not.toContain(id);

      // Общий Set тут не годится: mp3 входит и в wav, и в trackout, и это
      // бридж, а не цикл. Цикл виден только по пути обхода.
      const path = new Set<TierId>([id]);
      const walk = (current: TierId) => {
        for (const next of TIERS[current].includes) {
          expect(path.has(next), `${id}: цикл через ${next}`).toBe(false);
          path.add(next);
          walk(next);
          path.delete(next);
        }
      };
      walk(id);
    }
  });

  it("ни одно право не дословно совпадает с запретом", () => {
    // Самая частая ошибка в лицензиях: разрешить и запретить одно и то же.
    for (const id of TIER_ORDER) {
      for (const right of TIERS[id].rights) {
        for (const rule of TIERS[id].forbidden) {
          expect(rule.includes(right) || right.includes(rule), `${id}: «${right}» / «${rule}»`).toBe(false);
        }
      }
    }
  });

  it("stemы нельзя продавать дальше ни на одном уровне кроме эксклюзива", () => {
    for (const id of TIER_ORDER) {
      const forbidden = TIERS[id].forbidden.join(" ").toLowerCase();
      const sells = forbidden.includes("продав") || forbidden.includes("перепрода");

      expect(sells || id === "exclusive", id).toBe(true);
    }
  });

  it("только эксклюзив передаёт права", () => {
    expect(TIERS.exclusive.transferable).toBe(true);
    for (const id of ["mp3", "wav", "trackout"] as TierId[]) {
      expect(TIERS[id].transferable, id).toBe(false);
    }
  });

  it("уровней ровно четыре", () => {
    expect(TIER_ORDER).toEqual(["mp3", "wav", "trackout", "exclusive"]);
  });
});

describe("что входит в лицензию", () => {
  it("эксклюзив включает всё", () => {
    expect(grantedTiers("exclusive").sort()).toEqual(["exclusive", "mp3", "trackout", "wav"]);
  });

  it("разница между уровнями не пустая", () => {
    expect(difference("mp3", "trackout")).toContain("Track Out (стемы)");
    expect(difference("wav", "mp3")).toEqual([]);
  });
});

describe("текст лицензии", () => {
  it("перечисляет файлы, права и запреты", () => {
    const text = licenseText("trackout");

    expect(text).toContain("Track Out");
    expect(text).toContain("Дорожки WAV");
    expect(text).toContain("Можно:");
    expect(text).toContain("Нельзя:");
  });

  it("запрет пересведения стемов виден покупателю", () => {
    expect(licenseText("trackout")).toContain("как свой трек");
  });

  it("называет, кому принадлежат права", () => {
    expect(licenseText("exclusive")).toContain("переходят");
    expect(licenseText("mp3")).toContain("остаются");
  });
});
