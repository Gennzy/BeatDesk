/**
 * Словарь для тегов YouTube.
 *
 * Теги у сервисов публикации битов устроены не списком, а кластерами: на
 * каждый «атом» — артист, настроение, жанр — приходится сразу несколько
 * форм, потому что люди ищут по-разному. «madk1d type beat», «free madk1d
 * type beat», «madk1d type beat free for profit» — это один атом и три
 * разных запроса, которые иначе не нашлись бы никогда.
 *
 * Здесь живут только слова и правила. Порядок и лимиты — в metadata.ts.
 */

/**
 * Настроения бита.
 *
 * Это самый доходный источник длинного хвоста: один и тот же бит находят по
 * «dark type beat», «melodic type beat» и «chill type beat», и ни один из
 * этих запросов не приходит из названия или жанра.
 *
 * Список короткий намеренно. Длинный словарь даёт сотни тегов, из которых
 * пятнадцать влезут в лимит YouTube, а выбирать придётся по порядку, а не по
 * смыслу: девять настроений на бит — это уже по одному на группу запроса.
 */
export const MOODS = [
  "dark",
  "melodic",
  "emotional",
  "aggressive",
  "chill",
  "smooth",
  "heavy",
  "dreamy",
  "sad",
  "hype",
  "bouncy",
  "hard",
] as const;

/**
 * Дополнительные слова к жанру.
 *
 * «alternative rock» и «rock» ищут по-разному, и один жанр в бите даёт оба
 * запроса. Не изобретаем: это второй уровень вложенности, который встречается
 * чаще всего.
 */
export const GENRE_ALIASES: Record<string, string[]> = {
  trap: ["trap", "rap beat", "alternative trap"],
  drill: ["drill", "rap beat"],
  "boom-bap": ["boom bap", "rap beat"],
  hiphop: ["hip hop", "boom bap", "rap beat"],
  "hip-hop": ["hip hop", "boom bap", "rap beat"],
  dark: ["dark", "dark trap"],
  ambient: ["ambient", "chill"],
  rock: ["rock", "alternative rock"],
  pop: ["pop", "melodic"],
  jerk: ["jerk"],
  rage: ["rage"],
  opium: ["opium"],
  other: ["trap"],
};

/**
 * Год.
 *
 * Публикуют много, и год в тегах ловит свежий спрос: «type beat 2026».
 * Прошлый год оставлен один — спрос на него есть, но он уже не про биты,
 * которые продаются.
 */
export const TAG_YEARS = [String(new Date().getFullYear()), String(new Date().getFullYear() - 1)];

/**
 * «Type beat» кириллицей.
 *
 * Русскоязычные битмейкеры ищут «тайп бит» и «тайп біт» — латиницей, но
 * кириллическими буквами. Это не перевод: это другой запрос, и в латинском
 * написании его не находят.
 *
 * Берётся только первый вариант: «тайп біт» и «тайп бит» — один и тот же
 * запрос двумя написаниями, и второй съедал лимит, не дав влезти настроению.
 */
export const TYPE_BEAT_CYRILLIC = "тайп біт";

/** «Минор» кириллицей: ключ тональности как настроение. */
export const MINOR_CYRILLIC = "минус";

/**
 * Ключ тональности превращается в настроение.
 *
 * Минус звучит мрачно, и человек, который не знает нот, ищет бит не по
 * «F minor», а по «dark» или «минус». Слово «minor» в тегах бесполезно:
 * так не ищет никто.
 */
export function moodFromKey(key: string): string[] {
  return /minor|минор/i.test(key) ? ["dark", "melodic"] : ["bright", "melodic"];
}

/**
 * Словарь «исполнитель, настроение» для конкретного бита.
 *
 * Артисты идут первыми и без сокращений: «madk1d type beat» ищут целиком,
 * а вот «prod. Gennzy» — уже с именем. Настроения добавляются после них и
 * берутся из тегов бита: автор знает про свой бит больше любого словаря.
 */
export function atomsOf(artists: string[], producer: string, tags: string[]): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const clean = value?.trim();

    if (clean && !out.includes(clean)) out.push(clean);
  };

  for (const artist of artists) push(artist);
  push(producer);

  for (const tag of tags) push(tag);

  return out;
}

/** Слова из слага жанра: «boom-bap» → «boom bap». */
export function genreWords(genre: string): string[] {
  const base = genre.replace(/[-_]+/g, " ").trim().toLowerCase();
  const alias = GENRE_ALIASES[genre] ?? GENRE_ALIASES[base];

  return alias ? [base, ...alias] : [base];
}

/** Кириллица? Транслитерация в тегах не нужна — авторские слова остаются как есть. */
export const isCyrillic = (value: string): boolean => /\p{Script=Cyrillic}/u.test(value);
