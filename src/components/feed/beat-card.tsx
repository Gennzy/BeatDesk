"use client";

import Link from "next/link";

import { usePlayer } from "@/components/player/player-provider";
import { Avatar } from "@/components/ui/avatar";
import type { FeedBeat } from "@/lib/feed";
import { cn } from "@/lib/cn";
import { trackFromBeat } from "@/lib/player";
import { useI18n } from "@/lib/i18n/provider";

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
  const { track, isPlaying, play, toggle, plays } = usePlayer();

  const active = track?.id === beat.id && isPlaying;
  const playable = Boolean(beat.mp3Url);
  const ownPlays = active ? plays : beat.plays;

  function listen() {
    const next = trackFromBeat(beat);
    if (!next) return;
    if (active) toggle();
    else play(next);
  }

  return (
    <article className="group flex gap-4 border border-line bg-ink-2 p-3 transition-colors duration-200 hover:border-line-2">
      <div className="relative size-28 shrink-0 overflow-hidden sm:size-32">
        <Cover beat={beat} noCoverLabel={t("feed.noCover")} />

        {playable ? (
          <button
            type="button"
            onClick={listen}
            aria-label={active ? t("player.pause") : t("player.play")}
            className={cn(
              "absolute bottom-2 left-2 grid size-9 place-items-center border border-line bg-ink/85 text-paper backdrop-blur-sm transition-colors duration-150",
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
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          <Link href={`/beats/${beat.id}`} className="group/title">
            <h3 className="font-display text-base leading-tight text-paper uppercase transition-colors group-hover/title:text-signal">
              {beat.title}
            </h3>
          </Link>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/beatmakers/${beat.username}`} className="flex items-center gap-1.5 hover:opacity-80">
              <Avatar username={beat.username} src={beat.avatarUrl} size="xs" />
              <span className="label text-mute">@{beat.username}</span>
            </Link>
          </div>
        </div>

        {/* Технические данные — моноширинным, это факты, а не бейджи */}
        <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mute">
          <span>{beat.bpm} BPM</span>
          <span className="text-line">{beat.musicalKey}</span>
          {ownPlays > 0 ? <span className="text-line">{ownPlays} {t("posts.playsShort")}</span> : null}
        </div>

        {beat.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {beat.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="label text-mute">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {/* Цена: базовая заметно, остальные в подписи — иначе строка не читается */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
          {beat.prices.mp3 ? (
            <span className="flex items-baseline gap-1.5">
              <span className="label text-mute">{t("posts.from")}</span>
              <span className="font-display text-lg leading-none text-signal">{beat.prices.mp3} ₽</span>
            </span>
          ) : null}

          {beat.prices.bundle || beat.prices.exclusive ? (
            <span className="label text-mute">
              {[beat.prices.bundle ? `WAV ${beat.prices.bundle}` : null, beat.prices.exclusive ? `эксклюзив ${beat.prices.exclusive}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
