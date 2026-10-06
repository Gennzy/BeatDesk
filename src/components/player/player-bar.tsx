"use client";

import Link from "next/link";
import { useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { PlayPause } from "./player-controls";
import { PlayerFullscreen } from "./player-fullscreen";
import { Progress } from "./player-progress";
import { useI18n } from "@/lib/i18n/provider";

export function PlayerBar() {
  const { t } = useI18n();
  const { track, isPlaying, currentTime, duration, toggle, seek, close } = usePlayer();
  const [expanded, setExpanded] = useState(false);

  if (!track) return null;

  return (
    <>
      {expanded ? <PlayerFullscreen onClose={() => setExpanded(false)} /> : null}

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

          <PlayPause isPlaying={isPlaying} onToggle={toggle} />

          <div className="flex flex-1 items-center justify-center">
            <Progress value={currentTime} max={duration} onSeek={seek} className="w-full max-w-2xl" />
          </div>

          {/* Развернуть: на телефоне панель узкая, а обложка нужна крупной. */}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t("player.expand")}
            className="grid size-10 shrink-0 place-items-center border border-line text-mute transition-colors hover:border-line-2 hover:text-paper sm:size-8"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
              <path d="M0 0h7v2H2v5H0V0zm9 0h7v7h-2V2H9V0zM0 9h2v5h5v2H0V9zm14 0h2v7H9v-2h5V9z" />
            </svg>
          </button>

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
    </>
  );
}