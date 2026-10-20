"use client";

import { useEffect, useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { useI18n } from "@/lib/i18n/provider";
import { youtubeEmbedUrl, youtubeIdOf } from "@/lib/pulse/video";
import { Progress } from "./player-progress";
import { PlayPause } from "./player-controls";
import { VolumeControl } from "./volume-control";

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

  /*
   * Режим видео живёт здесь, а не в провайдере: он относится к тому, что
   * сейчас на экране, и в общей панели плеера ему места нет.
   *
   * Хранится не «включён ли», а «для какого трека включён». Тогда смена
   * трека сама сбрасывает режим: показывать ролик прошлого бита было бы
   * враньём, и отдельный эффект для этого не нужен.
   */
  const [videoTrackId, setVideoTrackId] = useState<string | null>(null);

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

  /*
   * Режим видео.
   *
   * Ролик лежит на YouTube, и мы его не переделываем: ни своей заливки, ни
   * своего плеера. Это была бы вторая реализация воспроизведения, а такие
   * вещи и разваливаются первыми.
   *
   * Видео включается без звука: звук играет наш плеер, и два звука одновременно
   * — это каша, а не фича.
   */
  const videoId = youtubeIdOf(track.videoUrl);
  const showVideo = Boolean(videoId) && videoTrackId === track.id;

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
        {/*
         * Ролик вертикальный, а обложка квадратная. Поэтому в режиме видео
         * место занимает вертикальный кадр, иначе ролик обрезался бы по
         * краям и половина кадра оставалась за краем экрана.
         */}
        <div
          className={
            showVideo
              ? "aspect-[9/16] w-full max-w-[min(70vh,22rem)] overflow-hidden rounded-lg border border-line bg-ink-2 shadow-[var(--shadow-3)]"
              : "aspect-square w-full max-w-[min(70vh,26rem)] overflow-hidden rounded-lg border border-line bg-ink-2 shadow-[var(--shadow-3)]"
          }
        >
          {showVideo ? (
            <iframe
              src={youtubeEmbedUrl(videoId as string, { autoplay: true })}
              title={track.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="size-full border-0"
            />
          ) : track.coverUrl ? (
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
            {track.username} · {track.bpm} BPM · {track.musicalKey}
          </span>
        </div>

        {/*
         * Переключатель «звук / видео» — как на Spotify, где у трека бывает
         * видео, но слушать его всё равно можно.
         *
         * Кнопка появляется только если ролик есть: пустой переключатель был
         * бы обещанием, которое ничего не делает.
         */}
        {videoId ? (
          <div className="flex items-center gap-1 rounded-pill border border-line p-1">
            <button
              type="button"
              onClick={() => setVideoTrackId(null)}
              aria-pressed={!showVideo}
              className={
                showVideo
                  ? "label px-3 py-1.5 text-mute"
                  : "label rounded-pill bg-signal px-3 py-1.5 text-ink"
              }
            >
              {t("player.modeAudio")}
            </button>
            <button
              type="button"
              onClick={() => setVideoTrackId(track.id)}
              aria-pressed={showVideo}
              className={
                showVideo
                  ? "label rounded-pill bg-signal px-3 py-1.5 text-ink"
                  : "label px-3 py-1.5 text-mute hover:text-paper"
              }
            >
              {t("player.modeVideo")}
            </button>
          </div>
        ) : null}

        <Progress value={currentTime} max={duration} onSeek={seek} size="lg" className="w-full max-w-xl" />

        {/* Время уже показано на полосе выше: второй раз выводить не нужно. */}
        <PlayPause isPlaying={isPlaying} onToggle={toggle} size="lg" />

        {/* На большом экране ползунок виден всегда: здесь есть место. */}
        <VolumeControl size="lg" />
      </div>
    </div>
  );
}