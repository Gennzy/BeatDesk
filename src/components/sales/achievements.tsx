"use client";

import { AchievementBadge } from "@/components/sales/achievement-badge";
import { ProgressLine } from "@/components/ui/progress";
import {
  nextAchievement,
  progress,
  type Achievement,
} from "@/lib/sales/achievements";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Достижения битмейкера.
 *
 * Видны только автору. Покупателю это знать не нужно: он выбирает бит, а не
 * битмейкера, и число проданных битов превращало бы выбор в голосование за
 * самого популярного.
 *
 * Показываются все значки сразу, включая закрытые: список из одних
 * открытых не говорит, куда расти, а ради этого он и нужен. Закрытые тише,
 * но не спрятаны — видно, сколько их всего и какой следующий.
 */
export function Achievements({ list }: { list: Achievement[] }) {
  const { t } = useI18n();

  const unlocked = list.filter((achievement) => achievement.unlocked);
  const next = nextAchievement(list);

  if (list.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
        <span className="label text-mute">{t("ach.title")}</span>
        <span className="label text-paper">
          {unlocked.length} / {list.length}
        </span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {list.map((achievement) => (
          <li key={achievement.id}>
            <AchievementBadge
              id={achievement.id}
              unlocked={achievement.unlocked}
              title={t(achievement.titleKey as "ach.firstBeat.title")}
            />
          </li>
        ))}
      </ul>

      {next ? (
        <div className={cn("flex flex-col gap-2 rounded-lg border border-line bg-ink-2 p-3")}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="label text-mute">{t("ach.next")}</span>
            <span className="mono text-xs text-paper tabular-nums">
              {formatCount(next.current)} / {formatCount(next.threshold)}
            </span>
          </div>
          <span className="label text-paper">{t(next.titleKey as "ach.firstBeat.title")}</span>
          <ProgressLine value={progress(next)} label={t("ach.progress")} />
        </div>
      ) : null}
    </section>
  );
}

/** Тысячи разделяем пробелом: 10 000 читается быстрее, чем 10000. */
function formatCount(value: number): string {
  return value.toLocaleString("ru-RU");
}