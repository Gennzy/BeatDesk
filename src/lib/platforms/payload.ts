import { hashtagList, priceLine, typeBeatLine } from "@/lib/beat-promo";
import type { Prices } from "@/lib/prices";

export type PublishBeat = {
  id: string;
  title: string;
  artists: string[];
  bpm: number;
  musicalKey: string;
  tags: string[];
  prices: Prices;
  currency?: string;
  username: string;
  mp3Url: string | null;
  coverUrl: string | null;
};

export type PublishPayload = {
  beat: PublishBeat;
  /** публичная ссылка на страницу бита в BeatDesk */
  beatUrl: string;
  /** текст поста под площадку */
  message: string;
  /** файл, который площадка умеет принять (mp3) */
  audioUrl: string | null;
  coverUrl: string | null;
};

export type PublishResult = {
  ok: boolean;
  externalUrl?: string;
  error?: string;
  /** что реально отправили — для истории */
  detail?: Record<string, unknown>;
};

export function buildPayload(beat: PublishBeat, siteUrl: string): PublishPayload {
  const beatUrl = `${siteUrl}/beats/${beat.id}`;
  const prices = priceLine(beat);

  const message = [
    `${beat.title} — ${typeBeatLine(beat).toLowerCase()}`,
    `${beat.bpm} BPM · ${beat.musicalKey}`,
    prices ? `Продажа: ${prices}` : null,
    beat.tags.length > 0 ? hashtagList(beat) : null,
    `Слушать: ${beatUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { beat, beatUrl, message, audioUrl: beat.mp3Url, coverUrl: beat.coverUrl };
}
