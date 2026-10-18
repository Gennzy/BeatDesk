"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/ui/toast";
import { canRetry, isRunning, jobTone, jobTitle, type JobStatus } from "@/lib/pulse/jobs";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Список задач публикации.
 *
 * Страница истории нужна не чтобы похвастаться счётчиком, а чтобы ответить на
 * один вопрос: «вышло ли». Чаще всего ответ — «нет», и чаще всего по причине,
 * которую человек уже забыл: закрыл вкладку посреди сборки.
 *
 * Поэтому зависшие задачи стоят первыми и выглядят тревожно, а не как
 * «в работе». Молчаливое «идёт» хуже явного «зависло»: человек поверит
 * первому и не верн��тся, пока ролик там и не д��йдёт до YouTube.
 */

/** Ровно то, что выбирает база для отрисовки списка. */
export type PulseJobView = {
  id: string;
  beatTitle: string;
  title: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  watchUrl: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

/** Когда задача «в работе» дольше этого, она считается зависшей. */
const STALE_MINUTES = 15;

/** Классы тона для чипа статуса. Тон — про вид, слово переводится отдельно. */
const TONE_CLASS: Record<ReturnType<typeof jobTone>, string> = {
  mute: "border-line text-mute",
  signal: "border-signal/40 text-signal",
  danger: "border-danger/60 text-danger",
};

const when = (iso: string) => {
  const at = Date.parse(iso);

  if (!Number.isFinite(at)) return "";

  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(at),
  );
};

export function PulseJobs({
  jobs,
  counts,
  stuckIds,
}: {
  jobs: PulseJobView[];
  counts: Record<string, number>;
  stuckIds: string[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [pending, setPending] = useState<string | null>(null);

  const stuck = new Set(stuckIds);
  const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);

  /*
   * Сортировка делается здесь, а не в базе: база отдаёт по дате создания, а
   * человеку нужна другая очередь. Первым идёт то, что требует его участия —
   * зависшее и отказавшее, — и только потом то, что уже сделано.
   */
  const rows = [...jobs].sort((a, b) => {
    const left = canRetry(a, STALE_MINUTES) ? 0 : 1;
    const right = canRetry(b, STALE_MINUTES) ? 0 : 1;

    if (left !== right) return left - right;

    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  async function retry(id: string) {
    setPending(id);

    try {
      const response = await fetch(`/api/pulse/jobs/${id}/retry`, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        throw new Error(data?.error ?? t("pulse.retryFailed"));
      }

      toast.show({ tone: "success", icon: "check", title: t("pulse.retryDone") });

      router.refresh();
    } catch (cause) {
      toast.show({
        tone: "error",
        icon: "close",
        title: cause instanceof Error ? cause.message : t("pulse.retryFailed"),
      });
    } finally {
      setPending(null);
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="panel p-8">
        <h1 className="font-display text-title-sm font-semibold tracking-tight">{t("pulse.historyTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">{t("pulse.historyEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-title-sm font-semibold tracking-tight">{t("pulse.historyTitle")}</h1>
          <p className="mt-1 text-sm text-mute">{t("pulse.historySubtitle")}</p>
        </div>

        {total > 0 ? (
          <span className="label text-mute">
            {t("pulse.counts")}: {total}
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((job) => {
          const tone = jobTone(job, STALE_MINUTES);
          const needsYou = stuck.has(job.id) || job.status === "failed";
          const retryable = canRetry(job, STALE_MINUTES);

          return (
            <li key={job.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${TONE_CLASS[tone]}`}>
                    {needsYou && stuck.has(job.id) ? t("pulse.jobStuck") : t(`pulse.status.${job.status}`)}
                  </span>

                  <span className="truncate text-sm font-medium">{jobTitle(job)}</span>
                </div>

                <span className="text-xs text-mute">
                  {when(job.createdAt)}

                  {/*
                   * Процент нужен, чтобы «Загружается» и «Опубликован» не
                   * выглядели одинаково: работа и успех в палитре одного тона,
                   * и различает их только число.
                   */}
                  {isRunning(job.status) && job.progress > 0 ? ` · ${Math.round(job.progress * 100)}%` : ""}

                  {job.attempts > 1 ? ` · ${t("pulse.attempts")}: ${job.attempts}` : ""}
                </span>

                {job.error ? (
                  <span className="text-xs leading-relaxed text-danger/90">{job.error}</span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {job.status === "published" && job.watchUrl ? (
                  <a
                    href={job.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip chip-hover"
                  >
                    {t("pulse.watchOnYouTube")}
                  </a>
                ) : null}

                {retryable ? (
                  <button
                    type="button"
                    disabled={pending === job.id}
                    onClick={() => retry(job.id)}
                    className="chip border-signal/40 text-signal transition-colors hover:border-danger/60 hover:text-danger disabled:opacity-50"
                  >
                    {pending === job.id ? t("pulse.retrying") : t("pulse.retry")}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {stuckIds.length > 0 ? <p className="max-w-[70ch] text-xs leading-relaxed text-mute">{t("pulse.jobStuckNote")}</p> : null}

      <Link href="/pulse" className="chip chip-hover self-start">
        {t("pulse.create")}
      </Link>
    </div>
  );
}
