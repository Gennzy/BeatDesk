"use client";

import { ProgressLine } from "@/components/ui/progress";
import {
  nextAchievement,
  progress,
  type Achievement,
} from "@/lib/sales/achievements";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Достижения битмейкера.
 *
 * Видны только автору. Покупателю это знать не нужно: он выбирает бит, а не
 * битмейкера, и число проданных битов превращало бы выбор в голосование за
 * самого популярного вместо того, чтобы слушать музыку.
 */
export function Achievements({ list }: { list: Achievement[] }) {
  const { t } = useI18n();

  const unlocked = list.filter((achievement) => achievement.unlocked);
  const next = nextAchievement(list);

  if (unlocked.length === 0 && !next) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
        <span className="label text-mute">{t("ach.title")}</span>
        <span className="label text-paper">
          {unlocked.length} / {list.length}
        </span>
      </div>

      {unlocked.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {unlocked.map((achievement) => (
            <li
              key={achievement.id}
              className="border border-line-2 bg-ink-3 px-3 py-2"
              title={t(achievement.titleKey as "ach.firstBeat.title")}
            >
              <span className="label text-paper">{t(achievement.titleKey as "ach.firstBeat.title")}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {next ? (
        <div className="flex flex-col gap-2">
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