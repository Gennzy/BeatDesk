"use client";

import { Icon } from "@/components/ui/icon";
import { ProgressLine } from "@/components/ui/progress";
import { isWeeklyVerified, weeklyDone, type WeeklyMission } from "@/lib/sales/weekly";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Задания недели.
 *
 * В отличие от достижений, которые берутся раз и навсегда, задания
 * обновляются каждый понедельник: это причина заходить в кабинет не только
 * за деньгами. Значок проверки — награда за ритм, а не за старые заслуги.
 */
export function WeeklyMissions({ missions }: { missions: WeeklyMission[] }) {
  const { t } = useI18n();

  if (missions.length === 0) return null;

  const done = weeklyDone(missions);
  const verified = isWeeklyVerified(missions);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
        <span className="label text-mute">{t("weekly.title")}</span>
        <span className="label text-paper tabular-nums">
          {done} / {missions.length}
        </span>
      </div>

      {verified ? (
        <p className="flex items-center gap-2 text-sm text-paper">
          <span className="text-signal">
            <Icon name="verified" className="size-4" filled />
          </span>
          {t("weekly.verified")}
        </p>
      ) : (
        <p className="text-xs text-mute">{t("weekly.hint")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {missions.map((mission) => (
          <li key={mission.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="label text-paper">{t(mission.titleKey as "weekly.title")}</span>
              <span className="mono text-xs text-mute tabular-nums">
                {Math.min(mission.current, mission.target)} / {mission.target}
              </span>
            </div>
            <ProgressLine
              value={Math.max(0, Math.min(1, mission.current / mission.target))}
              label={t("weekly.progress")}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
