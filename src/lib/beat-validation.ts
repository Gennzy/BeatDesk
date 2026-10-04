import { isCurrency, type CurrencyCode } from "@/lib/currency";
import { MUSICAL_KEYS } from "./keys";

export type Prices = { mp3: number | null; bundle: number | null; exclusive: number | null };

export const MAX_TITLE_LENGTH = 120;
export const MAX_TAGS = 12;
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
};

export type ValidatedBeat = {
  title: string;
  type_beat_artists: string[];
  bpm: number;
  key: string;
  tags: string[];
  prices: Prices;
  currency: CurrencyCode;
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

  const match = /^([A-Ga-g])\s*(#|b)?\s*([a-zа-я]{1,7})?$/.exec(raw);
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

/** Теги живут без решётки: #140 из свободного ввода — это не тег, а темп. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  for (const raw of input) {
    const tag = String(raw).replace(/^#/, "").trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (!tag || !TAG_PATTERN.test(tag)) continue;
    if (/^\d{1,3}$/.test(tag)) continue;
    seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }

  return [...seen];
}

export function normalizePrices(input: unknown): Prices {
  if (typeof input !== "object" || input === null) {
    return { mp3: null, bundle: null, exclusive: null };
  }

  const source = input as Record<string, unknown>;

  const read = (key: keyof Prices): number | null => {
    const value = source[key];
    if (value === null || value === undefined || value === "") return null;

    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_PRICE) return null;

    return parsed === 0 ? null : parsed;
  };

  return { mp3: read("mp3"), bundle: read("bundle"), exclusive: read("exclusive") };
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
    },
  };
}