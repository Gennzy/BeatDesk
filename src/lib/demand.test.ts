import { describe, expect, it } from "vitest";

import { coldTags, decayOf, medianPrice, rankTagsByDemand, type DemandRow } from "./demand";

/**
 * Спрос по тегам.
 *
 * Проверяется главное: что в подсказку попадает то, что действительно
 * находят, и что старое не вытесняет свежее.
 */

const NOW = Date.parse("2026-10-18T00:00:00.000Z");

const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const row = (tags: string[], plays: number, days = 1): DemandRow => ({
  tags,
  plays,
  createdAt: daysAgo(days),
});

describe("затухание по возрасту", () => {
  it("свежий бит весит полностью", () => {
    expect(decayOf(daysAgo(0), NOW)).toBeCloseTo(1, 5);
  });

  it("полгода — вдвое меньше", () => {
    // Половинный срок жизни 60 дней: за 60 дней вес вдвое, за 120 — вчетверо.
    expect(decayOf(daysAgo(60), NOW)).toBeCloseTo(0.5, 3);
    expect(decayOf(daysAgo(120), NOW)).toBeCloseTo(0.25, 3);
  });

  it("бит из будущего не теряет вес", () => {
    expect(decayOf(daysAgo(-10), NOW)).toBe(1);
  });

  it("битая дата не ломает расчёт", () => {
    expect(decayOf("не дата", NOW)).toBe(0);
  });
});

describe("теги по спросу", () => {
  it("побеждает тег, который нашли больше", () => {
    const demand = rankTagsByDemand(
      [row(["trap"], 100), row(["ambient"], 5)],
      10,
      NOW,
    );

    expect(demand[0].tag).toBe("trap");
    expect(demand[0].plays).toBe(100);
  });

  it("тег без прослушиваний не попадает в подсказку", () => {
    // По нему не приходят, и занимать им место в описании незачем.
    const demand = rankTagsByDemand([row(["rare"], 0), row(["trap"], 50)], 10, NOW);

    expect(demand.map((item) => item.tag)).toEqual(["trap"]);
  });

  it("старый бит уступает свежему", () => {
    const demand = rankTagsByDemand(
      [row(["old"], 100, 400), row(["new"], 40, 1)],
      10,
      NOW,
    );

    // За 400 дней вес падает в шестнадцать раз: 100 прослушиваний проигрывают
    // 40 свежих.
    expect(demand[0].tag).toBe("new");
  });

  it("считает, сколько битов носят тег", () => {
    const demand = rankTagsByDemand([row(["trap"], 10), row(["trap"], 20)], 10, NOW);

    expect(demand[0].beats).toBe(2);
    expect(demand[0].plays).toBe(30);
  });

  it("регистр и решётка не мешают", () => {
    const demand = rankTagsByDemand([row(["#Trap", "TRAP"], 10)], 10, NOW);

    expect(demand).toHaveLength(1);
    expect(demand[0].tag).toBe("trap");
  });

  it("список ограничен по длине", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row([`tag${i}`], i + 1));

    expect(rankTagsByDemand(rows, 5, NOW)).toHaveLength(5);
  });

  it("пустой список не ломает расчёт", () => {
    expect(rankTagsByDemand([], 10, NOW)).toEqual([]);
  });
});

describe("холодные теги", () => {
  it("тег без спроса попадает в список", () => {
    const rows = [row(["trap"], 50), row(["useless"], 0)];
    const warm = rankTagsByDemand(rows, 10, NOW);

    expect(coldTags(rows, warm, 10)).toEqual(["useless"]);
  });

  it("горячий тег в холодные не попадает", () => {
    const rows = [row(["trap"], 50)];
    const warm = rankTagsByDemand(rows, 10, NOW);

    expect(coldTags(rows, warm, 10)).toEqual([]);
  });
});

describe("медианная цена", () => {
  it("берёт середину, а не среднее", () => {
    // 100, 100, 100, 5000: среднее 1325, медиана 100. Среднее показывало бы
    // битмейкеру неправду о его жанре.
    expect(medianPrice([100, 100, 100, 5000])).toBe(100);
  });

  it("у чётного количества берёт среднее двух средних", () => {
    expect(medianPrice([100, 200, 300, 400])).toBe(250);
  });

  it("нулевые цены не считаются", () => {
    expect(medianPrice([0, 500])).toBe(500);
  });

  it("без цен медианы нет", () => {
    expect(medianPrice([0, null])).toBeNull();
    expect(medianPrice([])).toBeNull();
  });
});
