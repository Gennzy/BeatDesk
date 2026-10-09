"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BeatCard } from "@/components/feed/beat-card";
import { BeatCardSkeleton } from "@/components/ui/progress";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { FeedBeat } from "@/lib/feed";

import { filtersToParams, type FeedFilterState } from "./feed-filters";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  initial: FeedBeat[];
  initialNextOffset: number | null;
  filters: FeedFilterState;
  signedIn: boolean;
};

/** Лента с бесконечной прокруткой: догружаем, когда докрутили до конца. */
export function FeedList({ initial, initialNextOffset, filters, signedIn }: Props) {
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
    /*
     * Пусто и «ничего не нашлось» — разные вещи, и раньше они были
     * одним экраном.
     *
     * Гость, выбравший жанр, в котором пока никого нет, видел «Загрузи
     * первый бит». Он пришёл покупать, а его звали продавать — и каталог
     * при этом был не пуст, пустым был его выбор. Теперь у фильтра своя
     * формулировка и действие сброса, а приглашение загрузить бит
     * остаётся там, где каталог действительно пуст.
     */
    const narrowed =
      Boolean(filters.genre) ||
      filters.scope !== "all" ||
      Boolean(filters.query.trim()) ||
      Boolean(filters.key) ||
      Boolean(filters.bpmMin) ||
      Boolean(filters.bpmMax);

    if (narrowed) {
      return <EmptyState title={t("states.noMatch.title")} description={t("states.noMatch.sub")} action={{ label: t("states.noMatch.cta"), href: "/#feed" }} />;
    }

    // В пустом каталоге гости и продавцы видят разное: первому нечего
    // смотреть, второму есть что предложить.
    return signedIn ? (
      <EmptyState title={t("states.empty.title")} description={t("states.empty.sub")} action={{ label: t("states.empty.cta"), href: "/cabinet/upload" }} />
    ) : (
      <EmptyState title={t("states.emptyGuest.title")} description={t("states.emptyGuest.sub")} action={{ label: t("states.emptyGuest.cta"), href: "/cabinet/upload" }} />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {beats.map((beat, index) => (
          // Индекс появления считается по позиции внутри первой порции:
          // на догруженных страницах он не растёт до сотни, и задержка не
          // превращается в минуту ожидания.
          <div key={beat.id} className="rise" style={{ "--rise-index": index % 12 } as React.CSSProperties}>
            <BeatCard beat={beat} signedIn={signedIn} />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} aria-live="polite" className="flex min-h-24 items-center justify-center">
        {status === "loading" ? (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <BeatCardSkeleton key={index} />
            ))}
          </div>
        ) : null}

        {status === "error" ? (
          <ErrorState
            title={t("states.error.title")}
            description={t("states.error.sub")}
            action={
              <button type="button" onClick={() => void loadMore()} className="tab border border-line px-3.5 py-2 text-paper hover:border-line-2">
                {t("states.error.retry")}
              </button>
            }
          />
        ) : null}

        {status === "idle" && nextOffset === null ? (
          <p className="flex w-full items-center justify-center gap-3 pt-2 text-mute/70">
            <span aria-hidden className="h-px w-10 bg-line" />
            <span className="label">{t("feed.end")}</span>
            <span aria-hidden className="h-px w-10 bg-line" />
          </p>
        ) : null}
      </div>
    </div>
  );
}