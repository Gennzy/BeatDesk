"use client";

import { useEffect } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { useI18n } from "@/lib/i18n/provider";
import { Progress } from "./player-progress";
import { PlayPause } from "./player-controls";

/**
 * Развёрнутый плеер.
 *
 * На телефоне панель снизу занимает место, где и так тесно: обложка и
 * название там мелкие, а промахнуться мимо кнопки легко. Полноэкранный
 * режим решает именно это, поэтому он и нужен на каждом экране, а не
 * только на широком.
 */
export function PlayerFullscreen({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { track, isPlaying, currentTime, duration, toggle, seek } = usePlayer();

  // Пока открыт полный плеер, страница под ним не должна скроллиться:
  // иначе жест прокрутки уводит фон, а человек остаётся смотреть в обложку.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape закрывает: на ноутбуке это привычнее, чем искать кнопку мышью.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!track) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("player.expand")}
      className="fixed inset-0 flex z-[100] flex flex-col bg-ink"
    >
      <div aria-hidden className="absolute inset-0 opacity-30 blur-3xl" style={{ backgroundImage: track.coverUrl ? `url(${track.coverUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />

      <div className="relative flex items-center justify-between gap-4 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <span className="label text-mute">{t("player.nowPlaying")}</span>
        <button type="button" onClick={onClose} aria-label={t("player.collapse")} className="label px-3 py-2 text-mute hover:text-paper">
          {t("player.collapse")}
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6 py-6">
        <div className="aspect-square w-full max-w-[min(70vh,26rem)] overflow-hidden border border-line bg-ink-2 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
          {track.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">
              <span className="label text-mute">{t("feed.noCover")}</span>
            </div>
          )}
        </div>

        <div className="flex w-full max-w-xl flex-col gap-1">
          <h2 className="truncate font-display text-xl font-bold text-paper uppercase">{track.title}</h2>
          <span className="label truncate text-mute">
            @{track.username} · {track.bpm} BPM · {track.musicalKey}
          </span>
        </div>

        <Progress value={currentTime} max={duration} onSeek={seek} className="w-full max-w-xl" />

        {/* Время уже показано на полосе выше: второй раз выводить не нужно. */}
        <PlayPause isPlaying={isPlaying} onToggle={toggle} size="lg" />
      </div>
    </div>
  );
}