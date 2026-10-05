/**
 * Разбор ответа модели.
 *
 * Модель почти всегда присылает JSON с обёрткой в виде ```json … ``` или
 * с болтовнёй вокруг. Раньше такие ответы падали бы в интерфейс как
 * нечитаемый текст, поэтому разбор здесь, а не в компоненте.
 */

export type BeatSuggestion = {
  /** Варианты названия: один звучит заголовком, другие — варианты. */
  titles: string[];
  description: string;
  tags: string[];
  /** Что модель предлагает изменить в оформлении, по-человечески. */
  notes: string[];
};

/** Сколько вариантов названия показываем: больше — шум, один — не выбор. */
export const TITLES_LIMIT = 3;
/** Сколько тегов в карточке: площадки читают первые несколько. */
export const TAGS_LIMIT = 8;

const asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];

const asText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Привести ответ модели к предсказуемому виду.
 *
 * Возвращает null, если разобрать нечего: лучше показать «не получилось»,
 * чем подставить в форму пустые поля и дать сохранить бит с пустым названием.
 */
export function parseSuggestion(raw: string): BeatSuggestion | null {
  const text = extractJson(raw);
  if (!text) return null;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;

  // Название приходит и списком, и одной строкой — оба вида встречаются.
  const rawTitles = record.titles ?? record.title;
  const titles = (typeof rawTitles === "string" ? [rawTitles] : asArray(rawTitles))
    .map((title) => title.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, TITLES_LIMIT);

  const description = asText(record.description, 1200);
  // Схлопываем по регистру: площадка считает #Trap и #trap одним тегом.
  const seen = new Set<string>();
  const tags = asArray(record.tags)
    .map((tag) => tag.trim().slice(0, 24))
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .slice(0, TAGS_LIMIT);
  const notes = asArray(record.notes).map((note) => note.trim().slice(0, 200)).filter(Boolean);

  // Название и описание обязательны: без них подсказка нечего подставлять.
  if (titles.length === 0 || description.length === 0) return null;

  return { titles, description, tags, notes };
}

/**
 * Вытащить сам JSON из ответа.
 *
 * Сначала ищем объект в фигурных скобках: так спокойнее, чем чинить
 * обёртку ```json, потому что модель может добавить и её, и объяснение
 * после.
 */
function extractJson(raw: string): string | null {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return null;
}
