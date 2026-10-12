import type { BeatmakerStats } from "./achievements";

/**
 * Задания недели.
 *
 * Достижения — это навсегда: взял «10 битов» и забыл. Задания — это habits:
 * каждую неделю четыре маленьких дела, и значок проверки горит, пока закрыты
 * три из четырёх. Продавец, который выкладывает биты каждую неделю, виден
 * покупателю сразу, а не через год, когда накопит 50 битов.
 *
 * Пороги маленькие намеренно: неделя — это три бита, а не тридцать. Большие
 * числа демотивируют в понедельник, а маленькие закрываются к среде, и
 * остаток недели человек работает уже ради продаж, а не ради галочки.
 */

export type WeeklyMissionId = "upload-beats" | "publish-posts" | "close-sale" | "gather-plays";

export type WeeklyMission = {
  id: WeeklyMissionId;
  /** Ключ подписи в словаре. */
  titleKey: string;
  /** Сколько нужно за неделю. */
  target: number;
  /** Сколько уже есть с понедельника. */
  current: number;
  done: boolean;
};

/** Сколько заданий нужно закрыть, чтобы горел значок проверки. */
export const WEEKLY_VERIFIED_THRESHOLD = 3;

type Rule = {
  id: WeeklyMissionId;
  titleKey: string;
  target: number;
  pick: (stats: BeatmakerStats) => number;
};

const RULES: Rule[] = [
  /*
   * Одно из заданий — загрузить несколько битов: именно его просили сделать
   * проверкой активности. Три, а не один: один бит в неделю — это хобби,
   * три — уже витрина, которая живёт.
   */
  { id: "upload-beats", titleKey: "weekly.uploadBeats", target: 3, pick: (s) => s.weekBeats },
  { id: "publish-posts", titleKey: "weekly.publishPosts", target: 3, pick: (s) => s.weekPosts },
  { id: "close-sale", titleKey: "weekly.closeSale", target: 1, pick: (s) => s.weekSales },
  { id: "gather-plays", titleKey: "weekly.gatherPlays", target: 300, pick: (s) => s.weekPlays },
];

/** Все четыре задания с текущим состоянием на эту неделю. */
export function computeWeekly(stats: BeatmakerStats): WeeklyMission[] {
  return RULES.map((rule) => {
    const current = Math.max(0, Math.round(rule.pick(stats)));

    return {
      id: rule.id,
      titleKey: rule.titleKey,
      target: rule.target,
      current,
      done: current >= rule.target,
    };
  });
}

/** Сколько заданий закрыто. */
export function weeklyDone(missions: WeeklyMission[]): number {
  return missions.filter((mission) => mission.done).length;
}

/**
 * Проверка горит, пока закрыты три из четырёх.
 *
 * Не все четыре: продажа зависит не только от продавца, и неделя без продаж
 * не должна снимать значок у того, кто выкладывает биты и ведёт ленту.
 */
export function isWeeklyVerified(missions: WeeklyMission[]): boolean {
  return weeklyDone(missions) >= WEEKLY_VERIFIED_THRESHOLD;
}
