import { redirect } from "next/navigation";

import { PulseJobs } from "@/components/pulse/pulse-jobs";
import { Container } from "@/components/ui/container";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pulse — история публикаций", robots: { index: false, follow: false } };

/**
 * История публикаций.
 *
 * Отдельная страница, а не вкладка в мастере: сюда приходят не «собирать
 * ролик», а «разобраться, что с моими роликами» — и после закрытой вкладки.
 *
 * Данные берутся напрямую из базы, а не через /api/pulse/jobs: RLS отдаёт
 * автору ровно его задачи, а страница всё равно делает один запрос за
 * страницей. Ходить через API здесь значило бы платить лишним кругом за то,
 * что база и так отдаёт безопасно.
 */
export default async function PulseHistoryPage() {
  const supabase = await createClient();
  const t = await getT();

  const {
    data: { user },
  } = await supabase?.auth.getUser() ?? { data: { user: null } };

  if (!user || !supabase) redirect("/login");

  const [{ data: jobs }, { data: overview }] = await Promise.all([
    supabase
      .from("pulse_jobs")
      .select(
        "id, beat_id, beat_title, title, status, progress, error, video_id, watch_url, attempts, published_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("pulse_job_overview", { p_stale_minutes: 15 }),
  ]);

  const summary = (overview ?? {}) as { counts?: Record<string, number>; stuck?: Array<{ id: string }> };

  return (
    <div className="flex flex-col">
      <Container className="flex items-center justify-between gap-4 border-b border-line py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-title font-semibold tracking-tight">PULSE</span>
          <span className="label text-mute">{t("pulse.tagline")}</span>
        </div>

        <div className="flex items-center gap-2">
          <a href="/pulse" className="chip chip-hover">
            {t("pulse.back")}
          </a>
          <a href="/cabinet" className="chip chip-hover">
            {t("pulse.history")}
          </a>
        </div>
      </Container>

      <Container className="py-10">
        <PulseJobs
          jobs={(jobs ?? []) as never}
          counts={summary.counts ?? {}}
          stuckIds={(summary.stuck ?? []).map((item) => item.id)}
        />
      </Container>
    </div>
  );
}
