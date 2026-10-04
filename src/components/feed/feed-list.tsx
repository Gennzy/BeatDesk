"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BeatCard } from "@/components/feed/beat-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import type { FeedBeat } from "@/lib/feed";

import { filtersToParams, type FeedFilterState } from "./feed-filters";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  initial: FeedBeat[];
  initialNextOffset: number | null;
  filters: FeedFilterState;
};

/** Лента с бесконечной прокруткой: догружаем, когда докрутили до конца. */
export function FeedList({ initial, initialNextOffset, filters }: Props) {
  const { t } = useI18n();
  const [beats, setBeats] = useState(initial);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || status !== "idle") return;

    setStatus("loading");
    try {
      const query = filtersToParams(filters);
      const response = await fetch(`/api/feed?offset=${nextOffset}&${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("feed");

      const data = (await response.json()) as { beats: FeedBeat[]; nextOffset: number | null };
      setBeats((prev) => [...prev, ...data.beats]);
      setNextOffset(data.nextOffset);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [filters, nextOffset, status]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || nextOffset === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextOffset]);

  if (beats.length === 0) {
    return (
      <EmptyState title={t("states.empty.title")} description={t("states.empty.sub")} action={{ label: t("states.empty.cta"), href: "/upload" }} />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 xl:grid-cols-2">
        {beats.map((beat) => (
          <BeatCard key={beat.id} beat={beat} />
        ))}
      </div>

      <div ref={sentinelRef} aria-live="polite" className="flex min-h-24 items-center justify-center">
        {status === "loading" ? (
          <div className="grid w-full gap-3 xl:grid-cols-2">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex flex-col overflow-hidden rounded-md border border-line bg-ink-2">
                <Skeleton className="aspect-square rounded-none" />
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status === "error" ? (
          <ErrorState
            title={t("states.error.title")}
            description={t("states.error.sub")}
            action={
              <button type="button" onClick={() => void loadMore()} className="label border border-line px-3 py-2 text-paper hover:border-line-2">
                {t("states.error.retry")}
              </button>
            }
          />
        ) : null}

        {status === "idle" && nextOffset === null ? <span className="label text-mute">{t("feed.end")}</span> : null}
      </div>
    </div>
  );
}