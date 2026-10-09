import { isCurrency, type CurrencyCode } from "@/lib/currency";
import { MUSICAL_KEYS } from "./keys";

import { emptyPrices, type Prices } from "@/lib/prices";

export type { Prices };

export const MAX_TITLE_LENGTH = 120;
export const MAX_TAGS = 12;

/**
 * Короче двух символов тега нет.
 *
 * На карточке «#G» стоял рядом с настоящими тегами: он ничего не ищет, но
 * площадка показывает его как жанр и размывает выдачу.
 */
export const MIN_TAG_LENGTH = 2;
export const MAX_TAG_LENGTH = 24;
export const MAX_ARTISTS = 10;
export const MAX_PRICE = 10_000_000;

export type BeatDraft = {
  title?: unknown;
  typeBeatArtists?: unknown;
  bpm?: unknown;
  musicalKey?: unknown;
  tags?: unknown;
  prices?: unknown;
  currency?: unknown;
  genre?: unknown;
};

export type ValidatedBeat = {
  title: string;
  type_beat_artists: string[];
  bpm: number;
  key: string;
  tags: string[];
  prices: Prices;
  currency: CurrencyCode;
  /** Жанр из закрытого списка или null, если бит не жанровый. */
  genre: string | null;
};

const TAG_PATTERN = /^[\p{L}\p{N} _-]+$/u;
const KEY_ALIASES: Record<string, string> = {
  minor: "minor",
  major: "major",
  m: "minor",
  min: "minor",
  moll: "minor",
  мин: "minor",
  мажор: "major",
  maj: "major",
};

/** Тональность приводим к тому виду, который понимает остальной код: «F♯ minor». */
export function normalizeKey(input: unknown): string | null {
  const raw = String(input ?? "")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b");

  /*
   * Лад принимаем в любом регистре: дальше он всё равно приводится к
   * нижнему. Раньше класс был только строчный, и «F# MAJOR» не разбирался
   * вовсе — человек терял тональность молча, без всякой ошибки.
   */
  const match = /^([A-Ga-g])\s*(#|b)?\s*([A-Za-zа-яЁё]{1,7})?$/.exec(raw);
  if (!match) return null;

  const root = match[1].toUpperCase();
  const accidental = match[2] ?? "";
  const quality = match[3] ? (KEY_ALIASES[match[3].toLowerCase()] ?? null) : null;

  if (!quality) return null;
  if (accidental === "#" && !["C", "D", "F", "G", "A"].includes(root)) return null;
  if (accidental === "b" && !["C", "D", "F", "G", "A"].includes(root)) return null;

  const key = `${root}${accidental === "b" ? "b" : accidental} ${quality}`;

  return MUSICAL_KEYS.includes(key) ? key : null;
}

/**
 * Теги живут без решётки: #140 из свободного ввода — это не тег, а темп.
 *
 * Отсеиваем и однобуквенные: в карточке бита «#G» занимает место рядом с
 * настоящими тегами и ничего не ищет. Площадка покажет его как отдельный
 * жанр, и выдача станет чуть менее точной. Раньше такое отсеивали только
 * при отправке в телеграм, а в самой карточке мусор оставался.
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  for (const raw of input) {
    const tag = String(raw).replace(/^#/, "").trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (!tag || !TAG_PATTERN.test(tag)) continue;
    if (/^\d{1,3}$/.test(tag)) continue;
    // Одна буква — это опечатка или остаток имени артиста, а не тег.
    if (tag.length < MIN_TAG_LENGTH) continue;
    seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }

  return [...seen];
}

/**
 * Привести цены к виду.
 *
 * Правила проверки остаются здесь, а не в prices.ts: там только форма,
 * а потолок цены — это правило валидации бита.
 */
export function normalizePrices(input: unknown): Prices {
  if (typeof input !== "object" || input === null) return emptyPrices();

  const source = input as Record<string, unknown>;

  const read = (key: string): number | null => {
    const value = source[key];
    if (value === null || value === undefined || value === "") return null;

    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_PRICE) return null;

    return parsed === 0 ? null : parsed;
  };

  return {
    mp3: read("mp3"),
    // bundle — историческое имя уровня WAV.
    wav: read("wav") ?? read("bundle"),
    trackout: read("trackout"),
    exclusive: read("exclusive"),
  };
}

/**
 * Валидация черновика бита. Возвращает нормализованные данные
 * или список причин, по которым бит создавать нельзя.
 */
export function validateBeat(draft: BeatDraft): { ok: true; value: ValidatedBeat } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const title = String(draft.title ?? "").trim().replace(/\s+/g, " ");

  if (title.length < 2) errors.push("Название слишком короткое");
  if (title.length > MAX_TITLE_LENGTH) errors.push(`Название длиннее ${MAX_TITLE_LENGTH} символов`);

  const bpm = Math.round(Number(draft.bpm));

  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 300) errors.push("BPM должен быть от 40 до 300");

  const musicalKey = normalizeKey(draft.musicalKey);

  if (!musicalKey) errors.push("Тональность не распознана");

  const key = musicalKey as string;

  /*
   * Жанр обязателен, и это проверяется здесь, а не только формой.
   *
   * Форму можно не заполнить, а сервер вызвать напрямую. Жанр при этом —
   * не украшение: без него бит выпадает из фильтра и из подсчёта, и
   * покупатель видит площадку, на которой половина каталога не находится
   * ни в одной категории. Пустое значение — это не «не указан», это
   * «искать придётся вручную».
   */
  const genre = normalizeGenre(draft.genre);

  if (!genre) errors.push("Укажите жанр");

  const artists = Array.isArray(draft.typeBeatArtists)
    ? draft.typeBeatArtists
        .map((artist) => String(artist).trim())
        .filter(Boolean)
        .slice(0, MAX_ARTISTS)
    : [];

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      type_beat_artists: artists,
      bpm,
      key,
      tags: normalizeTags(draft.tags),
      prices: normalizePrices(draft.prices),
      // Валюта приходит строкой из формы: неизвестное значение молча
      // становится рублями, а не падает — форма могла прислать мусор.
      currency: isCurrency(draft.currency) ? draft.currency : "RUB",
      // Жанр сверяется со списком, а не принимается как есть: иначе в
      // колонке осели бы «Трэп», «TRAP» и «trap» тремя разными жанрами,
      // и фильтр по жанру молча развалился бы на три пустых вкладки.
      genre,
    },
  };
}
/**
 * Жанры витрины.
 *
 * Список повторяет миграцию 0030. Дублируется, а не читается из базы,
 * потому что проверка должна работать без запроса и без сети: форма
 * отвергает мусор до похода на сервер. Расхождение с базой видно тестами
 * сверки — при добавлении жанра правится оба места.
 */
export const GENRE_SLUGS = [
  "trap",
  "hip-hop",
  "opium",
  "dark",
  "drill",
  "rage",
  "jerk",
  "boom-bap",
  "ambient",
  "rock",
  "pop",
  "other",
] as const;

export type GenreSlug = (typeof GENRE_SLUGS)[number];

/** Жанр из формы: неизвестное значение — это «не жанровый», а не ошибка. */
export function normalizeGenre(value: unknown): GenreSlug | null {
  if (value === null || value === undefined || value === "") return null;

  const slug = String(value).trim().toLowerCase();

  return (GENRE_SLUGS as readonly string[]).includes(slug) ? (slug as GenreSlug) : null;
}
