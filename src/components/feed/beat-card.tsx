"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { Avatar } from "@/components/ui/avatar";
import { ProgressLine } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { BeatReactions } from "@/components/feed/beat-reactions";
import { formatMoney } from "@/lib/currency";
import { SALE_STATE_LABELS } from "@/lib/sales/state";
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
/**
 * Карточка бита.
 *
 * signedIn передаётся явно, а не берётся из сессии на клиенте: карточку
 * рисует и серверная страница ленты, и профиль, и без признака входа кнопки
 * реакций молча не работали бы у вошедшего.
 */
export function BeatCard({
  beat,
  signedIn = false,
  isOwn = false,
}: {
  beat: FeedBeat;
  signedIn?: boolean;
  isOwn?: boolean;
}) {
  const { t } = useI18n();
  const { track, isPlaying, play, toggle, plays, currentTime, duration } = usePlayer();
  const ref = useRef<HTMLElement | null>(null);

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

  const artists = useMemo(
    () => beat.typeBeatArtists.map((artist) => artist.trim()).filter(Boolean),
    [beat.typeBeatArtists],
  );

  /** Теги, которые не повторяют артистов строкой выше. */
  const looseTags = useMemo(() => {
    const told = new Set(artists.map((artist) => artist.toLowerCase()));
    return beat.tags.filter((tag) => !told.has(tag.toLowerCase())).slice(0, 3);
  }, [artists, beat.tags]);

  /*
   * Цена «от» — самая дешёвая из доступных уровней. На карточке нужна одна
   * цифра, чтобы сравнивать биты между собой, а не изучать четыре позиции.
   */
  const cheapest = useMemo(
    () => (tiers.length === 0 ? null : Math.min(...tiers.map((tier) => tier.value as number))),
    [tiers],
  );

  function listen() {
    const next = trackFromBeat(beat);
    if (!next) return;
    if (active) toggle();
    else play(next);
  }

  /*
   * Показ засчитывается, когда карточка реально попала в поле зрения, а не
   * просто отрисовалась: сетка на twelve карточек и первый экран показывают
   * пять, и разница не косметическая — по ней видно, как бит уходит дальше
   * первого экрана.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void fetch(`/api/beats/${beat.id}/view?kind=impressions`, { method: "POST", keepalive: true }).catch(() => {});
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [beat.id]);

  return (
    <article
      ref={ref}
      className={cn("surface surface-interactive group flex h-full flex-col", active && "border-signal/50")}
    >
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
            // Размеры заданы: без них сетка прыгает, пока грузится картинка,
            // и страница выглядит дёрганой особенно на медленной сети.
            width={1200}
            height={1200}
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

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <Link href={`/beats/${beat.id}`} className="group/title focusable w-fit">
          <h3 className="font-display text-[17px] leading-tight tracking-tight text-paper uppercase transition-colors">
            {beat.title}
          </h3>
        </Link>

        <Link
          href={`/beatmakers/${beat.username}`}
          className="flex w-fit items-center gap-2 transition-opacity hover:opacity-75 focusable"
        >
          <Avatar username={beat.username} src={beat.avatarUrl} size="xs" />
          <span className="label text-mute">@{beat.username}</span>

          {beat.sellerLevel >= 3 ? (
            <span
              title={t("feed.levelHint")}
              className="flex items-center gap-1 rounded-pill border border-line px-1.5 py-0.5 text-[10px] text-mute"
            >
              <span aria-hidden className="size-1 bg-signal" />
              <span className="font-mono tabular-nums">{beat.sellerLevel}</span>
            </span>
          ) : null}
        </Link>

        <div className="mono flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-mute">
          <span>{beat.bpm} BPM</span>
          {beat.musicalKey ? (
            <>
              <span aria-hidden className="text-mute/40">
                ·
              </span>
              <span>{beat.musicalKey}</span>
            </>
          ) : null}
          {ownPlays > 0 ? (
            <>
              <span aria-hidden className="text-mute/40">
                ·
              </span>
              <span>
                {ownPlays} {t("posts.playsShort")}
              </span>
            </>
          ) : null}
        </div>

        {/*
          Чей это бит идёт плашками, а не строкой: перечисление через запятую
          («polo g, lil tjay, lil durk, tikotheceo») превращалось в кашу, а
          плашки читаются как теги, чем они и являются для покупателя.
        */}
        {artists.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {artists.slice(0, 3).map((artist) => (
              <li key={artist} className="chip">
                {artist}
              </li>
            ))}
            {artists.length > 3 ? (
              <li className="px-1 text-[11px] text-mute/70">+{artists.length - 3}</li>
            ) : null}
          </ul>
        ) : null}

        {looseTags.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {looseTags.map((tag) => (
              <li key={tag} className="chip">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <BeatReactions
            beatId={beat.id}
            initialLikes={beat.likes}
            initialSaves={beat.saves}
            initialLiked={beat.liked}
            initialSaved={beat.saved}
            signedIn={signedIn}
            isOwn={isOwn}
          />

          {/*
            На карточке одна цена, а не таблица уровней. Таблица занимала
            половину высоты и читалась как список услуг: покупатель в ленте
            выбирает, слушать или нет, а состав уровней решается на странице
            бита, где для этого есть место.
          */}
          {cheapest !== null ? (
            <span className="flex items-baseline gap-1.5">
              <span className="label text-mute/70">{t("beat.from")}</span>
              <span className="font-mono text-base text-paper tabular-nums">
                {formatMoney(cheapest, beat.currency)}
              </span>
            </span>
          ) : (
            <span className="label text-mute">{SALE_STATE_LABELS[beat.saleState]}</span>
          )}
        </div>

        {/* Что входит в цену: одна короткая строка вместо четырёх строк. */}
        {tiers.length > 1 ? (
          <p className="label text-mute/70">
            {tiers.map((tier) => tier.label).join(" · ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}