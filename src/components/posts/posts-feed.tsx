"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PostCard } from "@/components/posts/post-card";
import { PostComposer } from "@/components/posts/post-composer";
import { Button } from "@/components/ui/button";
import type { FeedBeat } from "@/lib/feed";
import { useI18n } from "@/lib/i18n/provider";
import { useRealtime } from "@/lib/realtime";
import type { Post } from "@/lib/posts";

type Tab = "all" | "following";

type Props = {
  tab: Tab;
  /** На табе «все» первая страница приходит с сервера, на «подписках» — отсюда. */
  initial: Post[];
  myBeats: FeedBeat[];
  loggedIn: boolean;
  myUsername?: string | null;
  onTabChange: (tab: Tab) => void;
};

export function PostsFeed({ tab, initial, myBeats, loggedIn, myUsername, onTabChange }: Props) {
  const { t } = useI18n();

  const isAll = tab === "all";

  // На «все» список собирается из серверной первой страницы и догруженных.
  // На «подписках» серверной страницы нет, поэтому она живёт отдельно.
  const [fetched, setFetched] = useState<Post[]>([]);
  const [fetchedNext, setFetchedNext] = useState<number | null>(null);
  const [extra, setExtra] = useState<Post[]>([]);
  const [extraNext, setExtraNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  // Живые посты стоят перед серверной первой страницей: новый пост должен
  // оказаться наверху, а не в конце уже загруженного.
  const [live, setLive] = useState<Post[]>([]);

  const visible = useMemo(() => (isAll ? [...live, ...initial, ...extra] : fetched), [isAll, live, initial, extra, fetched]);
  const nextOffset = isAll ? extraNext : fetchedNext;

  // Новые посты не вставляем в список молча: если человек читает середину
  // ленты, содержимое подъедет под ним и собьёт место. Показываем плашку,
  // а если он и так наверху — добавляем сразу.
  const [pending, setPending] = useState<Post[]>([]);
  const topRef = useRef(true);

  useEffect(() => {
    const onScroll = () => {
      topRef.current = window.scrollY < 120;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Забирает свежие посты и решает: показать плашкой или добавить сразу. */
  const absorbNew = useCallback(async () => {
    if (!loggedIn) return;
    const response = await fetch("/api/posts?tab=all&offset=0", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;

    const data = (await response.json()) as { posts?: Post[] };
    const fresh = (data.posts ?? []).filter(
      (post) => !visible.some((item) => item.id === post.id) && !pending.some((item) => item.id === post.id),
    );
    if (fresh.length === 0) return;

    if (topRef.current && isAll) {
      setLive((prev) => [...fresh, ...prev]);
    } else {
      setPending((prev) => [...fresh, ...prev]);
    }
  }, [isAll, loggedIn, pending, visible]);

  useRealtime("posts", () => void absorbNew(), loggedIn);

  // Страховка на случай, если таблица не добавлена в публикацию realtime:
  // событий не будет, но лента всё равно обновится сама, просто реже.
  //
  // Колбэк держим в ref и создаём таймер один раз: если зависеть от
  // absorbNew, любой рендер сбрасывал бы интервал заново и он никогда
  // не досработал бы тридцати секунд.
  const absorbRef = useRef(absorbNew);
  useEffect(() => {
    absorbRef.current = absorbNew;
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void absorbRef.current();
    }, 20_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isAll || !loggedIn) return;

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
  }, [isAll, loggedIn]);

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

  // Посты — это разговор, а не витрина. Гостю показываем вход, а не
  // ленту с односложными тестовыми сообщениями.
  if (!loggedIn) {
    return (
      <div className="flex flex-col items-start gap-5 border border-line bg-ink-2 p-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 bg-signal" />
          <span className="label text-paper">{t("posts.gatedTitle")}</span>
        </div>
        <p className="max-w-[52ch] text-sub text-mute">{t("posts.gatedHint")}</p>
        <Button href={`/login?next=${encodeURIComponent("/?view=posts")}`} size="md">
          {t("posts.gatedCta")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PostComposer beats={myBeats} loggedIn={loggedIn} myUsername={myUsername} />

      <div className="flex items-center gap-1">
        {(["all", "following"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTabChange(item)}
            aria-pressed={tab === item}
            className={
              item === tab
                ? "label border border-signal bg-signal px-2.5 py-1.5 text-ink"
                : "label border border-line px-2.5 py-1.5 text-mute transition-colors hover:border-line-2 hover:text-paper"
            }
          >
            {item === "all" ? t("posts.tabAll") : t("posts.tabFollowing")}
          </button>
        ))}
      </div>

      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setLive((prev) => [...pending, ...prev]);
            setPending([]);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="label sticky top-20 z-10 w-fit border border-signal bg-signal px-3 py-1.5 text-ink"
        >
          {pending.length} {t("posts.newPosts")}
        </button>
      ) : null}

      {visible.length === 0 && !loading ? (
        <p className="text-sub text-mute">{isAll ? t("posts.empty") : t("posts.emptyFollowing")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((post) => (
            <li key={post.id}>
              <PostCard post={post} loggedIn={loggedIn} />
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