import { describe, expect, it } from "vitest";

import {
  computeAchievements,
  fullDays,
  nextAchievement,
  progress,
  unlockedCount,
  type BeatmakerStats,
} from "./achievements";

const DAY = 86_400_000;

/** Стартовая точка: ничего не открыто, кроме регистрации. */
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
  ...over,
});

const at = (days: number) => days * DAY;

describe("время на площадке", () => {
  it("считает полные сутки, а не календарные дни", () => {
    const start = new Date(0).toISOString();

    expect(fullDays(start, DAY * 29 + DAY - 1)).toBe(29);
    expect(fullDays(start, DAY * 30)).toBe(30);
  });

  it("регистрация в будущем не даёт отрицательного стажа", () => {
    // Часы на сервере и в браузере могут отличаться: день назад рождается
    // профиль, если у человека сбились часы. Отрицательный стаж в профиле
    // выглядит как поломка.
    const start = new Date(5 * DAY).toISOString();

    expect(fullDays(start, DAY)).toBe(0);
  });

  it("битая дата не превращается в NaN", () => {
    expect(fullDays("не дата", DAY)).toBe(0);
  });
});

describe("достижения", () => {
  it("на пустом битмейкере не взято ничего", () => {
    const list = computeAchievements(stats(), at(1));

    expect(unlockedCount(list)).toBe(0);
  });

  it("первый бит берёт достижение", () => {
    const list = computeAchievements(stats({ beatsTotal: 1 }), at(1));

    expect(list.find((a) => a.id === "first-beat")?.unlocked).toBe(true);
  });

  it("бит в черновике тоже считается битом", () => {
    // Человек загрузил, но ещё не выставил: работа сделана, достижение
    // за неё выдавать рано.
    const list = computeAchievements(stats({ beatsTotal: 3, beatsOnSale: 0 }), at(1));

    expect(list.find((a) => a.id === "first-beat")?.current).toBe(3);
  });

  it("порог не перескакивает: 999 прослушиваний не берут тысячу", () => {
    const list = computeAchievements(stats({ plays: 999 }), at(1));

    expect(list.find((a) => a.id === "plays-1k")?.unlocked).toBe(false);
    expect(list.find((a) => a.id === "plays-1k")?.current).toBe(999);
  });

  it("ровно порог — взято", () => {
    const list = computeAchievements(stats({ plays: 1_000 }), at(1));

    expect(list.find((a) => a.id === "plays-1k")?.unlocked).toBe(true);
  });

  it("первая продажа и двадцать пять считаются отдельно", () => {
    const list = computeAchievements(stats({ ordersPaid: 25 }), at(1));

    expect(list.find((a) => a.id === "first-sale")?.unlocked).toBe(true);
    expect(list.find((a) => a.id === "sales-25")?.unlocked).toBe(true);
  });

  it("год на площадке берётся на 365 сутках", () => {
    expect(computeAchievements(stats(), at(364)).find((a) => a.id === "days-365")?.unlocked).toBe(false);
    expect(computeAchievements(stats(), at(365)).find((a) => a.id === "days-365")?.unlocked).toBe(true);
  });

  it("дорожки считаются отдельно от битов", () => {
    const list = computeAchievements(stats({ beatsTotal: 20, beatsWithStems: 2 }), at(1));

    expect(list.find((a) => a.id === "beats-10")?.unlocked).toBe(true);
    expect(list.find((a) => a.id === "stems-10")?.unlocked).toBe(false);
  });
});

describe("прогресс до следующего", () => {
  it("первый порог считается от нуля", () => {
    const list = computeAchievements(stats({ beatsTotal: 0 }), at(1));
    const first = list.find((a) => a.id === "first-beat")!;

    expect(progress(first)).toBe(0);
  });

  it("взятое достижение всегда полное", () => {
    const list = computeAchievements(stats({ beatsTotal: 50 }), at(1));

    for (const achievement of list.filter((a) => a.unlocked)) {
      expect(progress(achievement), achievement.id).toBe(1);
    }
  });

  it("между порогами прогресс идёт от предыдущего, а не от нуля", () => {
    // Иначе 9 битов из 10 показывали бы 90% рядом с «первый бит взят»,
    // и человек не понимал бы, сколько ещё осталось.
    const list = computeAchievements(stats({ beatsTotal: 5 }), at(1));
    const ten = list.find((a) => a.id === "beats-10")!;

    expect(progress(ten)).toBeCloseTo(0.5, 5);
  });

  it("прогресс не выходит за единицу и не уходит в минус", () => {
    const list = computeAchievements(stats({ beatsTotal: 9_999 }), at(1));

    for (const achievement of list) {
      const value = progress(achievement);
      expect(value, achievement.id).toBeGreaterThanOrEqual(0);
      expect(value, achievement.id).toBeLessThanOrEqual(1);
    }
  });

  it("когда всё взято, следующего нет", () => {
    const list = computeAchievements(
      stats({
        beatsTotal: 100,
        plays: 10_000,
        ordersPaid: 25,
        beatsWithStems: 10,
        beatsWithAllTiers: 1,
        postsPublished: 1,
        reviews: 10,
        followers: 10,
      }),
      at(400),
    );

    expect(nextAchievement(list)).toBeNull();
    expect(unlockedCount(list)).toBe(list.length);
  });

  it("следующее выбирается ближайшее по порогу", () => {
    const list = computeAchievements(stats({ beatsTotal: 1, plays: 500 }), at(1));
    const next = nextAchievement(list);

    expect(next).not.toBeNull();
    expect(next!.unlocked).toBe(false);
  });

  it("«полный набор» ждёт четырёх уровней, а не дорожек", () => {
    /*
     * Значок обещает четыре уровня лицензии, поэтому и проверяться должен
     * именно он. Раньше здесь стояла проверка дорожек, и бит с одним
     * уровнем и стемами получал «полный набор».
     */
    const withStemsOnly = computeAchievements(stats({ beatsWithStems: 5, beatsWithAllTiers: 0 }), at(1));
    expect(withStemsOnly.find((item) => item.id === "full-tiers")?.unlocked).toBe(false);

    const full = computeAchievements(stats({ beatsWithStems: 5, beatsWithAllTiers: 1 }), at(1));
    expect(full.find((item) => item.id === "full-tiers")?.unlocked).toBe(true);
  });

  it("пять отзывов не выдаются за оценку", () => {
    // Правила с названием про оценку больше нет: средней оценки оно не
    // считало, а значок обещал именно её.
    const list = computeAchievements(stats({ reviews: 5 }), at(1));

    expect(list.some((item) => item.id === ("avg-rating" as never))).toBe(false);
    expect(list.find((item) => item.id === "reviews-5")?.unlocked).toBe(true);
  });
});
