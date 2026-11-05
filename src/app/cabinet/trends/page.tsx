import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { genreTrends, sellerStanding, verdictLabel, type GenreBeat } from "@/lib/trends";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";
import { formatMoney } from "@/lib/currency";

/**
 * Что в тренде.
 *
 * Ответ на два вопроса, которые битмейкер задаёт себе каждый раз: во что
 * сейчас ищут и как он стоит относительно своих. Ни то, ни другое не видно
 * из ленты: там чужие биты и счётчики без смысла.
 *
 * Всё считается из тех же данных, что и лента, — просто собранных по жанрам
 * и по продавцу.
 */
export const metadata = { title: "Что в тренде — BeatDesk", robots: { index: false, follow: false } };

export default async function TrendsPage() {
  const [t, supabase] = await Promise.all([getT(), getSupabase()]);

  if (!supabase) redirect("/login?next=/cabinet/trends");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cabinet/trends");

  const { data } = await supabase
    .from("beats")
    .select("id, title, owner_id, genre, tags, plays, prices, created_at")
    .eq("is_public", true)
    .limit(600);

  const rows = (data ?? []) as {
    id: string;
    title: string;
    owner_id: string;
    genre: string | null;
    tags: string[] | null;
    plays: number | null;
    prices: Record<string, number | null> | null;
    created_at: string;
  }[];

  const beats: GenreBeat[] = rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    genre: row.genre,
    tags: row.tags,
    plays: row.plays ?? 0,
    price: (row.prices as Record<string, number | null> | null)?.mp3 ?? null,
    createdAt: row.created_at,
  }));

  const trends = genreTrends(beats);
  const own = beats.filter((beat) => beat.ownerId === user.id);
  const ownGenres = [...new Set(own.map((beat) => beat.genre).filter(Boolean))] as string[];
  const mainGenre = ownGenres[0] ?? null;
  const standing = sellerStanding(
    own,
    trends.find((trend) => trend.genre === mainGenre),
  );

  return (
    <section className="py-10 lg:py-14">
      <Container>
        <div className="flex flex-col gap-3 border-b border-line pb-7">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-mute/50" />
            <span className="label text-mute">{t("trends.eyebrow")}</span>
          </span>

          <h1 className="font-display text-section font-semibold text-paper uppercase">{t("trends.heading")}</h1>

          <p className="max-w-[68ch] text-sub text-mute">{t("trends.sub")}</p>
        </div>

        {/*
          Сначала место продавца.
          *
          * Его вопрос — «как я стою», и он важнее общей картины: общую можно
          * посмотреть и позже, а своё он хочет знать сразу.
          */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="panel p-5">
            <span className="label text-mute">{t("trends.yourBeats")}</span>
            <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">{standing.beats}</p>
          </div>

          <div className="panel p-5">
            <span className="label text-mute">{t("trends.yourPlays")}</span>
            <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">{standing.plays}</p>
          </div>

          <div className="panel p-5">
            <span className="label text-mute">{t("trends.yourPrice")}</span>
            <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">
              {standing.price === null ? "—" : formatMoney(standing.price, "RUB")}
            </p>
            <p className="mt-1 text-xs text-mute">{verdictLabel(standing.verdict)}</p>
          </div>

          <div className="panel p-5">
            <span className="label text-mute">{t("trends.genreMedian")}</span>
            <p className="mt-2 font-display text-2xl font-semibold text-paper tabular-nums">
              {standing.medianPrice === null ? "—" : formatMoney(standing.medianPrice, "RUB")}
            </p>
          </div>
        </div>

        {standing.coldTags.length > 0 ? (
          <div className="panel mt-3 p-5">
            <span className="label text-paper">{t("trends.coldTags")}</span>
            <p className="mt-2 text-sm leading-relaxed text-mute">{t("trends.coldTagsHint")}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {standing.coldTags.map((tag) => (
                <span key={tag} className="chip border-line text-mute">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <h2 className="mt-12 font-display text-title-sm font-semibold uppercase tracking-tight text-paper">
          {t("trends.byGenre")}
        </h2>

        <ul className="mt-5 flex flex-col gap-3">
          {trends.map((trend) => (
            <li key={trend.genre ?? "—"} className="panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="font-display text-lg font-semibold uppercase tracking-tight text-paper">
                  {trend.genre ? t(`genre.${trend.genre}` as "genre.trap") : t("trends.noGenre")}
                </span>

                <span className="text-xs text-mute tabular-nums">
                  {t("trends.genreStats", {
                    beats: String(trend.beats),
                    plays: String(trend.plays),
                    price: trend.medianPrice === null ? "—" : formatMoney(trend.medianPrice, "RUB"),
                  })}
                </span>
              </div>

              {trend.topTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {trend.topTags.map((tag) => (
                    <span key={tag.tag} className="chip border-signal/30 text-signal">
                      #{tag.tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
