"use client";

import Link from "next/link";
import { useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ShortLinkButton } from "@/components/beats/short-link-button";
import { formatMoney } from "@/lib/currency";
import { PRICE_KEYS, priceHint, priceLabel } from "@/lib/prices";
import { useI18n } from "@/lib/i18n/provider";
import type { Prices } from "@/lib/prices";

export type BeatHeroData = {
  id: string;
  title: string;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  bpm: number;
  musicalKey: string;
  tags: string[];
  prices: Prices;
  currency?: string;
  formats: string[];
};

/**
 * Уровни берём из общего списка цен, а не пишем здесь свои.
 *
 * Список был продублирован, и когда появился Track Out, карточка продолжила
 * бы показывать три уровня из четырёх — тихо и без ошибок.
 */

function money(value: number, currency?: string): string {
  return formatMoney(value, currency);
}

export function BeatHero({ beat, isOwner }: { beat: BeatHeroData; isOwner: boolean }) {
  const { t } = useI18n();
  const { currency } = beat;
  const { track, isPlaying, play } = usePlayer();
  const [copied, setCopied] = useState(false);

  const active = track?.id === beat.id && isPlaying;
  const playable = Boolean(beat.audioUrl);
  const tiers = PRICE_KEYS.map((key) => ({
    key,
    label: priceLabel[key],
    hint: priceHint[key],
    value: beat.prices[key],
  })).filter((tier) => tier.value !== null);

  async function copyPrices() {
    const line = tiers.map((tier) => `${tier.label} ${money(tier.value as number, currency)}`).join(" · ");
    try {
      await navigator.clipboard.writeText(line);
    } catch {
      const area = document.createElement("textarea");
      area.value = line;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-14">
      <div className="flex flex-col gap-4">
        <div className="group relative aspect-square overflow-hidden border border-line bg-ink-2">
          {beat.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={beat.coverUrl}
              alt=""
              className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="cover-grid relative size-full">
              <span className="label absolute top-4 left-4 text-mute">{t("feed.noCover")}</span>
              <span aria-hidden className="absolute top-4 right-4 size-2 bg-signal" />
            </div>
          )}

          {playable ? (
            <button
              type="button"
              onClick={() =>
                play({
                  id: beat.id,
                  title: beat.title,
                  username: beat.username,
                  avatarUrl: beat.avatarUrl,
                  coverUrl: beat.coverUrl,
                  audioUrl: beat.audioUrl as string,
                  bpm: beat.bpm,
                  musicalKey: beat.musicalKey,
                })
              }
              aria-label={active ? t("player.pause") : t("player.play")}
              className={cn(
                "absolute bottom-4 left-4 grid size-14 place-items-center border transition-colors duration-150",
                active
                  ? "border-signal bg-signal text-ink"
                  : "border-line bg-ink/85 text-paper backdrop-blur-sm hover:border-signal hover:bg-signal hover:text-ink",
              )}
            >
              {active ? (
                <svg viewBox="0 0 10 12" aria-hidden className="h-4 w-4 fill-current">
                  <path d="M0 0h3.5v12H0zM6.5 0H10v12H6.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 12" aria-hidden className="h-4 w-4 fill-current">
                  <path d="M0 0l10 6-10 6z" />
                </svg>
              )}
            </button>
          ) : (
            <span className="label absolute bottom-4 left-4 border border-line bg-ink/85 px-3 py-2 text-mute">
              {t("feed.noAudio")}
            </span>
          )}
        </div>

      </div>

      <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="size-1.5 bg-signal" />
            <span className="label text-mute">{t("share.title")}</span>
            <Link
              href={`/beatmakers/${beat.username}`}
              className="label ml-auto text-mute underline-offset-4 transition-colors hover:text-paper hover:underline"
            >
              @{beat.username}
            </Link>
          </div>

          <h1 className="font-display text-3xl leading-[1.05] font-black tracking-tight text-paper uppercase lg:text-5xl">
            {beat.title}
          </h1>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{beat.bpm} BPM</Badge>
            <Badge tone="outline">{beat.musicalKey}</Badge>
            {beat.tags.slice(0, 5).map((tag) => (
              <span key={tag} className="label text-mute">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        <p className="max-w-[62ch] text-sub text-mute">{t("share.note")}</p>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Link href={`/beats/${beat.id}/publish`}>
            <Button size="md">{t("publish.openButton")}</Button>
          </Link>
          {isOwner ? (
            <Link href={`/beats/${beat.id}/edit`}>
              <Button size="md" variant="ink">
                {t("edit.title")}
              </Button>
            </Link>
          ) : null}
          <span className="label ml-auto hidden text-mute sm:inline">{t("share.hintPlatforms")}</span>
        </div>

        {isOwner ? <ShortLinkButton path={`/beats/${beat.id}`} /> : null}

        {tiers.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
              <span className="label text-mute">{t("share.prices")}</span>
              <button
                type="button"
                onClick={() => void copyPrices()}
                className="label text-mute transition-colors hover:text-signal"
              >
                {copied ? t("share.copied") : t("share.copyPrices")}
              </button>
            </div>
            <ul className="flex flex-col gap-px">
              {tiers.map((tier) => (
                <li
                  key={tier.key}
                  className="flex items-baseline justify-between gap-4 bg-ink-2 px-4 py-3"
                >
                  <span className="flex flex-col">
                    <span className="label text-paper">{tier.label}</span>
                    <span className="text-xs text-mute">{tier.hint}</span>
                  </span>
                  <span className="font-mono text-sm text-amber">{money(tier.value as number, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {beat.formats.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1 text-mute">{t("share.formats")}</span>
            {beat.formats.map((format) => (
              <Badge key={format} tone="outline">{format}</Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}