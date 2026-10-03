"use client";

import Link from "next/link";

import { usePlayer } from "@/components/player/player-provider";
import { Badge } from "@/components/ui/badge";
import type { FeedBeat } from "@/lib/feed";
import { cn } from "@/lib/cn";
import { trackFromBeat } from "@/lib/player";
import { useI18n } from "@/lib/i18n/provider";

function formatPrice(value: number | null): string {
  if (value === null) return "";
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function Cover({ beat, noCoverLabel }: { beat: FeedBeat; noCoverLabel: string }) {
  if (beat.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={beat.coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div className="cover-grid relative size-full bg-ink-3">
      <span aria-hidden className="absolute top-3 right-3 size-2 bg-signal" />
      <span className="label absolute top-3 left-3 text-mute">{noCoverLabel}</span>
    </div>
  );
}

export function BeatCard({ beat }: { beat: FeedBeat }) {
  const { t } = useI18n();
  const { track, isPlaying, play } = usePlayer();
  const active = track?.id === beat.id && isPlaying;
  const playable = Boolean(beat.mp3Url);

  const prices = [
    beat.prices.mp3 ? `MP3 ${formatPrice(beat.prices.mp3)}` : null,
    beat.prices.bundle ? `MP3+WAV ${formatPrice(beat.prices.bundle)}` : null,
    beat.prices.exclusive ? `Эксклюзив ${formatPrice(beat.prices.exclusive)}` : null,
  ].filter(Boolean) as string[];

  return (
    <article className="group flex flex-col overflow-hidden rounded-md border border-line bg-ink-2 transition-colors duration-200 hover:border-line-2">
      <div className="relative aspect-square overflow-hidden">
        <Cover beat={beat} noCoverLabel={t("feed.noCover")} />

        {playable ? (
          <button
            type="button"
            onClick={() => {
              const next = trackFromBeat(beat);
              if (next) play(next);
            }}
            aria-label={active ? t("player.pause") : t("player.play")}
            className={cn(
              "absolute bottom-4 left-4 grid size-11 place-items-center border border-line bg-ink/85 text-paper backdrop-blur-sm transition-colors duration-150",
              active ? "border-signal bg-signal text-ink" : "hover:border-signal hover:bg-signal hover:text-ink",
            )}
          >
            {active ? (
              <svg viewBox="0 0 10 12" aria-hidden className="h-3.5 w-3 fill-current">
                <path d="M0 0h3.5v12H0zM6.5 0H10v12H6.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 12" aria-hidden className="h-3 w-2.5 fill-current">
                <path d="M0 0l10 6-10 6z" />
              </svg>
            )}
          </button>
        ) : (
          <span className="label absolute bottom-4 left-4 border border-line bg-ink/85 px-2 py-1.5 text-mute">
            {t("feed.noAudio")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Link href={`/beats/${beat.id}`} className="group/title">
            <h3 className="font-display text-lg leading-tight tracking-tight text-paper uppercase transition-colors group-hover/title:text-signal">
              {beat.title}
            </h3>
          </Link>
          <Link href={`/beatmakers/${beat.username}`} className="flex items-center gap-2 hover:opacity-80">
            <span aria-hidden className="grid size-5 place-items-center bg-ink-3 font-display text-[10px] text-mute">
              {beat.username.slice(0, 2).toUpperCase()}
            </span>
            <span className="label text-mute">@{beat.username}</span>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{beat.bpm} BPM</Badge>
          <Badge tone="outline">{beat.musicalKey}</Badge>
          {beat.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="label text-mute">
              #{tag}
            </span>
          ))}
        </div>

        {prices.length > 0 ? (
          <p className="label mt-auto flex flex-wrap gap-x-2 gap-y-1 text-amber">
            {prices.map((price) => (
              <span key={price} className="whitespace-nowrap">
                {price}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}