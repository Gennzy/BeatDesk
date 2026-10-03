import { FeedFiltersBar, type FeedFilterState } from "@/components/feed/feed-filters";
import { FeedList } from "@/components/feed/feed-list";
import { HeroVideo } from "@/components/media/hero-video";
import { Button } from "@/components/ui/button";
import { Container, SectionHead } from "@/components/ui/container";
import { HeroIntro } from "@/components/ui/hero-intro";
import { Reveal } from "@/components/ui/reveal";
import type { Metadata } from "next";
import { Suspense } from "react";

import { fetchPublicBeats, type FeedFilters } from "@/lib/feed";
import { getT } from "@/lib/i18n/server";
import { getSupabase } from "@/lib/supabase/user";

export const metadata: Metadata = {
  // заголовок главной берётся из дефолта в layout
  description: "Свежие биты битмейкеров: обложка, BPM, тональность, теги и цены. Слушай прямо в ленте.",
  alternates: { canonical: "/" },
  openGraph: { title: "Лента битов · BeatDesk", description: "Свежие публичные биты битмейкеров с плеером." },
};

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

  const feed = supabase
    ? await fetchPublicBeats(supabase, 0, undefined, feedFilters).catch(() => ({ beats: [], nextOffset: null }))
    : { beats: [], nextOffset: null };

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <HeroVideo src="/media/hero.mp4" />
        <div aria-hidden className="guide-grid pointer-events-none absolute inset-0 opacity-40" />
        <Container>
          <HeroIntro>
            <div className="relative z-10 pt-10 pb-14 lg:pt-14 lg:pb-20">
              <div
                data-fade
                className="flex items-center justify-end border-b border-line pb-4"
              >
                <span className="label text-mute">{t("hero.platforms")}</span>
              </div>

              <h1 className="mt-9 font-display text-hero font-black text-balance text-paper uppercase lg:mt-12">
                {[t("hero.title.line1"), t("hero.title.line2"), t("hero.title.line3")].map((line, index) => (
                  <span key={line} className="block overflow-hidden pb-[0.06em]">
                    <span data-line className={index === 1 ? "block text-signal" : "block"}>
                      {line}
                    </span>
                  </span>
                ))}
              </h1>

              <div className="mt-9 flex max-w-[34rem] flex-col gap-6">
                <p data-fade className="text-pretty text-sub text-mute">
                  {t("hero.sub")}
                </p>

                <p data-fade className="flex items-start gap-3 border-l border-signal/50 pl-4 text-sm leading-relaxed text-paper/70">
                  {t("hero.note")}
                </p>

                <div data-fade className="mt-2 flex flex-wrap items-center gap-3">
                  <Button href="/upload" size="lg">
                    {t("hero.ctaPrimary")}
                    <span aria-hidden>→</span>
                  </Button>
                  <Button href="#feed" variant="ink" size="lg">
                    {t("hero.ctaSecondary")}
                  </Button>
                </div>
              </div>
            </div>
          </HeroIntro>
        </Container>
      </section>

      <section id="feed" className="py-20 lg:py-28">
        <Container>
          <Reveal>
            <SectionHead label={t("feed.label")} hint={t("feed.hint")} />
          </Reveal>
          <Reveal delay={0.08}>
            <div className="mt-8 flex flex-col gap-6">
              <Suspense fallback={null}>
                <FeedFiltersBar resultCount={feed.beats.length} />
              </Suspense>
              <FeedList initial={feed.beats} initialNextOffset={feed.nextOffset} filters={filters} />
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}