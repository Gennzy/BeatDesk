import { describe, expect, it } from "vitest";

import { weekStartMonday, type BeatmakerStats } from "./achievements";
import { computeWeekly, isWeeklyVerified, weeklyDone } from "./weekly";

/**
 * Задания недели.
 *
 * Проверяется арифметика, а не база: понедельник считается в UTC, задания
 * собираются из недельных счётчиков, а значок держится на трёх из четырёх.
 * Сами счётчики собирает collectBeatmakerStats — там запросы, их гоняет e2e.
 */

const stats = (over: Partial<BeatmakerStats> = {}): BeatmakerStats => ({
  registeredAt: new Date(0).toISOString(),
  beatsOnSale: 0,
  beatsTotal: 0,
  plays: 0,
  ordersPaid: 0,
  beatsWithStems: 0,
  beatsWithAllTiers: 0,
  postsPublished: 0,
  reviews: 0,
  followers: 0,
  weekStart: weekStartMonday(),
  weekBeats: 0,
  weekPosts: 0,
  weekSales: 0,
  weekPlays: 0,
  ...over,
});

describe("начало недели", () => {
  it("понедельник — сам понедельник 00:00 UTC", () => {
    // 2026-10-12 — понедельник.
    expect(weekStartMonday(Date.UTC(2026, 9, 12, 15, 30))).toBe("2026-10-12T00:00:00.000Z");
  });

  it("воскресенье относится к тому же понедельнику", () => {
    expect(weekStartMonday(Date.UTC(2026, 9, 18, 23, 59))).toBe("2026-10-12T00:00:00.000Z");
  });

  it("следующий понедельник начинает новую неделю", () => {
    expect(weekStartMonday(Date.UTC(2026, 9, 19, 0, 0))).toBe("2026-10-19T00:00:00.000Z");
  });
});

describe("задания недели", () => {
  it("пустая неделя — ничего не закрыто", () => {
    const missions = computeWeekly(stats());

    expect(missions).toHaveLength(4);
    expect(weeklyDone(missions)).toBe(0);
    expect(isWeeklyVerified(missions)).toBe(false);
  });

  it("три бита, три поста и продажа закрывают три задания", () => {
    const missions = computeWeekly(stats({ weekBeats: 3, weekPosts: 5, weekSales: 1, weekPlays: 42 }));

    expect(weeklyDone(missions)).toBe(3);
    expect(isWeeklyVerified(missions)).toBe(true);
  });

  it("два задания значка не дают", () => {
    const missions = computeWeekly(stats({ weekBeats: 10, weekPosts: 10 }));

    expect(weeklyDone(missions)).toBe(2);
    expect(isWeeklyVerified(missions)).toBe(false);
  });

  it("продажа для значка не обязательна", () => {
    // Неделя без продаж не снимает значок у того, кто выкладывает биты,
    // ведёт ленту и его слушают: продажа зависит не только от продавца.
    const missions = computeWeekly(stats({ weekBeats: 3, weekPosts: 3, weekPlays: 300 }));

    expect(weeklyDone(missions)).toBe(3);
    expect(isWeeklyVerified(missions)).toBe(true);
  });

  it("счётчики не уходят ниже нуля", () => {
    const missions = computeWeekly(stats({ weekBeats: -2 }));

    expect(missions[0].current).toBe(0);
    expect(missions[0].done).toBe(false);
  });
});
