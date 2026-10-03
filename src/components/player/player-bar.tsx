"use client";

import Link from "next/link";

import { formatTime, usePlayer } from "@/components/player/player-provider";
import { useI18n } from "@/lib/i18n/provider";

function Progress({ value, max, onSeek }: { value: number; max: number; onSeek: (seconds: number) => void }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;

  return (
    <div className="flex flex-1 items-center gap-3">
      <span className="label w-10 text-right text-mute">{formatTime(value)}</span>
      <button
        type="button"
        aria-label="Перемотка"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const position = (event.clientX - rect.left) / rect.width;
          onSeek(position * max);
        }}
        className="group relative h-6 flex-1"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-line" />
        <span
          aria-hidden
          className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 bg-signal"
          style={{ width: `${ratio * 100}%` }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 bg-signal opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: `${ratio * 100}%` }}
        />
      </button>
      <span className="label w-10 text-mute">{formatTime(max)}</span>
    </div>
  );
}

export function PlayerBar() {
  const { t } = useI18n();
  const { track, isPlaying, currentTime, duration, toggle, seek, close } = usePlayer();

  if (!track) return null;

  return (
    <div className="liquid-glass liquid-glass-strong fixed inset-x-0 bottom-0 z-50 border-t border-line">
      <div className="mx-auto flex h-20 w-full max-w-[1560px] items-center gap-4 px-4 pb-[env(safe-area-inset-bottom)] sm:gap-6 sm:px-6 lg:px-12">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-64 sm:flex-none">
          <div className="size-11 shrink-0 overflow-hidden border border-line bg-ink-3">
            {track.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.coverUrl} alt="" decoding="async" className="size-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <Link
              href={`/beats/${track.id}`}
              className="block truncate font-display text-sm uppercase text-paper hover:text-signal"
            >
              {track.title}
            </Link>
            <span className="label block truncate text-mute">
              @{track.username} · {track.bpm} BPM · {track.musicalKey}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? t("player.pause") : t("player.play")}
          className="grid size-11 shrink-0 place-items-center bg-signal text-ink transition-colors hover:bg-paper"
        >
          {isPlaying ? (
            <svg viewBox="0 0 10 12" aria-hidden className="h-3.5 w-3 fill-current">
              <path d="M0 0h3.5v12H0zM6.5 0H10v12H6.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 12" aria-hidden className="h-3 w-2.5 fill-current">
              <path d="M0 0l10 6-10 6z" />
            </svg>
          )}
        </button>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-2xl">
            <Progress value={currentTime} max={duration} onSeek={seek} />
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          aria-label={t("player.close")}
          className="label grid size-10 shrink-0 place-items-center border border-line text-mute transition-colors hover:border-line-2 hover:text-paper sm:size-8"
        >
          ✕
        </button>
      </div>
    </div>
  );
}