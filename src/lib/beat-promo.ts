import { formatMoney } from "@/lib/currency";
import type { Prices } from "@/lib/prices";

/**
 * Имена файлов и тексты для постов.
 *
 * Раньше это был `distribution.ts` — модуль, который готовил поля и имена
 * файлов для чужих площадок. Сами площадки убраны, а сами функции остались:
 * имена файлов по-прежнему нужны при отдаче покупателю, а строки с тегами и
 * ценами — для постов в Telegram, ВКонтакте и на YouTube.
 */

export type BeatMeta = {
  artists: string[];
  bpm: number;
  musicalKey: string;
  tags: string[];
  prices: Prices;
  currency?: string;
};

export type PromoBeat = BeatMeta & {
  id: string;
  title: string;
  audioUrl: string | null;
  ownerUsername: string;
};

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function translit(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9#]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** F# minor → F#m, C major → C */
export function keyShort(key: string): string {
  const [note, mode] = key.split(" ");

  return mode === "minor" ? `${note}m` : note;
}

/**
 * Тональность для имени файла. Решётку писать нельзя: в URL это якорь,
 * а маленькая b читается как «бемоль». Поэтому знаки пишем словом.
 */
export function keyForFile(key: string): string {
  const [note, mode] = key.split(" ");
  const safeNote = note.replace(/#/g, "sharp").replace(/b/g, "flat");

  return mode === "minor" ? `${safeNote}m` : safeNote;
}

export function fileBase(beat: PromoBeat): string {
  return [translit(beat.title), beat.bpm, keyForFile(beat.musicalKey)].filter(Boolean).join("_");
}

export type FileName = { label: string; name: string };

/** Имена файлов, которые покупатель получит по уровням лицензии. */
export function fileNames(beat: PromoBeat): FileName[] {
  const base = fileBase(beat);

  return [
    { label: "tagged", name: `${base}_tagged.mp3` },
    { label: "untagged", name: `${base}_untagged.mp3` },
    { label: "wav", name: `${base}.wav` },
    { label: "trackout", name: `${base}_trackout.zip` },
  ];
}

/** Цены по уровням одной строкой: «MP3 500 ₽ · Track Out 2 500 ₽». */
export function priceLine(beat: BeatMeta): string {
  const money = (value: number | null) => (value ? formatMoney(value, beat.currency ?? "RUB") : null);

  return [
    money(beat.prices.mp3) ? `MP3 ${money(beat.prices.mp3)}` : null,
    money(beat.prices.wav) ? `MP3+WAV ${money(beat.prices.wav)}` : null,
    money(beat.prices.trackout) ? `Track Out ${money(beat.prices.trackout)}` : null,
    money(beat.prices.exclusive) ? `Эксклюзив ${money(beat.prices.exclusive)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function typeBeatLine(beat: BeatMeta): string {
  return beat.artists.length > 0 ? `Type Beat ${beat.artists.join(", ")}` : "Type Beat";
}

/**
 * Теги для поста.
 *
 * Артисты сюда не идут: они уже названы строкой выше, а повтор превращает
 * подпись в свалку имён.
 */
export function hashtagList(beat: BeatMeta): string {
  return beat.tags.map((tag) => `#${tag}`).join(" ");
}
