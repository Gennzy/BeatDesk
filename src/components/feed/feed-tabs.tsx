"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { FeedFiltersBar, type FeedFilterState } from "@/components/feed/feed-filters";
import { FeedList } from "@/components/feed/feed-list";
import { PostsFeed } from "@/components/posts/posts-feed";
import { cn } from "@/lib/cn";
import type { FeedBeat } from "@/lib/feed";
import { useI18n } from "@/lib/i18n/provider";
import type { Post } from "@/lib/posts";

type View = "beats" | "posts";
type PostsTab = "all" | "following";

type Props = {
  beats: FeedBeat[];
  nextOffset: number | null;
  filters: FeedFilterState;
  posts: Post[];
  myBeats: FeedBeat[];
  loggedIn: boolean;
  myUsername?: string | null;
};

/**
 * Каталог битов и ветки живут на одной странице: разные плотности данных,
 * и переключение табом дешевле, чем второй маршрут.
 */
export function FeedTabs({ beats, nextOffset, filters, posts, myBeats, loggedIn, myUsername }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Источник истины — адресная строка: вкладку можно переслать ссылкой,
  // и кнопка «назад» работает как ожидается. Состояния нет вовсе: адрес
  // меняется через router.replace, и строка сама перерисовывает вкладки.
  const view: View = searchParams.get("view") === "posts" ? "posts" : "beats";
  const postsTab: PostsTab = searchParams.get("tab") === "following" ? "following" : "all";

  function switchTo(next: View) {
    if (next === view) return;

    const params = new URLSearchParams(searchParams.toString());
    if (next === "posts") params.set("view", "posts");
    else params.delete("view");

    router.replace(`/?${params.toString()}#feed`, { scroll: false });
  }

  function switchPostsTab(next: PostsTab) {
    if (next === postsTab) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "posts");
    if (next === "following") params.set("tab", "following");
    else params.delete("tab");

    router.replace(`/?${params.toString()}#feed`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      {/*
        * Переключатель разделов.
        *
        * Раньше это были два слова с тонкой лаймовой линией под активным, и
        * человек её не замечал: рядом с обычными ссылками это читалось как
        * подчёркивание, а не как переключатель. Раздел «Посты» просто не
        * находился.
        *
        * Теперь это сегментированный контрол: лаймовая пилюля на тёмном фоне
        * видна сразу, и активный раздел не нужно искать.
        */}
      <div role="tablist" className="inline-flex w-fit items-center gap-1 rounded-pill border border-line bg-ink-2 p-1">
        {(["beats", "posts"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`tab-${item}`}
            aria-selected={view === item}
            aria-controls={`panel-${item}`}
            onClick={() => switchTo(item)}
            className={cn(
              "label rounded-pill px-5 py-2 transition-colors",
              view === item ? "bg-signal text-ink" : "text-mute hover:text-paper",
            )}
          >
            {item === "beats" ? t("posts.beats") : t("posts.sound")}
          </button>
        ))}
      </div>

      {view === "beats" ? (
        <div id="panel-beats" role="tabpanel" aria-labelledby="tab-beats" className="flex flex-col gap-6">
          <Suspense fallback={null}>
            <FeedFiltersBar resultCount={beats.length} loggedIn={loggedIn} />
          </Suspense>
          <FeedList
            initial={beats}
            initialNextOffset={nextOffset}
            filters={filters}
            signedIn={loggedIn}
            myUsername={myUsername}
          />
        </div>
      ) : (
        // key по виду: при смене вкладки компонент пересоздаётся и не держит
        // посты прошлой вкладки в состоянии
        <div id="panel-posts" role="tabpanel" aria-labelledby="tab-posts" className="flex flex-col gap-6">
        <PostsFeed
          key={view}
          tab={postsTab}
          initial={posts}
          myBeats={myBeats}
          loggedIn={loggedIn}
          myUsername={myUsername}
          onTabChange={switchPostsTab}
        />
        </div>
      )}
    </div>
  );
}