"use client";

import Link from "next/link";
import { useMemo } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { Avatar } from "@/components/ui/avatar";
import { ProgressLine } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import type { FeedBeat } from "@/lib/feed";
import { PRICE_KEYS, priceLabel } from "@/lib/prices";
import { trackFromBeat } from "@/lib/player";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Карточка товара в ленте.
 *
 * Глубина карточке даёт наведение: рамка светлеет, обложка чуть приближается,
 * под карточкой появляется тень. Раньше поверх этого ещё наезжал сдвиг на
 * два пикселя и увеличение обложки на четыре процента — два трансформа
 * складывались, и при быстром движении мыши карточка дёргалась. Осталось
 * одно движение, и оно читается как «живая», а не как «сломалась».
 *
 * Полоска прогресса идёт по нижнему краю обложки, а не поверх неё
 * декорациями: видно, где играет, и обложка остаётся обложкой.
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

  function listen() {
    const next = trackFromBeat(beat);
    if (!next) return;
    if (active) toggle();
    else play(next);
  }

  return (
    <article className={cn("surface surface-interactive group flex h-full flex-col", active && "border-signal/50")}>
      <div className="relative aspect-square overflow-hidden bg-ink-3">
        {/*
          Ссылка на обложке идёт выше картинки намеренно. При наведении картинка
          получает transform, а такой элемент рисуется поверх соседей без
          z-index: клик по обложке переставал попадать в ссылку ровно в тот
          момент, когда человек наводил мышь.
        */}
        <Link href={`/beats/${beat.id}`} tabIndex={-1} aria-hidden className="absolute inset-0 z-10 focusable" />
        {beat.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={beat.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="cover-grid relative size-full">
            <span aria-hidden className="absolute top-3 right-3 size-2 bg-signal" />
            <span aria-hidden className="absolute inset-0 grid place-items-center">
              <span className="size-10 border border-line-2" />
            </span>
            <span className="label absolute top-3 left-4 text-mute">{t("feed.noCover")}</span>
          </div>
        )}

        {/* Затемнение снизу нужно только под кнопкой: без него кнопка
            «висит» на светлой обложке и теряется. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/80 to-transparent" />

        {playable ? (
          <button
            type="button"
            onClick={listen}
            aria-label={active ? t("player.pause") : t("player.play")}
            aria-pressed={active}
            className={cn(
              "absolute bottom-3 left-3 z-20 grid size-12 place-items-center rounded-full border backdrop-blur-sm transition-colors duration-200",
              active
                ? "border-signal bg-signal text-ink"
                : "border-line-2 bg-ink/80 text-paper hover:border-signal hover:bg-signal hover:text-ink",
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
        ) : (
          <span className="label absolute bottom-3 left-3 z-20 rounded-full border border-line bg-ink/85 px-3 py-1.5 text-mute">
            {t("feed.noAudio")}
          </span>
        )}

        {active ? (
          <span className="absolute inset-x-0 bottom-0 z-20 block">
            <ProgressLine value={duration > 0 ? currentTime / duration : 0} label={t("player.progress")} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
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
              <span aria-hidden className="text-mute/50">
                /
              </span>
              <span>{beat.musicalKey}</span>
            </>
          ) : null}
          {ownPlays > 0 ? (
            <>
              <span aria-hidden className="text-mute/50">
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
          Тарифы прижаты к низу и отделены волосяной линией: без линии пустое
          место между тегами и ценой читалось как недоделанная вёрстка.
        */}
        {tiers.length > 0 ? (
          <ul className="rows mt-auto border-t border-line pt-px">
            {tiers.map((tier) => (
              <li
                key={tier.key}
                className="row flex items-baseline justify-between gap-3 py-2 transition-colors hover:bg-ink-3"
              >
                <span className="label text-mute">{tier.label}</span>
                <span className="font-mono text-[13px] text-paper tabular-nums">
                  {formatMoney(tier.value as number, beat.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}