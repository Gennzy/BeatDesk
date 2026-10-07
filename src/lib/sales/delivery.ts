/**
 * Что уровень лицензии обещает покупателю в файлах.
 *
 * Единственное место, где «tier» переводится в набор файлов. Раньше это
 * знание жило бы в маршруте выдачи, и новый уровень означал бы правку
 * маршрута: забыл — покупатель оплатил стемы и не смог их скачать.
 *
 * Ключи уровней здесь базовые: в order_items лежит `bundle`, а не `wav`.
 */

import type { TierId } from "@/lib/audio/delivery-rules";

/** Какие файлы получает покупатель по уровню. */
export type FileKind = "mp3" | "wav" | "stems";

export const TIER_FILES: Record<TierId, FileKind[]> = {
  mp3: ["mp3"],
  bundle: ["mp3", "wav"],
  trackout: ["mp3", "wav", "stems"],
  exclusive: ["mp3", "wav", "stems"],
};

/** Уровень продаётся только с этими файлами — выдача не может дать меньше. */
export function tierAllows(tier: string, kind: FileKind): boolean {
  const files = TIER_FILES[tier as TierId];

  return files?.includes(kind) ?? false;
}

/**
 * Подпись уровня для человека.
 *
 * В заказе лежит `bundle` — историческое имя уровня WAV. Показывать его
 * покупателю нельзя: человек купил «MP3 + WAV», а не слово из схемы.
 */
const LABELS: Record<TierId, string> = {
  mp3: "MP3",
  bundle: "MP3 + WAV",
  trackout: "Track Out",
  exclusive: "Эксклюзив",
};

export function tierLabel(tier: string): string {
  return LABELS[tier as TierId] ?? tier;
}

/**
 * Что человек получит на этом уровне, своими словами.
 *
 * Раньше подпись бралась из priceHint — это слова из словаря для подсказки в
 * форме: «Стемы по дорожкам». Покупатель хочет знать, что откроет после
 * оплаты: мастер в WAV, архив дорожек, превью без тега битмейкера.
 */
const FILE_LABELS: Record<FileKind, { ru: string; en: string }> = {
  mp3: { ru: "превью в MP3 без тега битмейкера", en: "MP3 preview without the beatmaker tag" },
  wav: { ru: "мастер в WAV", en: "master in WAV" },
  stems: { ru: "архив дорожек", en: "stems archive" },
};

export function tierContents(tier: string, locale: "ru" | "en" = "ru"): string[] {
  return (TIER_FILES[tier as TierId] ?? []).map((kind) => FILE_LABELS[kind][locale]);
}
