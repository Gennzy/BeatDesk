"use client";

import Link from "next/link";

import { usePlayer } from "@/components/player/player-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShortLinkButton } from "@/components/beats/short-link-button";
import { cn } from "@/lib/cn";
import { SALE_STATE_LABELS, canPutOnSale, type SaleState } from "@/lib/sales/state";
import { useI18n } from "@/lib/i18n/provider";

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
  /** Состояние в продаже: витрина, придержан или ушёл эксклюзивом. */
  saleState: SaleState;
};

/**
 * Шапка карточки товара.
 *
 * Раньше здесь стояли цены и подпись «тексты и имена файлов ниже», но блока
 * под ними уже нет: внешние витрины убрали. Осталось обещание, которого
 * никто не выполнял. Теперь шапка показывает состояние продажи, а уровни и
 * цену — блок покупки ниже: покупателю не нужно знать про публикацию в
 * каналы, а битмейкеру — про копирование строки цен.
 */
export function BeatHero({ beat, isOwner }: { beat: BeatHeroData; isOwner: boolean }) {
  const { t } = useI18n();
  const { track, isPlaying, play } = usePlayer();

  const active = track?.id === beat.id && isPlaying;
  const playable = Boolean(beat.audioUrl);
  const sellable = canPutOnSale(beat.saleState);

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
            <span aria-hidden className={cn("size-1.5", sellable ? "bg-signal" : "bg-amber")} />
            <span className="label text-mute">{SALE_STATE_LABELS[beat.saleState]}</span>
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

        <p className="max-w-[62ch] text-sub text-mute">
          {isOwner ? t("share.noteOwner") : t("share.noteBuyer")}
        </p>

        {isOwner ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <Link href={`/beats/${beat.id}/edit`}>
              <Button size="md">{t("edit.title")}</Button>
            </Link>
            <Link href={`/beats/${beat.id}/publish`}>
              <Button size="md" variant="ink">
                {t("publish.openButton")}
              </Button>
            </Link>
          </div>
        ) : null}

        {isOwner ? <ShortLinkButton path={`/beats/${beat.id}`} /> : null}
      </div>
    </div>
  );
}