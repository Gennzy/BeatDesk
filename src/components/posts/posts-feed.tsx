"use client";

import { useEffect, useState } from "react";

import { PostCard } from "@/components/posts/post-card";
import { PostComposer } from "@/components/posts/post-composer";
import { Button } from "@/components/ui/button";
import type { FeedBeat } from "@/lib/feed";
import { useI18n } from "@/lib/i18n/provider";
import type { Post } from "@/lib/posts";

type Tab = "all" | "following";

type Props = {
  tab: Tab;
  /** На табе «все» первая страница приходит с сервера, на «подписках» — отсюда. */
  initial: Post[];
  myBeats: FeedBeat[];
  loggedIn: boolean;
  onTabChange: (tab: Tab) => void;
};

export function PostsFeed({ tab, initial, myBeats, loggedIn, onTabChange }: Props) {
  const { t } = useI18n();

  const isAll = tab === "all";

  // На «все» список собирается из серверной первой страницы и догруженных.
  // На «подписках» серверной страницы нет, поэтому она живёт отдельно.
  const [fetched, setFetched] = useState<Post[]>([]);
  const [fetchedNext, setFetchedNext] = useState<number | null>(null);
  const [extra, setExtra] = useState<Post[]>([]);
  const [extraNext, setExtraNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAll) return;

    let alive = true;
    (async () => {
      const response = await fetch("/api/posts?tab=following&offset=0", { cache: "no-store" }).catch(() => null);
      if (!alive) return;

      if (!response) {
        setFetched([]);
        setFetchedNext(null);
        return;
      }

      const data = (await response.json()) as { posts?: Post[]; nextOffset?: number | null };
      setFetched(data.posts ?? []);
      setFetchedNext(data.nextOffset ?? null);
    })();

    return () => {
      alive = false;
    };
  }, [isAll]);

  const visible = isAll ? [...initial, ...extra] : fetched;
  const nextOffset = isAll ? extraNext : fetchedNext;

  async function loadMore() {
    if (loading) return;
    setLoading(true);

    const offset = nextOffset ?? visible.length;

    try {
      const response = await fetch(`/api/posts?tab=${tab}&offset=${offset}`, { cache: "no-store" });
      const data = (await response.json()) as { posts?: Post[]; nextOffset?: number | null };
      const seen = new Set(visible.map((post) => post.id));
      const fresh = (data.posts ?? []).filter((post) => !seen.has(post.id));

      if (isAll) {
        setExtra((prev) => [...prev, ...fresh]);
        setExtraNext(data.nextOffset ?? null);
      } else {
        setFetched((prev) => [...prev, ...fresh]);
        setFetchedNext(data.nextOffset ?? null);
      }
    } catch {
      setExtraNext(null);
      setFetchedNext(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PostComposer beats={myBeats} loggedIn={loggedIn} />

      <div className="flex items-center gap-2 border-b border-line">
        {(["all", "following"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTabChange(item)}
            className={
              item === tab
                ? "label border-b-2 border-signal px-3 py-2.5 text-paper"
                : "label border-b-2 border-transparent px-3 py-2.5 text-mute transition-colors hover:text-paper"
            }
          >
            {item === "all" ? t("posts.tabAll") : t("posts.tabFollowing")}
          </button>
        ))}
      </div>

      {visible.length === 0 && !loading ? (
        <p className="text-sub text-mute">{isAll ? t("posts.empty") : t("posts.emptyFollowing")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}

      {nextOffset !== null ? (
        <Button variant="ink" size="sm" disabled={loading} onClick={() => void loadMore()} className="w-fit">
          {t("posts.moreReplies")}
        </Button>
      ) : null}
    </div>
  );
}