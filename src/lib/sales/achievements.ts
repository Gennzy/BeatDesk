import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Достижения битмейкера.
 *
 * Считаются из фактов, а не хранятся готовыми строками: заведённая кнопка
 * «выдать достижение» однажды разойдётся с числом битов в профиле, и
 * человек увидит «5 битов» рядом с «выдано за 3 бита». Здесь нет хранилища
 * вообще — есть пороги и текущие числа.
 *
 * Показываются только автору. Покупателю число проданных битов знать не
 * нужно: он выбирает бит, а не битмейкера, и число продаж превращает
 * выбор в голосование за самого популярного.
 */

/** Числа, из которых считаются достижения. */
export type BeatmakerStats = {
  /** Дата регистрации, ISO. */
  registeredAt: string;
  /** Сколько битов выложено на продажу. */
  beatsOnSale: number;
  /** Сколько битов загружено всего, включая черновики. */
  beatsTotal: number;
  /** Суммарные прослушивания. */
  plays: number;
  /** Сколько оплаченных заказов на биты этого битмейкера. */
  ordersPaid: number;
  /** Сколько дорожек онлайн — битов с архивом дорожек. */
  beatsWithStems: number;
  /** Сколько битов ушло в каналы. */
  postsPublished: number;
  /** Сколько отзывов оставили покупатели. */
  reviews: number;
  /** Сколько человек подписалось. */
  followers: number;
};

export type AchievementId =
  | "first-beat"
  | "beats-10"
  | "beats-50"
  | "plays-1k"
  | "plays-10k"
  | "first-sale"
  | "sales-25"
  | "stems-10"
  | "days-30"
  | "days-365"
  | "first-post"
  | "first-review"
  | "reviews-10"
  | "followers-10"
  | "full-tiers"
  | "avg-rating";

export type Achievement = {
  id: AchievementId;
  /** Ключ подписи в словаре. */
  titleKey: string;
  /** Порог, который надо взять. */
  threshold: number;
  /** Текущее значение по тому же счётчику. */
  current: number;
  unlocked: boolean;
};

/** Полных суток между двумя датами. */
export function fullDays(from: string, to: number): number {
  const start = new Date(from).getTime();

  if (!Number.isFinite(start)) return 0;

  return Math.max(0, Math.floor((to - start) / 86_400_000));
}

/**
 * Пороги и счётчики.
 *
 * Пороги степеней двойки: человеку не нужны тридцать промежуточных медалей,
 * ему нужен следующий шаг и понимание, сколько до него осталось.
 */
const RULES: Array<{ id: AchievementId; titleKey: string; threshold: number; pick: (stats: BeatmakerStats, now: number) => number }> = [
  { id: "first-beat", titleKey: "ach.firstBeat.title", threshold: 1, pick: (s) => s.beatsTotal },
  { id: "beats-10", titleKey: "ach.beats10.title", threshold: 10, pick: (s) => s.beatsTotal },
  { id: "beats-50", titleKey: "ach.beats50.title", threshold: 50, pick: (s) => s.beatsTotal },
  { id: "plays-1k", titleKey: "ach.plays1k.title", threshold: 1_000, pick: (s) => s.plays },
  { id: "plays-10k", titleKey: "ach.plays10k.title", threshold: 10_000, pick: (s) => s.plays },
  { id: "first-sale", titleKey: "ach.firstSale.title", threshold: 1, pick: (s) => s.ordersPaid },
  { id: "sales-25", titleKey: "ach.sales25.title", threshold: 25, pick: (s) => s.ordersPaid },
  { id: "stems-10", titleKey: "ach.stems10.title", threshold: 10, pick: (s) => s.beatsWithStems },
  { id: "days-30", titleKey: "ach.days30.title", threshold: 30, pick: (s, now) => fullDays(s.registeredAt, now) },
  { id: "days-365", titleKey: "ach.days365.title", threshold: 365, pick: (s, now) => fullDays(s.registeredAt, now) },
  { id: "first-post", titleKey: "ach.firstPost.title", threshold: 1, pick: (s) => s.postsPublished },
  /*
   * Отзывы и подписчики: они про отношение, а не про объём. Битмейкер,
   * который выложил один бит и получил десять подписчиков, сделал больше,
   * чем тот, кто залил полсотни и не завёл ни одного.
   */
  { id: "first-review", titleKey: "ach.firstReview.title", threshold: 1, pick: (s) => s.reviews },
  { id: "reviews-10", titleKey: "ach.reviews10.title", threshold: 10, pick: (s) => s.reviews },
  { id: "followers-10", titleKey: "ach.followers10.title", threshold: 10, pick: (s) => s.followers },
  /*
   * Полный набор: у бита есть все уровни, включая дорожки и эксклюзив. Это
   * признак законченного товара, а не заготовки.
   */
  { id: "full-tiers", titleKey: "ach.fullTiers.title", threshold: 1, pick: (s) => s.beatsWithStems },
  /*
   * Оценка: держится от пяти отзывов, иначе один хороший отзыв давал бы
   * «пять звёзд» новому профилю.
   */
  { id: "avg-rating", titleKey: "ach.avgRating.title", threshold: 5, pick: (s) => s.reviews },
];

