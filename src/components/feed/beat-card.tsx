"use client";

import Link from "next/link";
import { useMemo } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import type { FeedBeat } from "@/lib/feed";
import { PRICE_KEYS, priceLabel } from "@/lib/prices";
import { trackFromBeat } from "@/lib/player";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Карточка товара в ленте.
 *
 * Сверху — обложка и звук, снизу — товар: название, кто сделал, технические
 * числа и тарифы. Тарифы показаны полными названиями, а не сокращениями
 * «TRACKOUT · WAV · EXCL»: на сокращения пришлось бы гадать, а человек
 * выбирает уровень именно по тому, что в него входит.
 */
export function BeatCard({ beat }: { beat: FeedBeat }) {
  const { t } = useI18n();
  const { track, isPlaying, play, toggle, plays, currentTime, duration } = usePlayer();

  const active = track?.id === beat.id && isPlaying;
  const playable = Boolean(beat.mp3Url);
  const ownPlays = active ? plays : beat.plays;

  const tiers = useMemo(
    () =>
      PRICE_KEYS.map((key) => ({ key, label: priceLabel[key], value: beat.prices[key] })).filter(
        (tier) => tier.value !== null && tier.value !== undefined,
      ),
    [beat.prices],
  );

  // Волна не отражает звук — она рисует движение. Случайные числа пересоздаются
  // только при смене бита, иначе лента перерисовывалась бы на каждом кадре.
  const bars = useMemo(() => {
    const seed = beat.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const heights: number[] = [];
    for (let index = 0; index < 28; index += 1) {
      const value = (seed * (index + 3) * 2654435761) % 97;
      heights.push(24 + (value % 76));
    }
    return heights;
  }, [beat.id]);

  // Плеер отдаёт секунды, а полоскам нужна доля: так они не зависят от длины бита.
  const position = active && duration > 0 ? currentTime / duration : 0;

  function listen() {
    const next = trackFromBeat(beat);
    if (!next) return;
    if (active) toggle();
    else play(next);
  }

  return (
    <article className={cn("surface surface-interactive group flex h-full flex-col", active && "border-signal/60")}>
      <div className="relative aspect-square overflow-hidden">
        {beat.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={beat.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="cover-grid relative size-full bg-ink-3">
            <span aria-hidden className="absolute top-3 right-3 size-2 bg-signal" />
            <span aria-hidden className="absolute inset-0 grid place-items-center">
              <span className="size-10 border border-line-2" />
            </span>
            <span className="label absolute top-3 left-4 text-mute">{t("feed.noCover")}</span>
          </div>
        )}

        {/* Затемнение только снизу: даёт читаемую подпись и не съедает обложку. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/85 to-transparent" />

        {playable ? (
          <>
            <button
              type="button"
              onClick={listen}
              aria-label={active ? t("player.pause") : t("player.play")}
              aria-pressed={active}
              className={cn(
                "absolute bottom-3 left-3 grid size-12 place-items-center rounded-full border backdrop-blur-md transition-all duration-200 ease-out",
                active
                  ? "border-signal bg-signal text-ink"
                  : "border-line-2 bg-ink/75 text-paper hover:scale-105 hover:border-signal hover:bg-signal hover:text-ink",
              )}
            >
              {active ? (
                <svg viewBox="0 0 10 12" aria-hidden className="h-4 w-3.5 fill-current">
                  <path d="M0 0h3.5v12H0zM6.5 0H10v12H6.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 12" aria-hidden className="h-4 w-3.5 fill-current">
                  <path d="M0 0l10 6-10 6z" />
                </svg>
              )}
            </button>

            <div
              className="wave absolute right-3 bottom-4 left-[4.25rem] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              data-active={active}
              aria-hidden
            >
              {bars.map((height, index) => (
                <span
                  key={index}
                  className="wave-bar"
                  style={{
                    height: `${active ? Math.max(20, Math.min(100, height * (position > index / bars.length ? 1 : 0.45))) : height * 0.4}%`,
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <span className="label absolute bottom-3 left-3 border border-line bg-ink/80 px-2.5 py-1.5 text-mute">
            {t("feed.noAudio")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="flex flex-col gap-2">
          <Link href={`/beats/${beat.id}`} className="group/title focusable w-fit">
            <h3 className="font-display text-lg leading-tight tracking-tight text-paper uppercase transition-colors group-hover/title:text-signal">
              {beat.title}
            </h3>
          </Link>

          <Link
            href={`/beatmakers/${beat.username}`}
            className="flex w-fit items-center gap-2 transition-opacity hover:opacity-75 focusable"
          >
            <Avatar username={beat.username} src={beat.avatarUrl} size="xs" />
            <span className="label text-mute">@{beat.username}</span>
          </Link>
        </div>

        <div className="mono flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-mute">
          <span>{beat.bpm} BPM</span>
          {beat.musicalKey ? (
            <>
              <span aria-hidden className="text-line-2">
                /
              </span>
              <span>{beat.musicalKey}</span>
            </>
          ) : null}
          {ownPlays > 0 ? (
            <>
              <span aria-hidden className="text-line-2">
                /
              </span>
              <span>
                {ownPlays} {t("posts.playsShort")}
              </span>
            </>
          ) : null}
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

        {/*
          Тарифы — главный выбор на карточке, поэтому они идут дороже тегов и
          стоят на своём фоне: видно, где товар заканчивается.
        */}
        <div className="rows mt-auto">
          {tiers.map((tier) => (
            <Link
              key={tier.key}
              href={`/beats/${beat.id}`}
              className="row flex items-baseline justify-between gap-3 transition-colors hover:bg-ink-3 focusable"
            >
              <span className="label text-mute">{tier.label}</span>
              <span className="font-mono text-[13px] text-paper tabular-nums">
                {formatMoney(tier.value as number, beat.currency)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}