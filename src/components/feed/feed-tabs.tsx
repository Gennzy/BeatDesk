"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
};

/**
 * Каталог битов и ветки живут на одной странице: разные плотности данных,
 * и переключение табом дешевле, чем второй маршрут.
 */
export function FeedTabs({ beats, nextOffset, filters, posts, myBeats, loggedIn }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Источник истины — адресная строка: вкладку можно переслать ссылкой,
  // и кнопка «назад» работает как ожидается.
  const [view, setView] = useState<View>(searchParams.get("view") === "posts" ? "posts" : "beats");
  const [postsTab, setPostsTab] = useState<PostsTab>(searchParams.get("tab") === "following" ? "following" : "all");

  function switchTo(next: View) {
    if (next === view) return;
    setView(next);

    const params = new URLSearchParams(searchParams.toString());
    if (next === "posts") params.set("view", "posts");
    else params.delete("view");

    router.replace(`/?${params.toString()}#feed`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      <div role="tablist" className="flex items-center gap-2 border-b border-line">
        {(["beats", "posts"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => switchTo(item)}
            className={cn(
              "label border-b-2 px-4 py-3 transition-colors",
              view === item ? "border-signal text-paper" : "border-transparent text-mute hover:text-paper",
            )}
          >
            {item === "beats" ? t("posts.beats") : t("posts.sound")}
          </button>
        ))}
      </div>

      {view === "beats" ? (
        <div className="flex flex-col gap-6">
          <Suspense fallback={null}>
            <FeedFiltersBar resultCount={beats.length} />
          </Suspense>
          <FeedList initial={beats} initialNextOffset={nextOffset} filters={filters} />
        </div>
      ) : (
        // key по виду: при смене вкладки компонент пересоздаётся и не держит
        // посты прошлой вкладки в состоянии
        <PostsFeed
          key={view}
          tab={postsTab}
          initial={posts}
          myBeats={myBeats}
          loggedIn={loggedIn}
          onTabChange={(next) => setPostsTab(next)}
        />
      )}
    </div>
  );
}