/** Все достижения с текущим состоянием: и взятые, и ближайшие. */
export function computeAchievements(stats: BeatmakerStats, now = Date.now()): Achievement[] {
  return RULES.map((rule) => {
    const current = Math.max(0, Math.round(rule.pick(stats, now)));

    return {
      id: rule.id,
      titleKey: rule.titleKey,
      threshold: rule.threshold,
      current,
      unlocked: current >= rule.threshold,
    };
  });
}

/** Доля выполнения: от 0 до 1. Считается от предыдущего порога, а не от нуля. */
export function progress(achievement: Achievement): number {
  if (achievement.unlocked) return 1;
  if (achievement.threshold <= 1) return 0;

  // Предыдущий порог того же счётчика ищем среди правил с тем же ключом счётчика.
  const lower = previousThreshold(achievement.id);
  const from = lower ?? 0;

  return Math.max(0, Math.min(1, (achievement.current - from) / (achievement.threshold - from)));
}

function previousThreshold(id: AchievementId): number | null {
  const index = RULES.findIndex((rule) => rule.id === id);
  const pick = RULES[index]?.pick;
  const chain: number[] = [];

  for (let i = index - 1; i >= 0; i -= 1) {
    if (pick && RULES[i].pick !== pick) break;
    chain.push(RULES[i].threshold);
  }

  return chain.length > 0 ? chain[chain.length - 1] : null;
}

/** Ближайшее невзятое достижение — ради «до следующего осталось N». */
export function nextAchievement(achievements: Achievement[]): Achievement | null {
  const locked = achievements
    .filter((achievement) => !achievement.unlocked)
    .sort((a, b) => a.threshold - b.threshold);

  return locked[0] ?? null;
}

export function unlockedCount(achievements: Achievement[]): number {
  return achievements.filter((achievement) => achievement.unlocked).length;
}

/**
 * Собрать числа битмейкера из базы.
 *
 * Оплаченные заказы считаются не запросом по orders: там лежат заказы всех
 * покупателей, и сессия продавца видит в них чужие строки. Сначала берём
 * свои позиции, потом спрашиваем статусы только этих заказов.
 */
export async function collectBeatmakerStats(
  supabase: SupabaseServerClient,
  ownerId: string,
  registeredAt: string,
): Promise<BeatmakerStats> {
  const [{ data: beats }, { data: items }, { data: posts }, { data: reviews }, { data: followers }] = await Promise.all([
    supabase.from("beats").select("plays, sale_state, files").eq("owner_id", ownerId),
    supabase.from("order_items").select("order_id").eq("beat_owner_id", ownerId),
    supabase.from("posts").select("beat_id").eq("author_id", ownerId),
    // Отзывы и подписчики считаем здесь же: они такие же факты о работе,
    // как загрузки и продажи, и отдельного захода ради них не нужно.
    supabase.from("reviews").select("id").eq("subject_id", ownerId),
    supabase.from("follows").select("follower_id").eq("following_id", ownerId),
  ]);

  const rows = (beats ?? []) as { plays: number | null; sale_state: string | null; files: Record<string, unknown> | null }[];
  const itemRows = (items ?? []) as { order_id: string }[];
  const postRows = (posts ?? []) as { beat_id: string | null }[];

  const orderIds = [...new Set(itemRows.map((row) => row.order_id))];
  let ordersPaid = 0;

  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from("orders").select("id, status").in("id", orderIds);
    ordersPaid = ((orders ?? []) as { status: string }[]).filter((order) => order.status === "paid").length;
  }

  return {
    registeredAt,
    beatsOnSale: rows.filter((row) => row.sale_state === "on_sale").length,
    beatsTotal: rows.length,
    plays: rows.reduce((sum, row) => sum + (row.plays ?? 0), 0),
    ordersPaid,
    beatsWithStems: rows.filter((row) => Boolean(row.files?.zip ?? row.files?.rar)).length,
    postsPublished: postRows.filter((row) => row.beat_id !== null).length,
    reviews: (reviews ?? []).length,
    followers: (followers ?? []).length,
  };
}
