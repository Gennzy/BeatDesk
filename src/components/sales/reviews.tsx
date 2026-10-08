import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { getLocale, getT } from "@/lib/i18n/server";
import { pluralRu } from "@/lib/plural";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  authorUsername: string | null;
  beatTitle: string | null;
};

type Summary = { count: number; average: number | null };

/** Отзывы о битмейкере: средняя оценка и список. Данные читает база. */
export async function fetchReviews(supabase: SupabaseServerClient, subjectId: string) {
  const [{ data: rows }, { data: summary }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, body, created_at, beats(title), profiles(username)")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("reviews_summary", { p_subject_id: subjectId }),
  ]);

  const list = ((rows ?? []) as {
    id: string;
    rating: number;
    body: string | null;
    created_at: string;
    beats: { title: string } | { title: string }[] | null;
    profiles: { username: string } | { username: string }[] | null;
  }[]).map<ReviewRow>((row) => ({
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
    authorUsername: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.username ?? null,
    beatTitle: (Array.isArray(row.beats) ? row.beats[0] : row.beats)?.title ?? null,
  }));

  const stat = (summary ?? null) as { count?: number; average?: number | null } | null;

  return {
    list,
    summary: {
      count: typeof stat?.count === "number" ? stat.count : 0,
      average: typeof stat?.average === "number" ? stat.average : null,
    } satisfies Summary,
  };
}

/**
 * Блок отзывов.
 *
 * Оценка показывается только когда отзыв хотя бы один. Пустое «4,9» из нул��
 * отзывов — выдуманное число: человек поверит ему и примет решение,
 * которого на самом деле нет.
 */
export async function Reviews({
  supabase,
  subjectId,
}: {
  supabase: SupabaseServerClient;
  subjectId: string;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const { list, summary } = await fetchReviews(supabase, subjectId);

  const rated = summary.count > 0 && summary.average !== null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <span className="label text-mute">{t("review.listTitle")}</span>

        {rated ? (
          <span className="flex items-baseline gap-2">
            <Stars rating={Math.round(summary.average ?? 0)} className="text-signal" />
            <span className="font-mono text-sm text-paper tabular-nums">{(summary.average ?? 0).toFixed(1)}</span>
            <span className="label text-mute">
              {summary.count} {locale === "ru" ? pluralRu(summary.count, "отзыв", "отзыва", "отзывов") : "reviews"}
            </span>
          </span>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-mute">{t("review.emptyHint")}</p>
      ) : (
        <ul className="flex flex-col gap-px bg-line">
          {list.map((review) => (
            <li key={review.id} className="flex flex-col gap-2 bg-ink-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="label text-paper">{review.authorUsername ?? t("review.anonymous")}</span>
                </span>
                <TimeAgo iso={review.createdAt} locale={locale} className="label text-mute/70" />
              </div>

              {review.body ? <p className="text-sm leading-relaxed text-mute">{review.body}</p> : null}

              {review.beatTitle ? <span className="label text-mute/70">{review.beatTitle}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Пять сердец: залитые считают оценку, шкала показывается целиком. */
function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={className ?? "text-mute"} aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Icon key={value} name="heart" className="size-3" filled={value <= rating} />
      ))}
    </span>
  );
}