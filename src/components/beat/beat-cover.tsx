"use client";

import { usePlayer } from "@/components/player/player-provider";
import { trackFromBeat } from "@/lib/player";
import type { FeedBeat } from "@/lib/feed";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Обложка бита с кнопкой прослушивания.
 *
 * Отдельный компонент, а не часть шапки товара: на странице бита обложка
 * стоит слева от условий, а заголовок над всей страницей.
 */
export function BeatCover({
  beatId,
  coverUrl,
  audioUrl,
  title,
  plays,
  className,
}: {
  beatId: string;
  coverUrl: string | null;
  audioUrl: string | null;
  title: string;
  plays: number;
  className?: string;
}) {
  const { t } = useI18n();
  const { track, isPlaying, play, toggle } = usePlayer();

  // Плееру нужен объект бита, а не страница: собираем минимальный.
  const beat = {
    id: beatId,
    title,
    bpm: 0,
    musicalKey: "",
    tags: [],
    typeBeatArtists: [],
    coverUrl,
    mp3Url: audioUrl,
    prices: {},
    currency: "RUB",
    username: "",
    avatarUrl: null,
    isPublic: true,
    plays,
    score: 0,
    sellerLevel: 1,
    likes: 0,
    saves: 0,
    liked: false,
    saved: false,
    saleState: "public",
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
  } as unknown as FeedBeat;

  const active = track?.id === beat.id && isPlaying;

  function listen() {
    const next = trackFromBeat(beat);
    if (!next) return;
    if (active) toggle();
    else play(next);
  }

  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-lg bg-ink-3", className)}>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <div className="cover-grid size-full" />
      )}

      {/* Затемнение нужно только под кнопкой: на светлой обложке она иначе
          теряется. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/80 to-transparent" />

      {audioUrl ? (
        <button
          type="button"
          onClick={listen}
          aria-label={active ? t("player.pause") : t("player.play")}
          aria-pressed={active}
          className="absolute bottom-3 left-3 grid size-12 place-items-center rounded-full border border-line-2 bg-ink/80 text-paper backdrop-blur-sm transition-colors hover:border-signal hover:bg-signal hover:text-ink"
        >
          {active ? (
            <svg viewBox="0 0 10 12" aria-hidden className="h-4 w-3.5 fill-current">
              <path d="M0 0h3v12H0zM7 0h3v12H7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 12" aria-hidden className="h-4 w-3.5 fill-current">
              <path d="M0 0l10 6-10 6z" />
            </svg>
          )}
        </button>
      ) : null}
    </div>
  );
}
