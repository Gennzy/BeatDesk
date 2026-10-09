import type { Metadata } from "next";
import { Suspense } from "react";

import { FeedTabs } from "@/components/feed/feed-tabs";
import type { FeedFilterState } from "@/lib/feed-filters";
import { CatalogTiles } from "@/components/feed/catalog-tiles";
import { FeedBanners } from "@/components/feed/feed-banners";
import { Container } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/states";
import { fetchBeatsByOwner, fetchPublicBeats, type FeedBeat, type FeedFilters } from "@/lib/feed";
import { readFilters, toFeedFilters } from "@/lib/feed-filters";
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
  const paramsString = (values: Record<string, string | string[] | undefined>) =>
    new URLSearchParams(
      Object.entries(values)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, value as string]),
    );
  /*
   * Разбор адреса один и тот же, что и у панели фильтров. Раньше здесь стоял
   * свой разбор на два значения сортировки, из-за чего вкладка «популярное» не
   * доходила до запроса, а главная всегда показывала новые биты.
   */
  const filters = readFilters(new URLSearchParams(paramsString(params)));
  const feedFilters: FeedFilters = toFeedFilters(filters);

  // Пустой массив при ошибке неотличим от «битов пока нет». Разделяем явно:
  // поломка запроса должна выглядеть поломкой, а не пустой витриной.
  let feedError: string | null = null;
  let feed: { beats: FeedBeat[]; nextOffset: number | null } = { beats: [], nextOffset: null };

  const viewer = supabase ? (await supabase.auth.getUser()).data.user ?? null : null;

  if (supabase) {
    try {
      feed = await fetchPublicBeats(supabase, 0, undefined, feedFilters, viewer?.id ?? null);
    } catch (error) {
      console.error("beat feed failed", error);
      feedError = t("feed.error");
    }
  }

  // Ветки и свои биты нужны только вошедшему, поэтому тянутся вместе с ним.
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

      {/*
        Баннеры стоят над лентой, а не вместо неё. Раньше здесь была одна
        строка подписи: она занимала место баннеров у конкурентов, но
        рассказывала о площадке меньше всего, и полоса выглядела как
        недоделанная вёрстка. Её смысл — «бит можно послушать целиком» —
        не потерян: он теперь стоит заголовком первого баннера.
      */}
      <div className="pt-8 lg:pt-12">
        <FeedBanners />
      </div>

      {/*
        Каталог — быстрый путь, а не украшение: плитки ведут в реальные
        разделы ленты. Между баннерами и лентой он читается как оглавление
        площадки, а на пустой странице с двумя битами — как подсказка, куда
        идти дальше.
      */}
      <div className="pt-6 lg:pt-8">
        <Container>
          <CatalogTiles />
        </Container>
      </div>

      {/*
        Отдельного заголовка «Лента» над вкладками больше нет: два заголовка
        подряд читались как сбой вёрстки, а его смысл — «бит можно послушать
        целиком» — теперь стоит заголовком первого баннера, то есть сказано
        один раз и на виду. Области остаётся доступное имя, чтобы читатель
        с экрана знал, куда он попал.
      */}
      <section id="feed" aria-label={t("feed.label")} className="pt-8 pb-20 lg:pt-10 lg:pb-28">
        <Container>

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