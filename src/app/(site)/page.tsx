import type { Metadata } from "next";
import { Suspense } from "react";

import { FeedTabs } from "@/components/feed/feed-tabs";
import type { FeedFilterState } from "@/components/feed/feed-filters";
import { Container, SectionHead } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/states";
import { fetchBeatsByOwner, fetchPublicBeats, type FeedBeat, type FeedFilters } from "@/lib/feed";
import { getT } from "@/lib/i18n/server";
import { fetchPosts } from "@/lib/posts";
import { getSessionUser, getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  // заголовок главной берётся из дефолта в layout
  description:
    "Маркетплейс битов: превью, темп, тональность и цены по лицензиям. Мастер и стемы покупатель получает после оплаты.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Маркетплейс битов · BeatDesk",
    description: "Свежие биты битмейкеров с превью, ценами по лицензиям и выдачей файлов после оплаты.",
  },
};

/**
 * Главная — это лента, а не рекламный экран.
 *
 * Раньше сверху стоял видео-герой на три строки текста: человек, который
 * пришёл за битом, должен был прокрутить мимо обещаний, прежде чем увидеть
 * биты. На маркетплейсе человек уже знает, куда пришёл, и первым экраном
 * ждёт каталог. Поэтому лента начинается сразу, а место героя заняла узкая
 * строка для битмейкера.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, supabase, params] = await Promise.all([getT(), getSupabase(), searchParams]);

  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const numeric = (key: string) => {
    const value = Number(one(key));
    return one(key) && Number.isFinite(value) ? value : undefined;
  };

  const filters: FeedFilterState = {
    sort: one("sort") === "popular" ? "popular" : "new",
    query: one("q"),
    key: one("key"),
    bpmMin: one("bpmMin"),
    bpmMax: one("bpmMax"),
  };

  const feedFilters: FeedFilters = {
    sort: filters.sort,
    query: filters.query || undefined,
    key: filters.key || undefined,
    bpmMin: numeric("bpmMin"),
    bpmMax: numeric("bpmMax"),
  };

  // Пустой массив при ошибке неотличим от «битов пока нет». Разделяем явно:
  // поломка запроса должна выглядеть поломкой, а не пустой витриной.
  let feedError: string | null = null;
  let feed: { beats: FeedBeat[]; nextOffset: number | null } = { beats: [], nextOffset: null };

  if (supabase) {
    try {
      feed = await fetchPublicBeats(supabase, 0, undefined, feedFilters);
    } catch (error) {
      console.error("beat feed failed", error);
      feedError = t("feed.error");
    }
  }

  // Ветки и свои биты нужны только вошедшему, поэтому тянутся вместе с ним.
  const viewer = supabase ? (await supabase.auth.getUser()).data.user ?? null : null;
  const viewerName = viewer ? (await getSessionUser())?.username ?? null : null;

  const [posts, myBeats] = viewer
    ? await Promise.all([
        fetchPosts(supabase!, { viewerId: viewer.id, limit: 10 }).catch(() => []),
        fetchBeatsByOwner(supabase!, viewer.id, true).catch(() => []),
      ])
    : [supabase ? await fetchPosts(supabase, { viewerId: null, limit: 10 }).catch(() => []) : [], []];

  return (
    <>
      {/* Переход по несуществующей короткой ссылке: человек должен понять, что делать. */}
      {one("shortlink") === "notfound" ? (
        <div className="border-b border-line bg-ink-2 px-4 py-3 text-sm text-amber">
          {t("shortLink.notFound")}
        </div>
      ) : null}

      <section id="feed" className="pt-10 pb-20 lg:pt-14 lg:pb-28">
        <Container>
          <SectionHead label={t("feed.label")} hint={t("feed.hint")} />

          <div className="mt-8">
            <Suspense fallback={null}>
              {feedError && feed.beats.length === 0 ? (
                <ErrorState title={t("feed.errorTitle")} description={feedError} />
              ) : (
                <FeedTabs
                  beats={feed.beats}
                  nextOffset={feed.nextOffset}
                  filters={filters}
                  posts={posts}
                  myBeats={myBeats}
                  loggedIn={Boolean(viewer)}
                  myUsername={viewerName}
                />
              )}
            </Suspense>
          </div>
        </Container>
      </section>
    </>
  );
}